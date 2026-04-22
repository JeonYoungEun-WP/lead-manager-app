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

## 🔵 4. PRD §9.2 — RTZR 삭제 연동 (정책 확인 선행)

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
