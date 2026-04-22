# booster-lead-app — PRD (제품 요구사항 / 프로세스 명세)

> 목적: Samsung Galaxy 기기에서 상담사가 잠재고객과 통화한 녹음을 자동으로 전사·요약하고, 본인 폰과 어드민 양쪽에 확인 가능하게 하는 서비스.
>
> 이 문서는 현재 구현 기준의 **엔드투엔드 프로세스 명세**다. 스택·구조는 [CLAUDE.md](CLAUDE.md) 참조.

---

## 1. 핵심 프로세스

```
[통화 종료]
    │
    ├─► ①  Samsung OS 내장 녹음 → /Recordings/Call/*.m4a 저장
    │
    ├─► ②  CallFolderScanWorker (15분 주기 or 수동)
    │        └─ 파일명/CallLog → 전화번호 매칭 → 리드 DB 와 대조
    │        └─ 매칭되는 파일만 CallRecord (status=PENDING) 로 등록
    │
    ├─► ③  SttWorker (PENDING 건 순차 처리)
    │        ├─ RTZR 전사  →  transcript
    │        └─ Gemini 요약 (backend 경유) → summary
    │
    ├─► ④  로컬 저장
    │        └─ Room DB: call_records.transcript/summary/status=DONE
    │
    └─► ⑤  어드민 업로드
             └─ POST /api/transcripts → Vercel Blob
             └─ 성공/실패를 call_records.uploadStatus/uploadError 에 기록

[어드민 뷰어]
    └─► GET /api/transcripts (20초 자동 갱신) → 리스트/상세 열람
```

---

## 2. 단계별 상세

### ① 녹음 (앱 밖, Samsung OS)
- 사용자가 Samsung 전화 앱 설정에서 "모든 통화 자동 녹음"을 켜야 함.
- 녹음 폴더(`/Recordings/Call/`)는 **SAF**(Storage Access Framework)로 사용자가 앱에 권한 부여.
- 앱은 녹음에 **관여하지 않음** — 외부에서 생성된 파일만 읽기 전용으로 접근.

### ② 폴더 스캔 — `CallFolderScanWorker`
- 주기: **15분** (Android `PeriodicWorkRequest` 최소 주기). 설정 화면의 "지금 스캔"으로 즉시 실행도 가능.
- 지원 확장자: `.m4a`, `.amr`, `.3gp`.
- **번호 매칭 순서** (앞 단계에서 붙으면 끝):
  1. 앱 내 발신 스텁(`AWAITING_FILE`) — 앱으로 건 전화면 leadId를 이미 알고 있음 (±60분 창)
  2. 파일명에서 숫자 추출
  3. CallLog 프로바이더에서 타임스탬프로 역조회
- **리드 DB에 없는 번호는 무시** — 파일을 복사·이동·삭제하지 않음 (사생활 보호 원칙).
- 성공 시 `CallRecord(status=PENDING)` 저장 → `SttWorker` 큐잉.

### ③ STT + 요약 — `SttWorker`
- RTZR 호출은 **앱이 직접** (오디오는 백엔드를 거치지 않음).
- Gemini 요약 호출은 **백엔드 프록시 경유** (API 키를 APK에 박지 않기 위해).
- 폴링: 5초 간격, 최대 180회(=15분) — 타임아웃 시 `status=FAILED`, `errorMessage` 기록.
- 성공 시 `setCallResult(transcript, summary)` → `status=DONE`.

| 서버 엔드포인트 | 역할 |
|---|---|
| `POST /api/rtzr/token` | RTZR 액세스 토큰 획득 프록시 |
| `POST /api/rtzr/transcribe` | 오디오 URL → 전사 요청 (현재 미사용, 앱 직통) |
| `GET /api/rtzr/transcribe/[id]` | 전사 상태 조회 |
| `POST /api/rtzr/summarize` | transcript → 5줄 요약 + 핵심 포인트 (Gemini 2.5 Flash, SSE 스트리밍) |

### ④ 로컬 저장 — Room DB
`CallRecord` 컬럼:
- `transcript`, `summary` — 결과
- `status` — PENDING / PROCESSING / DONE / FAILED / AWAITING_FILE
- `errorMessage` — STT/요약 단계 실패 사유
- `uploadStatus` — NONE / OK / FAILED *(어드민 업로드 상태, 독립적으로 관리)*
- `uploadError` — 업로드 실패 사유

UI: `CallDetailScreen` 하단에 업로드 상태 카드. 실패 시 사유 표시 → 원격 진단용.

### ⑤ 어드민 업로드 — `POST /api/transcripts`
- 인증: `X-App-Token` 헤더 (앱 `BuildConfig.APP_TOKEN` ↔ 서버 `APP_TOKEN` env 일치).
- Blob 경로: `transcripts/YYYY-MM/{startedAt}_{agentEnc}_{phoneEnc}_{nameEnc}_{uuid}.json`
  - 메타(agent/phone/name)는 `encodeURIComponent + '_'→'%5F'`로 이스케이프.
  - list만으로 메타 노출 가능 → 어드민 목록이 상세 조회 없이 의미있는 정보 표시.
