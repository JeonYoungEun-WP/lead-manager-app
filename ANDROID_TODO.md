# Android Studio 작업 TODO

다음 개발 세션에서 Android Studio 가 있는 환경으로 돌아왔을 때 처리할 항목들.

리포 최신 상태: `main` 브랜치, 최신 커밋 `543e323` (푸시 완료).
미빌드 변경: `69f97ed` 에서 추가된 업로드 진단 필드 — 아래 §1 에서 적용.

---

## 🔴 1. 필수 — 미빌드 커밋 적용 + 업로드 실패 진단

- [ ] `69f97ed` 커밋 기준으로 빌드 & 폰 설치
  - 포함 변경: `CallRecord.uploadStatus/uploadError`, Room v2, `SttWorker` 결과 기록, `CallDetailScreen` 업로드 상태 카드
- [ ] ⚠️ Room 스키마 v1→v2 로 인해 `fallbackToDestructiveMigration` 이 **로컬 리드/통화기록을 삭제함**
  - 설치 후 리드 재등록 필요
- [ ] 테스트 통화 1건 → 통화 상세 화면 하단 **"어드민 업로드" 카드** 에 뜬 실패 사유 확인
- [ ] 실패 사유별 조치:
  - HTTP **401** → `gradle.properties` 의 `sharedAppToken` ↔ Vercel env `APP_TOKEN` 값 일치시키기
  - `Failed to connect to ...` → 설정 화면의 Backend URL 재확인
  - HTTP **503 BLOB_READ_WRITE_TOKEN ...** → Vercel 대시보드에서 Blob 토큰 재설정

---

## 🟡 2. PRD §7 단점 보완 — 업로드 안정성 (치명도 2,3번 대응)

### 2.1 업로드 자동 재시도
- [ ] `SttWorker` 또는 신규 `UploadRetryWorker` 에 exponential backoff 재시도 로직
- [ ] 재시도 정책: 즉시 → 1분 → 5분 → 30분 → 중단 (최대 4회)
- [ ] 재시도 중임을 UI 에서 구분 가능하게 `uploadStatus` 값 확장 검토 (`RETRYING` 등)

### 2.2 수동 재시도 버튼
- [ ] `CallDetailScreen` 의 `UploadStatusCard` 에 `uploadStatus=FAILED` 일 때 "재업로드" 버튼 추가
- [ ] 클릭 → 해당 `CallRecord` 1건만 `OneTimeWorkRequest` 로 업로드 재시도
- [ ] 레포지토리에 `retryUpload(callId: Long)` 메서드 추가

### 2.3 중복 업로드 방지
- [ ] 서버 `POST /api/transcripts` 에서 `clientCallId` + `startedAt` 조합으로 idempotency 체크
  - 이미 존재하는 조합이면 기존 Blob URL 반환
- [ ] 앱 `SttWorker` 에 업로드 진행중 플래그 추가 (동시 호출 방지)

### 2.4 통화 길이(durationSec) 업로드 페이로드 포함
- [ ] `SttWorker.uploadTranscript` 호출 시 `CallRecord.durationSec` 도 함께 전송
  - JSON body 에 `"durationSec": Int?` 필드 추가
- [ ] `durationSec` 이 null 인 경우 `MediaMetadataRetriever` 로 오디오 파일에서 추출 시도 후 업로드
- [ ] 백엔드 `route.ts`:
  - `TranscriptPayload` 타입에 `durationSec?: number` 추가
  - blob 경로에 인코딩하거나 (예: `{startedAt}_{agent}_{phone}_{name}_{duration}_{uuid}.json`) 또는 record JSON 안에만 보존하고 list 응답에서 메타로 노출
- [ ] 어드민 페이지: 목록·상세 양쪽에 "통화 길이" 컬럼/필드 표시
- [ ] 옛 포맷 blob 은 `durationSec` 미보유 → "-" 로 표시

> 참고: 이 작업이 완료되기 전까지는 어드민에서 통화 길이가 표시되지 않음. 임시 대안으로 transcript 의 마지막 `[mm:ss]` 타임스탬프를 파싱해 상세 화면에만 어림값 표시하는 방법(옵션 A) 도 있으나, 정확도 한계로 채택하지 않고 본 작업으로 한 번에 처리.

---

