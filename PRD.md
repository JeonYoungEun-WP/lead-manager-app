# booster-lead-app — PRD (제품 요구사항 / 프로세스 명세)

> 목적: Samsung Galaxy 기기에서 상담사가 잠재고객과 통화한 녹음을 자동으로 전사·요약하고, 본인 폰과 어드민 양쪽에 확인 가능하게 하는 서비스.
>
> 이 문서는 현재 구현 기준의 **엔드투엔드 프로세스 명세**다. 스택·구조는 [CLAUDE.md](CLAUDE.md) 참조.
>
> 최종 업데이트: 2026-04-30

---

## 1. 핵심 프로세스

```
[발신/수신/미응답/부재중]
    │
    ├─► ① 통화 종료 감지
    │     ├─ Samsung OS 자동 녹음 → /Recordings/Call/*.m4a (RECORDED)
    │     ├─ TelephonyCallback OFFHOOK→IDLE → 발신 stub 즉시 검증
    │     └─ CallLog 스캔 (15분 주기) → MISSED/REJECTED/NO_ANSWER 보강
    │
    ├─► ② 매칭 — RecordingsObserver (즉시) 또는 주기 스캔
    │     ├─ 파일명/CallLog/스텁으로 전화번호 → 리드 매칭
    │     └─ 매칭되는 통화만 CallRecord 생성 (callType 분류)
    │
    ├─► ③ 처리 분기
    │     ├─ RECORDED → SttWorker: RTZR 전사 + Gemini 요약
    │     └─ 비-RECORDED → 즉시 업로드 (전사 스킵)
    │
    ├─► ④ 로컬 저장 — Room DB
    │     └─ status / callType / transcript / summary / callbackAt / uploadStatus
    │
    ├─► ⑤ 어드민 업로드 — POST /api/transcripts (X-App-Token)
    │     ├─ Idempotent: (startedAt, clientCallId, agentName) 조합
    │     └─ 실패 시 자동 재시도 (1분→5분→30분→24시간 백오프)
    │
    └─► ⑥ 폰 로컬 알림 — 재연락 약속 시각 (AlarmManager)

[어드민 뷰어 — /admin]
    └─► 리드별 그룹 + 통화 유형 배지 + 재연락 알림 탭 (20초 자동 갱신)
```

---

## 2. 단계별 상세

### 2.1 녹음 (앱 밖, Samsung OS)
- 사용자가 Samsung 전화 앱 설정에서 "모든 통화 자동 녹음" 켜야 함.
- 녹음 폴더(`/Recordings/Call/`)를 SAF(Storage Access Framework)로 앱에 권한 부여.
- 앱은 녹음에 **관여하지 않음** — 외부에서 생성된 파일만 읽기 전용 접근.

### 2.2 즉시 감지 — `RecordingsObserver` + `CallStateMonitor`
- **`RecordingsObserver`**: SAF tree URI 의 ContentObserver. 파일 변화 감지 → 8초 디바운스 → `CallFolderScanWorker` 즉시 큐잉. 통화 종료 후 ~10초 내 처리.
- **`CallStateMonitor`**: `TelephonyCallback` OFFHOOK→IDLE 전환 감지 → 발신 stub 검증 워커 즉시 큐잉.
- 15분 주기 워커는 **백업 메커니즘** 으로 유지 (Doze/배터리 절전 시).

### 2.3 폴더 스캔 — `CallFolderScanWorker`
- 트리거: 주기 15분 / RecordingsObserver / 사용자 "지금 스캔" / 부팅 후.
- 단계:
  1. **좀비 복구**: status='PROCESSING' 인 stale record → PENDING 으로 리셋.
  2. **녹음 폴더 스캔** (`.m4a`, `.amr`, `.3gp`):
     - 매칭 우선순위: AWAITING_FILE 스텁(±60분) → 파일명 숫자 → CallLog 타임스탬프 역조회.
     - 매칭되면 RECORDED CallRecord(PENDING) 생성.
  3. **CallLog 스캔** (최근 24시간):
     - duration=0 outgoing / MISSED / REJECTED 항목 중 리드 매칭되는 것만 비-RECORDED CallRecord(NO_TRANSCRIPT) 생성.
     - 중복 방지: fileUri sentinel `calllog:{date}` + `hasCallForFileUri` 가드.
  4. **리드 DB에 없는 번호는 무시** — 파일을 복사·이동·삭제하지 않음 (사생활 보호 원칙).

