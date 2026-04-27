# booster-lead-app — Product Requirements Document

> 최종 업데이트: 2026-04-27
> 버전: v1.0 (Android 1차 출시 + 좀비 복구 패치)

## 1. 프로젝트 개요

Samsung Galaxy 상담사용 **잠재고객(리드) 관리 앱**.
상담사가 리드별로 통화·문자를 주고받고, Samsung OS 가 자동 저장한 통화 녹음 파일을 앱이 자동으로 수집·전사·요약해서 리드 카드에 붙여준다.

**플랫폼**: Android Kotlin + Jetpack Compose
**대상 사용자**: 상담 영업 직원 (Samsung Galaxy 사용 한정)
**배포**: 사내 APK 배포 (Play Store 미공개)

## 2. 주요 기능 (1차 — v1.0)

### 2.1 리드 관리
- 잠재고객 CRUD (이름·번호·메모·태그·상태)
- 검색 / 상태 필터 (신규 · 상담중 · 보류 · 완료 등)
- 리드 카드에 통화 타임라인 표시

### 2.2 통신
- 전화 발신: `CALL_PHONE` 인텐트
- 문자 작성: 기본 SMS 앱 인텐트
- 발신 시 `CallRecord` 스텁(`AWAITING_FILE`) 선기록 → 녹음 파일 도착하면 자동 첨부

### 2.3 자동 통화 처리 파이프라인
**Samsung OS 자동 녹음 → 앱 스캔 → RTZR 전사 → Gemini 요약 → 로컬 DB 저장**

```
[/Recordings/Call/*.m4a]
        │
        ▼
[CallFolderScanWorker]    ── 15분 주기 + 수동 "지금 스캔"
   - 좀비 PROCESSING → PENDING 복구    ← v1.0 추가
   - 파일명/CallLog 으로 번호 매칭
   - 리드 DB 매칭 시 CallRecord(PENDING) 생성
        │
        ▼ (PENDING 있을 때만 트리거)
[SttWorker]    ── 좀비 복구 + RTZR 전사 + Gemini 요약
   - PROCESSING 좀비 복구 (이중 안전망)
   - RTZR submit → poll (최대 15분)
   - 백엔드 /api/rtzr/summarize → Gemini 5줄 요약
   - DB: status='DONE', transcript+summary 저장
   - 백엔드 /api/transcripts 어드민 업로드 (실패해도 로컬 유지)
```

**검증 결과 (2026-04-27)**: 5명 리드 / 56개 녹음 파일 → **25건 정상 처리, 0 에러**

### 2.4 어드민 연동
- 앱 → 백엔드 **업로드 (POST `/api/transcripts`)** 는 `X-App-Token` 헤더 인증 유지
- 어드민 웹 (`/admin`) **조회 (GET `/api/transcripts`, `/api/transcripts/[id]`)** 는 토큰 없이 접근 가능
  - URL 만 알면 누구나 통화 전사 조회 가능 — **URL 은 공유 금지**
  - 추가 보안 필요시: Vercel Authentication / IP 화이트리스트 / 별도 비밀번호 layer 검토
- 어드민 웹에서 상담사·리드별 녹취 관리

## 3. 시스템 구조

```
booster-lead-app/
├── app/                        Android Kotlin 메인 모듈
│   └── src/main/java/kr/wepick/leadapp/
│       ├── data/db/            Room (Lead, CallRecord, DAO, AppDatabase)
│       ├── data/repo/          비즈니스 로직 (LeadRepository)
│       ├── service/            WorkManager (CallFolderScanWorker, SttWorker, RtzrClient)
│       ├── ui/screens/         Compose 화면 (Leads, CallHistory, Settings, ...)
│       ├── ui/nav/             Navigation Compose
│       └── util/               PhoneUtils, CallLogResolver, Preferences
├── backend/                    Next.js — Vercel 배포
│   ├── app/api/health          헬스체크
│   ├── app/api/rtzr/           RTZR submit/status (앱 직접 호출)
│   ├── app/api/rtzr/summarize  Gemini 5줄 요약
│   ├── app/api/transcripts     어드민 업로드 엔드포인트
│   ├── app/api/blob            Vercel Blob (대용량 파일 우회)
│   └── app/admin               녹취 관리 어드민 UI
├── PRD.md                      ← 본 문서
├── CLAUDE.md                   Claude 작업 규칙 (시크릿 금지·코드 컨벤션)
└── README.md                   사용자/개발 환경 가이드
```