## 🟢 3. 반응성 개선 — PRD §8 연결

### 3.1 녹음 파일 즉시 감지
- [ ] `FileObserver` 또는 `ContentObserver` 로 `/Recordings/Call/` 변화 감지
- [ ] 변화 감지 시 `CallFolderScanWorker` 즉시 트리거 → 15분 주기 대기 제거
- [ ] ForegroundService 로 승격 필요 여부 검토 (Android 14+ 백그라운드 제약)

### 3.2 배터리 최적화 예외
- [ ] 설정 화면에서 "배터리 최적화 예외 허용" 다이얼로그 호출 (Doze 모드 회피)
- [ ] 허용 안 할 경우 경고 문구 표시

---

## 🟣 4. 미응답·부재중·거절 통화도 리스트에 표시

녹음 파일이 생기지 않는 통화(미응답·부재중·거절)도 어드민에서 보이도록 하는 작업.
삼성 OS 는 통화가 연결되지 않으면 녹음 파일을 만들지 않으므로, 폴더 스캔만으로는 잡히지 않음.

### 4.1 앱 — `CallLog` provider 기반 감지
- [ ] `READ_CALL_LOG` 권한 활용 (이미 사용 중)
- [ ] 통화 종료 시점 감지:
  - 옵션 A: `TelephonyManager.PhoneStateListener` 또는 `TelephonyCallback` (Android 12+)
  - 옵션 B: 앱에서 발신 직후 30초~수 분 뒤 CallLog 재조회 (간단)
- [ ] 통화 직후 CallLog 최근 항목 조회 → 리드 DB 와 매칭되면 `CallRecord` 등록
  - `type=OUTGOING` + `duration=0` → `status="NO_ANSWER"` (미응답 발신)
  - `type=MISSED` → `status="MISSED"` (수신 부재중)
  - `type=REJECTED` → `status="REJECTED"` (수신 거절)
- [ ] STT/요약 단계 스킵 — `transcript=null`, `summary=null` 로 즉시 업로드 큐잉

### 4.2 백엔드 — 비전사 업로드 허용
- [ ] `POST /api/transcripts` 의 `TranscriptPayload`:
  - `transcript` 필드를 **선택**으로 변경
  - `callType: "RECORDED" | "NO_ANSWER" | "MISSED" | "REJECTED"` 필드 추가
  - `summary` 도 선택 (NO_ANSWER 등은 비어있음)
- [ ] blob 경로 또는 record JSON 에 `callType` 보존
- [ ] GET 응답에 `callType` 포함

### 4.3 어드민 — 통화 유형 구분 표시
- [ ] 리스트 항목에 통화 유형 배지 표시
  - `RECORDED` (기본, 배지 없음 또는 "녹음")
  - `NO_ANSWER` — 회색 배지 "미응답"
  - `MISSED` — 주황 배지 "부재중"
  - `REJECTED` — 빨강 배지 "거절"
- [ ] 상세 화면: 비전사 통화는 transcript/요약 영역 대신 통화 시도 사실만 표시
- [ ] 상담사 필터에 추가로 "통화 유형 필터" 셀렉트 추가 검토

### 4.4 확장 (선택)
- [ ] 같은 리드에 대한 통화 시도 횟수 집계 (예: "오늘 3회 시도, 1회 통화")
- [ ] 부재중 알림 — 미응답이 N회 이상 누적된 리드를 어드민 상단에 강조
- [ ] 통화 유형별 카운트 헤더 ("녹음 12 / 미응답 3 / 부재중 1")

---

## 🟠 5. 재연락 감지 — Phase 1 / Phase 2

Phase 0(백엔드 Gemini 프롬프트로 요약 첫 줄에 `[#재연락 ...]` 마커 삽입 + 어드민 알림 탭) 은 이미 배포됨.
이 섹션은 텍스트 마커 파싱 방식을 정식 구조화 데이터로 격상하고, 폰 로컬 알림을 추가하는 작업.

### 5.1 Phase 1 — 정식 구조화 필드 (Android 빌드 필요)
- [ ] `CallRecord` 에 컬럼 추가:
  - `callbackAt: Long?` — 재연락 절대 시각 (ms, KST 가정)
  - `tags: String?` — 콤마 구분 또는 별도 테이블 (예: "재연락,긴급")