### 2.4 발신 즉시 검증 — `OutgoingCallVerifyWorker`
앱 '전화' 버튼으로 발신 시 stub(AWAITING_FILE) 생성 → 두 경로로 검증:
- **즉시 (CallStateMonitor)**: 통화 종료 → 3초 후 워커 발화 → CallLog 조회.
- **보험 (60초 워커)**: 즉시 감지 실패 시 fallback.

검증 결과:
- `duration > 0` (통화 연결) → stub 의 durationSec 갱신, RECORDED 유지 → 녹음 파일 도착 대기.
- `duration = 0` (미응답) → stub 변환: callType=NO_ANSWER, status=NO_TRANSCRIPT, fileUri=`calllog:{date}` → `UploadRetryWorker.enqueueImmediate` 즉시 어드민 업로드.

→ 사용자가 "녹음대기" 영구 박혀있는 stub 을 보지 않게 됨.

### 2.5 STT + 요약 — `SttWorker` (RECORDED 만)
- RTZR 호출은 **앱이 직접** (오디오는 백엔드 미경유).
- Gemini 요약은 **백엔드 프록시 경유** (API 키를 APK에 박지 않기 위해).
- 폴링: 5초 간격 최대 180회(15분).
- 좀비 복구: 워커 시작 시 status='PROCESSING' 리셋 (이중 안전망).
- 결과:
  - 성공: `setCallResult(transcript, summary)` → status=DONE.
  - 실패: status=FAILED, errorMessage 기록.
- 파생 데이터:
  - `MediaMetadataRetriever` 로 durationSec 추출 → 페이로드 포함.
  - `CallbackParser` 로 summary 마커 `[#재연락 YYYY-MM-DDTHH:MM]` 파싱 → callbackAt DB 저장 + AlarmManager 예약.

| 백엔드 엔드포인트 | 역할 |
|---|---|
| `POST /api/rtzr/token` | RTZR 액세스 토큰 발급 프록시 (X-App-Token 필요) |
| `POST /api/rtzr/summarize` | transcript → 5줄 요약 + 핵심 포인트 + callback 추출 (Gemini 2.5 Flash, SSE) |
| `POST /api/transcripts` | 어드민 업로드 (X-App-Token 필요, idempotency 검증) |
| `GET /api/transcripts` | 어드민 목록 (인증 없음 — URL 자체가 보안 layer) |
| `GET /api/transcripts/[id]` | 어드민 단건 조회 (인증 없음) |
| `GET /api/alerts` | 재연락 도래 통화 (인증 없음) |

### 2.6 어드민 업로드 — `UploadRetryWorker`
- **재시도 정책** (자동): 즉시(SttWorker) → 1분 → 5분 → 30분 → 24시간 → 영구 FAILED.
- **수동 재시도**: 통화 상세 화면 "재업로드" 버튼 → `enqueueImmediate`.
- **idempotency**: 백엔드가 (startedAt, clientCallId, agentName) 조합으로 중복 검출 → 기존 record 재사용 (`deduped: true`).
- Blob 경로 (v4 포맷): `transcripts/YYYY-MM/{startedAt}_{agent}_{phone}_{name}_{callType}_{durationSec}_{uuid}.json`
  - 메타: `encodeURIComponent + '_'→'%5F'`로 이스케이프.
  - 4계층 호환 파싱 (v4 → v3 → v2 → v1).

### 2.7 어드민 뷰어 — `/admin`
- **인증 없음** — URL 자체가 보안 layer (POST 만 X-App-Token 유지).
- **리드별 그룹 카드** (collapsible):
  - 헤더: 이름·번호·총 통화수·통화 유형 분포(녹음/미응답/부재중/거절)·최근 시각.
  - 펼치면 시간순 통화 목록 (시각·유형 배지·상담사·길이).
- **상단 필터**: 상담사 / 통화 유형 / 자동 갱신 토글 / 모두 펼치기·접기.
- **상세 패널**: 요약·전사문·통화 길이·다운로드(.txt). 비-RECORDED 는 안내 박스.
- **알림 탭**: 재연락 도래(과거/임박)/예정/시각 미정 통화 분류 표시.
- 자동 갱신 20초 (탭 숨김 시 정지, 복귀 시 즉시 1회 갱신).