## 4. 기술 스택

### Android
- **Kotlin 2.2** + **Jetpack Compose**
- **minSdk 33** (Android 13) / **targetSdk 36** (Android 16)
- **Room 2.7** (로컬 DB) / **Navigation Compose** / **WorkManager** / **DataStore**
- **OkHttp** (백엔드 + RTZR 호출)

### Backend
- **Next.js (App Router)** on Vercel
- **Vercel Blob** (대용량 오디오 임시 저장)
- **Gemini 2.5 Flash** (요약 — 5줄 + 핵심 포인트)
- **RTZR** (전사 STT)

## 5. 중요한 기술적 제약

### 5.1 Samsung 통화 녹음 의존
- 앱 자체는 통화 녹음하지 **않음**. **Samsung OS 내장 녹음** 파일만 읽음.
- 사용자가 Samsung 전화 앱 설정에서 "모든 통화 자동 녹음" 켜야 함.
- 파일 경로는 SAF(Storage Access Framework) 로 사용자가 `/Recordings/Call/` 지정.
- **Samsung 기기 한정** 서비스. Pixel·iPhone 등 다른 기기는 미지원.

### 5.2 녹음 필터링 원칙 (프라이버시)
- `CallFolderScanWorker` 는 폴더 전체를 스캔하지만, **리드 DB 에 등록된 번호만** `CallRecord` 로 저장.
- 매칭 안 되는 파일(가족·지인 등)은 건드리지 않음 — 파일 복사/열기/삭제 어떤 동작도 하지 않음.
- 사용자에게 이 원칙을 설정 화면에 명시.

### 5.3 API 키 보안
- Gemini API 키를 **APK 에 박지 않음** (디컴파일 유출 위험).
- 앱 → `backend/` Vercel Functions 프록시 → Gemini API 호출 구조.
- 백엔드 URL 은 앱 설정에서 변경 가능 (DataStore 에 저장).
- 앱 → 백엔드 호출은 `X-App-Token` 헤더로 최소 인증.

### 5.4 워커 수명 제약 (v1.0 패치 반영)
- WorkManager `CoroutineWorker` 는 **10분 이내 종료** 강제.
- RTZR 폴링은 최대 15분 → 큰 파일은 워커가 죽을 수 있음.
- **죽은 워커가 남긴 PROCESSING 레코드는 좀비**가 되어 영구 미처리 위험.
- → `CallFolderScanWorker` / `SttWorker` 시작 시 **PROCESSING → PENDING 자동 복구** (v1.0).
- UNIQUE work (`APPEND_OR_REPLACE`) 정책상 SttWorker 동시 실행 없으므로 안전.

## 6. CallRecord 상태 머신

```
AWAITING_FILE  ── 앱에서 발신만 하고 녹음 파일 미도착
       │
       ▼ (스캐너가 파일 발견 + 타임스탬프 매칭)
   PENDING  ◄────────────────┐
       │                     │ (좀비 복구)
       ▼ (SttWorker 처리 시작)│
   PROCESSING  ──── 워커 죽음 ┘
       │
       ▼
     DONE  /  FAILED (errorMessage 포함)
```

## 7. 알려진 제약 + 향후 과제

### 7.1 v1.0 미해결 / 차후 개선

#### 🟡 [DEFERRED] SttWorker 10분 한도 → ForegroundService 승격
**상태**: v1.0 에서는 **의도적으로 미적용**. 좀비 복구 로직으로 1차 대응 중.

**문제 정의**
- Android `WorkManager` 의 `CoroutineWorker` 는 OS 가 **10분 후 강제 종료** 한다 (배터리 보호 정책).
- `SttWorker` 의 처리 흐름:
  1. 음성 파일 로드 (수십 MB 가능)
  2. RTZR 업로드
  3. 5초 간격 폴링 (코드상 최대 15분 대기 — `pollUntilDone` maxAttempts=180)
  4. Gemini 요약 호출
  5. DB 저장
- **30MB+ 큰 파일** (예: 30분 이상 긴 상담 통화) 은 RTZR 응답이 5~12분 걸릴 수 있어 **10분 시점에 OS 가 워커를 강제 종료** → `CallRecord` 가 PROCESSING 상태로 굳음 (좀비).