- 실패해도 로컬 `DONE` 상태는 유지 → 사용자가 앱에서 결과를 계속 볼 수 있음.
- 업로드 결과는 `uploadStatus`에 기록되어 진단 가능.

### ⑥ 어드민 뷰어 — `/admin`
- 인증: 브라우저에서 `X-App-Token` 입력 후 localStorage 저장.
- 목록: `GET /api/transcripts` — Vercel Blob `list()` 결과를 경로 파싱.
  - **신 포맷**(메타 내장) / **구 포맷**(메타 없음, `{startedAt}-{uuid}.json`) 둘 다 파싱.
- 상세: `GET /api/transcripts/[id]`.
- **자동 갱신**: 20초 간격 폴링. 탭 숨김 시 정지, 복귀 시 즉시 1회 갱신.
- 상담사 필터, 다운로드 (.txt) 지원.

---

## 3. 타이밍 특성 — "통화 끝 → 어드민 표시"까지

| 단계 | 소요 시간 |
|---|---|
| ① 녹음 저장 | 통화 종료 즉시 |
| ② 스캔 대기 | **최대 15분** (주기 워커 다음 tick까지) |
| ③ RTZR 전사 | 보통 수분 (오디오 길이의 0.3~1배) |
| 요약 | 수 초 |
| ⑤ 업로드 | 1초 내 |
| ⑥ 어드민 반영 | **최대 20초** (폴링 주기) |

**현 구현 합계**: 통화 직후 → 어드민 반영까지 **5~25분** 일반적.

---

## 4. 제약과 가정

- **Samsung 기기 전용** — Pixel/iPhone 등은 OS 내장 녹음 경로가 다르거나 없음.
- 사용자가 전화 앱에서 자동 녹음을 켜야 함.
- SAF 권한으로 `/Recordings/Call/` 폴더를 명시적으로 허용해야 함.
- `minSdk 33` (Android 13+).
- `fallbackToDestructiveMigration(true)` — Room 스키마 업그레이드 시 로컬 데이터 리셋. 베타 단계 정책.

---

## 5. 실패 모드와 표면화

| 실패 지점 | 기록 위치 | 표면화 |
|---|---|---|
| RTZR 전사 실패/타임아웃 | `status=FAILED`, `errorMessage` | 통화 상세 화면 |
| 요약 실패 | `summary=""` (치명적 실패 아님) | 요약 없음으로 표시 |
| 어드민 업로드 실패 | `uploadStatus=FAILED`, `uploadError` | 통화 상세 화면 하단 업로드 상태 카드 |
| 앱↔서버 토큰 불일치 | 서버 401 응답 | `uploadError`에 HTTP 401 기록 |

---

## 6. 보안·프라이버시

- Gemini API 키는 APK에 박지 않음 — 백엔드 프록시 경유.
- 앱↔백엔드 인증은 `X-App-Token` (공유 시크릿, `gradle.properties`의 `sharedAppToken`).
- 오디오 파일은 백엔드를 거치지 않음 — 앱이 RTZR에 직접 전송.
- 어드민 토큰은 브라우저 localStorage에 저장.
- 리드 DB에 없는 번호의 녹음 파일은 **읽지도·복사하지도 않음** (앱 자체의 개인정보 보호 원칙).

---

## 7. 현재 아키텍처 선택의 근거 — "왜 앱을 거쳐서 어드민으로 가는가?"

전사+요약이 `RTZR → 앱 → 백엔드(요약) → 앱 → 어드민 Blob` 경로로 두 번 앱을 거친다. "RTZR → 어드민 직통"이 더 단순해 보이지만 지금 구조를 택한 이유:

1. **앱 = 1차 저장소, 어드민 = 사본** 모델
   - 상담사가 오프라인에서도 본인 통화 기록 열람 가능
   - 어드민/네트워크 장애 시에도 앱은 정상 동작
2. **RTZR 폴링 주체가 앱**
   - RTZR 전사는 최대 15분 소요 → Vercel Functions (Hobby 10초, Pro 60초) 실행 시간과 부적합
   - 백엔드가 폴링 주체가 되려면 별도 cron/queue 인프라 필요
3. **오디오 네트워크 이동 최소화**
   - 앱→RTZR 직통 → 백엔드 egress 비용 없음
   - 백엔드 경유 시 오디오가 네트워크를 두 번 탐 (업로드 + RTZR 재전송)
4. **업로드 실패 내성** — 어드민 업로드는 best-effort. 실패해도 앱은 로컬 DB로 계속 기능

### 대안 아키텍처와 안정성 비교

| 방식 | 장점 | 단점 |
|---|---|---|
| **A. RTZR Webhook** — 앱 submit 시 백엔드 callback URL 등록, RTZR 완료 시 백엔드로 푸시 | 폴링 없음, 단순 | RTZR webhook 지원 + 서명 검증 필요. 콜백 놓치면 유실 감지 어려움. 앱 오프라인 조회 불가 |
| **B. 백엔드 폴링** — 앱은 RTZR submit 까지만, id 를 백엔드에 넘기고 백엔드가 폴링·요약·저장 | 자가복구 가능, 재조회로 재시도, 상태 관측 쉬움 | 큐/스케줄러 인프라 필요 (Pro + Fluid / QStash / Inngest). 유료 플랜 |
| **C. 현 구조 유지** — 앱이 주체적으로 전 과정 진행, 어드민 업로드는 best-effort | 오프라인 내성, 단순 인프라, 업로드 실패해도 앱 정상 | 상담사 폰 상태에 의존 (배터리/네트워크). 멀티 상담사 대규모 시 중앙 관측 어려움 |