### 2.8 재연락 알림 — `CallbackNotifier` (Phase 1+2)
- **Phase 1 (구조화)**: SttWorker 가 summary 의 `[#재연락 ...]` 마커 → DB 의 `callbackAt: Long?` + `tags` 컬럼에 저장 + 페이로드 포함. 어드민 alerts 가 record JSON 의 callbackAt 우선 사용.
- **Phase 2 (폰 알림)**: `AlarmManager.setExactAndAllowWhileIdle` 로 정확 알람 → `CallbackAlarmReceiver` → NotificationManager. Doze 모드 회피.
  - 알림 클릭 → `MainActivity` 가 `callId` extra → CallDetail 자동 이동 (딥링크).
  - 부팅 후 LeadApp 시작 시 미예약 미래 callback 일괄 재예약.

---

## 3. 통화 유형 (`callType`)

| 값 | 분류 기준 (Android CallLog) | 처리 경로 | 어드민 표시 |
|---|---|---|---|
| `RECORDED` | OUTGOING + duration>0 / INCOMING + 녹음 존재 | RTZR 전사 → Gemini 요약 → 업로드 | 기본 (배지 없음) |
| `NO_ANSWER` | OUTGOING + duration=0 | 즉시 업로드 (전사 스킵) | 회색 "미응답" |
| `MISSED` | MISSED_TYPE | 즉시 업로드 | 주황 "부재중" |
| `REJECTED` | REJECTED_TYPE (수신 거절) | 즉시 업로드 | 빨강 "거절" |

> 참고: 발신 측에서 상대가 거절한 케이스는 Android API 한계로 NO_ANSWER 로 묶임 (구분 불가).

---

## 4. CallRecord 상태 머신

```
[앱 발신]                           [폴더 스캔 + 매칭]              [CallLog 스캔]
    │                                     │                              │
    ▼                                     ▼                              ▼
AWAITING_FILE  ──── 60s 검증 / IDLE ──► PENDING                    NO_TRANSCRIPT
    │                                     │                         (callType ≠ RECORDED)
    │ 미응답 확정                          │                              │
    ▼                                     ▼                              ▼
NO_TRANSCRIPT  (callType=NO_ANSWER)  PROCESSING ◄── 좀비복구 ──┐    UploadRetryWorker
    │                                     │                  │    (1분→5분→30분→24h)
    │ UploadRetryWorker                   ▼                  │           │
    │                                   DONE / FAILED        │           ▼
    └─────────► 어드민 Blob ◄─────────────┴────────────────── └──────► 어드민 Blob
```

---

## 5. 타이밍 — "통화 끝 → 어드민 표시"까지

| 시나리오 | 일반 소요 |
|---|---|
| RECORDED (즉시 감지 성공) | 통화 끝 + ~10초 + RTZR(수분) + 업로드(1초) + 어드민 폴링(20초) = **수 분** |
| RECORDED (즉시 감지 실패, 주기 스캔 대기) | + 최대 15분 |
| NO_ANSWER (TelephonyCallback 즉시 감지) | 통화 끝 + 3초 + 업로드(1초) + 어드민 폴링(20초) = **~30초** |
| NO_ANSWER (60초 보험 워커) | + 60초 |
| MISSED / REJECTED (CallLog 주기 스캔) | 최대 15분 + ~30초 |

---

## 6. 제약과 가정

- **Samsung 기기 전용** — Pixel/iPhone 등은 OS 내장 녹음 경로가 다르거나 없음.
- 사용자가 전화 앱에서 자동 녹음을 켜야 함.
- SAF 권한으로 `/Recordings/Call/` 폴더를 명시적으로 허용해야 함.
- `READ_PHONE_STATE`, `READ_CALL_LOG` 권한 필요 (즉시 감지 + CallLog 스캔).
- **배터리 최적화 예외 권장** — 설정 화면에서 토글 (Doze 모드에서 워커 지연 회피).
- `minSdk 33` (Android 13+).
- Room: 명시적 Migration v1→v4 (uploadStatus, callType, callbackAt). `fallbackToDestructiveMigration(true)` 는 미정의 다운그레이드 안전망.