**현재 1차 대응 (v1.0 적용)**
- `CallFolderScanWorker` / `SttWorker` 시작 시 `repo.resetStaleProcessing()` 자동 호출 → 좀비 PENDING 으로 복구.
- 다음 15분 주기 스캔에서 자동 재시도.
- 단점: **같은 큰 파일은 매번 10분에 죽어 무한 재시도 루프** 가능성.

**근본 해결안 (차후)**
- `SttWorker` 를 `ForegroundService` 로 승격.
- 효과: OS 시간 제한 없음 → 큰 파일도 끝까지 처리.
- 트레이드오프:
  - 처리 중 상단 상태바에 알림 상시 표시 필요 (Android 정책).
  - 사용자 입장에서 "통화 녹음 처리 중…" 알림이 자주 떠 거슬릴 수 있음.
  - 알림 권한 (`POST_NOTIFICATIONS`) 추가 요청 필요.

**언제 작업할 것인가 (트리거 조건)**
- [ ] 사용자가 "큰 통화 파일 결과가 며칠째 안 뜬다" 류 컴플레인 보고
- [ ] 같은 `CallRecord.id` 가 좀비 복구 → 재시도 → 다시 좀비 패턴을 **3회 이상** 반복 (로그/메트릭으로 감지)
- [ ] 30분+ 통화가 일상 업무가 되어 빈도가 잦아짐
- 위 조건 중 **1개라도 충족 시 즉시 ForegroundService 작업 착수**.

**구현 시 체크리스트 (착수 시 참고)**
- `SttWorker` 를 `Service` 또는 `JobIntentService` 로 분리, 또는 `setForeground()` 내부 호출로 전환
- 알림 채널 등록 (LOW importance — 진동/소리 없음)
- 알림 본문: "통화 녹음 N건 처리 중…" + 진행률
- `POST_NOTIFICATIONS` 런타임 권한 요청 (Android 13+)
- WorkManager 의 `setForeground` 패턴 사용 시 `setExpedited()` 옵션도 같이 검토

---

#### 🟡 [DEFERRED] 수동 매칭 UI
- 파일명·CallLog 양쪽 다 매칭 안 되는 케이스 — 사용자가 직접 녹음 파일을 리드에 매칭하는 UI 필요 (현재 미구현).

### 7.2 의도적으로 안 한 것
- iCloud / Google Drive 동기화 — 모든 데이터 로컬 Room DB만
- 푸시 알림 — 1차 범위 외
- 백업/복구 — 1차 범위 외

## 8. 작업 기본 방향 (개발자 노트)

- 기존 파일 수정 우선. 새 파일·문서 최소화.
- Kotlin 코드는 `kr.wepick.leadapp` 패키지 아래에 기능별 서브 패키지.
- Compose 화면은 `ui/screens/`, 내비게이션은 `ui/nav/`, DB 는 `data/db/`, 비즈니스 로직은 `data/repo/`.
- 긴 작업은 `WorkManager` (`service/`) 로, 필요 시 ForegroundService 승격.

## 9. 변경 이력

| 날짜 | 버전 | 변경 사항 |
|---|---|---|
| 2026-04-19 | v0.1 | 프로젝트 스캐폴드, Lead CRUD |
| 2026-04-21 | v0.2 | RTZR 전사 + 어드민 |
| 2026-04-21 | v0.3 | Vercel Blob 대용량 업로드 |
| 2026-04-22 | v0.4 | 온디바이스 STT 파이프라인 + 어드민 요약 스트리밍 |
| 2026-04-22 | v0.5 | 어드민 전문 업로드 + X-App-Token 인증 |
| 2026-04-27 | **v1.0** | **End-to-end 검증 완료 (25건 정상). 좀비 PROCESSING 자동 복구 추가.** |
| 2026-04-27 | v1.0 (PRD) | ForegroundService 승격을 [DEFERRED] 로 명시 (트리거 조건 + 구현 체크리스트 정리). |
| 2026-04-27 | v1.0.1 | 어드민 GET 라우트 토큰 인증 제거 — `/admin` 페이지 토큰 입력 절차 폐지. POST 업로드는 토큰 유지. |
