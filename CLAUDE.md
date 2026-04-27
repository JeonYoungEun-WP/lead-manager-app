# booster-lead-app — Claude 작업 지침

> 제품 스펙·아키텍처·기능 정의는 [`PRD.md`](./PRD.md) 참고.
> 이 문서는 Claude 에이전트가 코드 변경 시 반드시 지켜야 할 규칙만 정리한다.

## ⚠️ 절대 커밋 금지

- **`.env.local`, `.env`, `.env.*`, `local.properties`, `*.keystore`, `*.jks`** — 환경 시크릿·SDK 경로·서명 키.
- **`.claude/settings.json`, `.claude/settings.local.json`, `.claude/launch.json`** — Bash allow 리스트에 평문 토큰 쌓일 수 있음.
- 히스토리에 올라간 시크릿은 `force push` 로 지워도 GitHub 캐시·fork 에 잔존 → **즉시 rotate**.
- 커밋 전 `git status` 로 staged 파일 목록 반드시 확인. `git add -A` / `git add .` 지양.

## 코드 컨벤션

- 기존 파일 수정 우선. 새 파일·문서 최소화.
- Kotlin 코드는 `kr.wepick.leadapp` 패키지 아래에 기능별 서브 패키지로 둔다:
  - `data/db/` — Room Entity, DAO, AppDatabase
  - `data/repo/` — 비즈니스 로직 (Repository)
  - `service/` — WorkManager Worker, 외부 API 클라이언트
  - `ui/screens/` — Compose 화면
  - `ui/nav/` — Navigation Compose 그래프
  - `util/` — 순수 유틸 (PhoneUtils, Preferences 등)
- 긴 작업은 `WorkManager` 로, 10분 한도를 넘길 가능성이 있으면 `ForegroundService` 승격 검토.

## 워커 수명 주의 (PROCESSING 좀비 방지)

- `SttWorker` 가 RTZR 폴링 중 10분 한도로 죽으면 `CallRecord.status='PROCESSING'` 좀비가 남는다.
- 신규 워커 추가 시에도 동일 패턴 발생 가능 → **반드시 워커 시작 시점에 `repo.resetStaleProcessing()` 호출**.
- 현재 `CallFolderScanWorker` / `SttWorker` 양쪽에 안전망 적용. 변경 시 유지 필수.

## 파이프라인 변경 시 검증 절차

기능 수정 후 반드시:
1. `./gradlew assembleDebug` 빌드 통과
2. `adb install -r app/build/outputs/apk/debug/app-debug.apk` 후 실기 검증
3. `adb logcat --pid=$(adb shell pidof kr.wepick.leadapp)` 로 워커 로그 확인
4. `run-as kr.wepick.leadapp` + `adb exec-out` 로 DB 스냅샷 검증
   (WAL 같이 받지 않으면 최신 데이터 안 보임)

## 백엔드 (Next.js / Vercel)

- 운영 URL: `https://lead-manager-app-wepick.vercel.app`
- Vercel Authentication 끄거나 `X-Vercel-Protection-Bypass` 사용 — **앱이 직접 호출하므로 공개 접근 가능해야 함**.
- Gemini / RTZR / Blob 키는 Vercel 환경 변수에만 두고 APK 에 박지 않는다.