---

## 7. 보안·프라이버시

- **Gemini API 키** APK 에 박지 않음 — 백엔드 프록시 경유.
- **앱↔백엔드 인증**: `X-App-Token` 헤더 (공유 시크릿, `local.properties`의 `app.sharedToken`).
  - POST 라우트 + RTZR 프록시만 인증 검증.
  - GET 라우트 (transcripts list/detail, alerts) 는 인증 없음 — URL 자체가 보안 layer.
  - 추가 보안 필요시: Vercel Authentication / IP 화이트리스트 / 별도 비밀번호 layer.
- **오디오 파일** 백엔드 미경유 — 앱이 RTZR에 직접 전송.
- **녹음 필터링**: 리드 DB 에 없는 번호의 녹음은 **읽지도·복사하지도 않음** (앱 자체 정책).
- **RTZR 서버 데이터**: 사용자 요청 DELETE API 미제공 (조사 완료 2026-04-29). RTZR 정책상 **전사 결과 3일 후 자동 삭제** → 별도 연동 불필요.

---

## 8. 실패 모드와 표면화

| 실패 지점 | 기록 위치 | 표면화 |
|---|---|---|
| RTZR 전사 실패/타임아웃 | `status=FAILED`, `errorMessage` | 통화 상세 화면 |
| 워커 도중 강제 종료 (PROCESSING 좀비) | `status=PROCESSING` | 다음 워커 시작 시 자동 PENDING 복구 |
| 요약 실패 | `summary=""` (치명 아님) | "요약 없음" 표시 |
| 어드민 업로드 실패 | `uploadStatus=FAILED`, `uploadError` | 통화 상세 화면 + 자동 재시도 큐잉 (1분→5분→30분→24시간) + "재업로드" 버튼 |
| 앱↔서버 토큰 불일치 | 서버 401 응답 | `uploadError` 에 HTTP 401 |
| Doze 모드로 처리 지연 | (지표 없음) | 사용자가 배터리 최적화 예외 등록 시 회피 |
| TelephonyCallback 등록 실패 | logcat | 60초 보험 워커가 처리 |

---

## 9. 아키텍처 선택의 근거 — "왜 앱을 거쳐서 어드민으로 가는가?"

전사+요약은 `RTZR → 앱 → 백엔드(요약) → 앱 → 어드민 Blob` 으로 두 번 앱을 거친다. "RTZR → 어드민 직통"이 단순해 보이지만 현 구조를 택한 이유:

1. **앱 = 1차 저장소, 어드민 = 사본** 모델 — 상담사 오프라인에서도 본인 통화 열람 가능, 어드민/네트워크 장애 시 앱은 정상 작동.
2. **RTZR 폴링 주체가 앱** — Vercel Functions (Hobby 10초 / Pro 60초) 실행 시간이 RTZR 전사(최대 15분)와 부적합. 백엔드 폴링은 cron/queue 인프라 필요.
3. **오디오 네트워크 이동 최소화** — 앱→RTZR 직통 → 백엔드 egress 비용 0.
4. **업로드 실패 내성** — 어드민 업로드는 best-effort. 실패해도 앱 로컬 DB 유지.

### 대안과 비교

| 방식 | 장점 | 단점 |
|---|---|---|
| **A. RTZR Webhook** | 폴링 없음 | RTZR 측 webhook + 서명 검증 필요. 콜백 누락 감지 어려움. 앱 오프라인 조회 불가 |
| **B. 백엔드 폴링** | 자가복구, 중앙 관측 용이 | 큐/스케줄러 인프라 (Pro + Fluid / QStash / Inngest) — 유료 |
| **C. 현 구조** | 오프라인 내성, 단순 인프라 | 폰 상태 의존, 멀티 상담사 대규모엔 중앙 관측 한계 |

→ 상담사 ~10명 규모까지는 C 가 적합. 그 이상이거나 실시간성이 필수면 B 로 이행 검토.

### 현 구조(C)의 알려진 한계 — 규모 확장 시 드러남