- [ ] Room 마이그레이션 (v2→v3, `fallbackToDestructiveMigration` 유지 시 자동 처리)
- [ ] `SttWorker.fetchSummary` 에서 Gemini 응답의 `callback` 필드를 별도 파싱해서 DB 저장
  - 백엔드 `summarize` 응답 schema 가 이미 callback 정보를 담고 있다고 가정 — 필요 시 백엔드 응답에 명시적 `callback` 필드 추가 검토 (현재는 summary 첫 줄 마커로만 표현)
- [ ] 업로드 페이로드(`POST /api/transcripts`) 에 `callbackAt`, `tags` 포함
- [ ] 백엔드 record JSON 에 보존 → 어드민이 텍스트 파싱 대신 구조화 데이터 사용 (현재 `extractCallback` 헬퍼는 fallback 으로 유지)
- [ ] 어드민 `/api/alerts` 가 record JSON 의 `callbackAt` 필드를 우선 사용하고 없을 때만 텍스트 파싱

### 5.2 Phase 1.5 — 앱 내 "재연락 대기" 화면 (선택)
- [ ] 메인 화면에 "재연락 N건" 카드
- [ ] 클릭 시 `callbackAt ASC` 정렬 리스트 (지난 건은 빨강, 임박 건은 노랑)
- [ ] 항목 클릭 → 발신 인텐트 즉시 실행

### 5.3 Phase 2 — 폰 로컬 알림 (Android 빌드 필요)
- [ ] `WorkManager` 또는 `AlarmManager.setExactAndAllowWhileIdle` 로 `callbackAt` 시각에 알림 예약
  - Doze 모드 회피 위해 `setExactAndAllowWhileIdle` 권장 (POST_NOTIFICATIONS 권한 필요)
- [ ] 알림 본문 예시: "오후 3시 재연락 약속 — 김철수 010-XXXX-XXXX"
- [ ] 알림 클릭 → 해당 통화 상세 화면으로 딥링크
- [ ] 설정 화면에서 알림 ON/OFF 토글 (DataStore 저장)
- [ ] 통화 발신 또는 일정 시간 경과 후 알림 자동 dismiss

### 5.4 어드민 측 보강 (Android 와 무관, 필요 시 별도 작업)
- [ ] 알림 탭에서 "처리 완료" 마킹 기능 — 현재는 시간만 지나면 사라지지 않고 계속 표시됨
- [ ] 알림 sound (브라우저 Notification API + `Audio.play()`)
- [ ] 새 알림 도착 시 토스트
- [ ] 알림 탭 active 시 favicon 빨간 점 표시

---

## 🔵 6. PRD §9.2 — RTZR 삭제 연동 (정책 확인 선행)

- [ ] RTZR 개발자 문서에서 삭제 API 존재 여부 확인 ([developers.rtzr.ai](https://developers.rtzr.ai/))
- [ ] 있으면 `RtzrClient.delete(id)` 메서드 추가
- [ ] 호출 시점: 어드민 업로드 성공 후 (로컬 DB 에는 transcript 가 이미 저장됨)
- [ ] `CallRecord` 에 `rtzrDeleted: Boolean` 플래그 추가 검토 (삭제 실패 시 재시도용)
- [ ] PRD §6 보안 섹션에 "어드민 업로드 성공 후 RTZR 서버에서 원본/전사 삭제" 라고 명시

---

## 참고 사항

### 빌드 시 주의
- `gradle.properties` 에 `sharedAppToken` 정의 필요 — 없으면 빈 문자열로 빌드됨
- 커밋 금지 파일: `.env.local`, `.env`, `local.properties`, `*.keystore`, `*.jks` ([CLAUDE.md](CLAUDE.md) 참조)

### 배포된 백엔드와 앱 토큰 일치
- Vercel 대시보드 → Project Settings → Environment Variables → `APP_TOKEN`
- 이 값과 앱 `gradle.properties` 의 `sharedAppToken` 이 **반드시 같아야** 업로드 가능

### Room 마이그레이션 정책 재검토 시점
- 현재 `fallbackToDestructiveMigration(true)` — 베타 단계용
- 프로덕션 배포 전 `Migration(N, N+1)` 으로 전환 필요 (상담사 로컬 기록 보존)