**안정성 최우선이면 B. 현 규모에선 C(현 구조) 가 적합.** 상담사 10명↑ 또는 "폰 상태 무관하게 어드민 실시간 필수" 요건이 강해지면 B 로 이행 검토.

### 현 구조(C)의 단점 — 규모 확장 시 드러남 (치명도순)

1. **상담사 폰에 데이터 주도권이 있음**
   - 폰 분실/초기화/앱 데이터 삭제 → 업로드 안 된 건은 **영구 소실**
   - 배터리 절약·Doze 모드에서 WorkManager 주기가 15분보다 더 밀림 (Android OS 특성)
   - 폰이 며칠 오프라인이면 쌓인 통화가 한꺼번에 RTZR 로 몰려 처리 지연 누적
2. **업로드 실패 재시도 로직 없음**
   - 현재 `uploadStatus=FAILED` 로 기록만 됨 — 자동 재시도·수동 트리거 UI 부재
   - 네트워크 일시 단절로 실패 상태 고정 → 재스캔해도 재업로드 안 일어남
3. **중복 업로드 리스크**
   - 업로드 직후 프로세스 kill → 재시도 시 같은 통화가 Blob 에 2건 생성
   - `clientCallId` 를 보내긴 하지만 서버가 idempotency 체크 안 함
4. **부분 실패 상태가 많음** (경계 4개: RTZR / Gemini / 로컬 DB / 어드민 Blob)
   - "전사 O, 요약 X", "전사+요약 O, 업로드 X" 등 조합 → 디버깅·복구 로직이 모두 개별
   - 원격 진단은 앱을 열어봐야만 가능 — `uploadError` 로는 한계
5. **멀티 상담사 취약**
   - `APP_TOKEN` 1개를 모든 상담사 앱이 공유 — 누수 시 개별 폐기 불가
   - 상담사별 업로드 성공률/RTZR 사용량 중앙 집계 어려움
6. **어드민 실시간성 한계** — 통화 끝 → 반영 5~25분. 긴급 콜백 대응엔 부적합
7. **RTZR 백로그 폭주 대비 부재** — 동시 제출 수 제한·재시도 큐·우선순위 없음
8. **오디오 원본 이중 저장** — 폰 `/Recordings/Call/` + RTZR 서버. 양쪽 보관 정책 추적 필요 (§9.1 TODO 와 연결)

---

## 8. 향후 개선 후보

- `FileObserver`/`ContentObserver`로 파일 생성 즉시 감지 → 15분 대기 제거
- 어드민 SSE로 업로드 이벤트 푸시 → 20초 폴링 제거
- 업로드 실패 자동 재시도 (exponential backoff)
- 업로드 재시도 수동 트리거 버튼 (통화 상세)
- 상담사별/기간별 통계 대시보드
- 멀티 상담사 환경에서 어드민 역할/권한 분리

---

## 9. TODO (우선 조치)

### 9.1 RTZR 데이터 처리 정책 확인
- [ ] RTZR(리턴제로/VITO) 공식 약관·개인정보처리방침에서 확인할 항목:
  - 업로드된 **오디오 원본** 보관 기간 및 용도 (학습 사용 여부)
  - **전사 결과** 보관 기간
  - 삭제 API 존재 여부 및 호출 방법
  - DPA (Data Processing Agreement) 체결 가능 여부
- [ ] 확인 결과를 PRD §6 (보안·프라이버시) 에 명시 + 필요 시 사용자 고지 문구 반영

### 9.2 RTZR 삭제 연동
- [ ] RTZR API 에 삭제 엔드포인트가 있으면 `SttWorker` 에 연결
  - 전사 완료 (`completed`) → 어드민 업로드 성공 확인 → RTZR 서버에서 원본/전사 삭제 호출
  - 실패 시 재시도 큐에 적재 (로컬 DB 에 `rtzrDeleted` 플래그 추가 검토)
- [ ] 삭제 API 가 없을 경우 RTZR 측에 삭제 요청 프로세스 문의

### 9.3 아키텍처 개선 검토 (중장기)
- [ ] 상담사 규모 10명↑ 로 확장하는 시점에 재평가
- [ ] "폰 상태 무관 어드민 실시간 필수" 요건이 생기면 **B (백엔드 폴링)** 로 이행 설계
  - 필요 인프라: Vercel Pro + Fluid Compute 또는 QStash/Inngest 큐
  - 마이그레이션 범위: 앱 `SttWorker` → RTZR submit 후 id 를 백엔드에 위임, 폴링/요약/저장은 백엔드에서 전담
- [ ] 당분간은 현 구조(C) 유지 — 업로드 재시도·진단 UI 보강으로 충분