| # | 한계 | 현재 완화책 |
|---|---|---|
| 1 | 상담사 폰에 데이터 주도권 — 폰 분실 시 미업로드분 영구 소실 | 어드민 업로드 자동 재시도 (1분→5분→30분→24시간), 즉시 감지로 업로드 지연 최소화 |
| 2 | 업로드 실패 재시도 부재 | ✅ `UploadRetryWorker` 자동 재시도 + 수동 "재업로드" 버튼 |
| 3 | 중복 업로드 리스크 | ✅ 백엔드 idempotency (startedAt + clientCallId + agentName) |
| 4 | 부분 실패 상태 다중 | `uploadStatus / uploadError` + 통화 상세 진단 카드 |
| 5 | 멀티 상담사 토큰 단일 | `APP_TOKEN` 1개 공유 — 누수 시 일괄 rotate. 상담사별 분리는 추후 |
| 6 | 어드민 실시간성 (5~25분) | ✅ 즉시 감지로 평균 단축 (RECORDED 수 분, 비-RECORDED ~30초) |
| 7 | RTZR 백로그 폭주 대비 | (미해결) 동시 제출 수 제한·재시도 큐 부재 |
| 8 | 오디오 원본 이중 저장 | RTZR 3일 자동 만료 (§7), 폰 측은 사용자 통제 |

---

## 10. 향후 개선 후보

- **상담사별 인증 분리** — 단일 공유 토큰 → 상담사별 토큰. 누수 시 개별 폐기 가능.
- **어드민 SSE 푸시** — 20초 폴링 제거, 즉시 갱신.
- **상담사별/기간별 통계 대시보드** — 통화 유형 분포, 평균 응답 시간 등.
- **앱 내 "재연락 대기" 화면** — 약속 시각 임박 통화 정렬 + 즉시 발신.
- **수동 매칭 UI** — 파일명·CallLog 매칭 실패한 통화를 사용자가 직접 리드에 매칭.
- **RTZR 백로그 큐 관리** — 동시 제출 제한 + 우선순위.

---

## 11. TODO (운영 시점 진행)

### 11.1 RTZR 데이터 처리 정책 — ✅ 부분 완료 (2026-04-29)
- ✅ 전사 결과 3일 후 자동 삭제 (`developers.rtzr.ai`)
- ✅ DELETE API 미제공 확인
- [ ] 오디오 원본 학습 사용 여부 / DPA 체결 가능 여부 — RTZR 영업 문의 (운영 시점)

### 11.2 RTZR 삭제 연동 — ❌ N/A
- API 미지원 → 코드 작업 불가. 향후 RTZR 가 추가하면 재검토.

### 11.3 아키텍처 이행 검토 (중장기)
- 상담사 10명↑ 또는 실시간성 필수 요건 발생 시 **B (백엔드 폴링)** 로 이행 설계.
- 인프라: Vercel Pro + Fluid Compute / QStash / Inngest.
- 마이그레이션 범위: 앱 SttWorker → RTZR submit 후 id 백엔드 위임, 폴링·요약·저장 백엔드 전담.

---

## 12. 변경 이력

| 날짜 | 주요 변경 |
|---|---|
| 2026-04-19 | v0.1 — 프로젝트 스캐폴드, Lead CRUD |
| 2026-04-21 | RTZR STT 연동, Vercel Blob 대용량 업로드 |
| 2026-04-22 | 온디바이스 STT 파이프라인, 어드민 전문 업로드, X-App-Token |
| 2026-04-27 | PROCESSING 좀비 자동 복구 + code-reviewer 에이전트 + PRD/CLAUDE 분리 |
| 2026-04-27 | 어드민 토큰 입력 절차 폐지 (URL 자체가 보안 layer) + list/detail 메타 디코드 |
| 2026-04-28 | 재연락 감지 Phase 0 + 어드민 알림 탭 + blob 메타 인코딩 (다른 컴 작업) |
| 2026-04-29 | **§1~§5 일괄 완료**: Migration v1→v4 데이터 보존, idempotency, durationSec, 자동/수동 재시도, callType (RECORDED/NO_ANSWER/MISSED/REJECTED), FileObserver, 배터리 예외, 재연락 Phase 1+2. §6 RTZR 삭제는 API 미지원으로 N/A. |
| 2026-04-30 | 어드민 list 통화 길이 표시 (v4 path), callType UI 분기 (배지·안내문), 발신 60초 검증 워커, **TelephonyCallback 통화 종료 즉시 감지**, **어드민 리드별 그룹핑**. |
