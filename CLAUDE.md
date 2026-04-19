# booster-lead-app — Claude 작업 지침

## ⚠️ 절대 커밋 금지

- **`.env.local`, `.env`, `.env.*`, `local.properties`, `*.keystore`, `*.jks`** — 환경 시크릿·SDK 경로·서명 키.
- **`.claude/settings.json`, `.claude/settings.local.json`, `.claude/launch.json`** — Bash allow 리스트에 평문 토큰 쌓일 수 있음.
- 히스토리에 올라간 시크릿은 `force push`로 지워도 GitHub 캐시·fork 에 잔존 → **즉시 rotate**.
- 커밋 전 `git status` 로 staged 파일 목록 반드시 확인. `git add -A` / `git add .` 지양.

## 프로젝트 개요

Samsung Galaxy 상담사용 잠재고객 관리 앱 (Android Kotlin + Jetpack Compose).

### 주요 기능 (1차)
- 잠재고객 CRUD (이름·번호·메모·태그·상태)
- 전화 발신 (CALL_PHONE) / 문자 작성 (기본 SMS 앱 인텐트)
- Samsung OS 내장 통화 녹음 파일 감지 → 전화번호 매칭 → STT + 5줄 요약
- 로컬 Room DB 저장

### 구조
```
booster-lead-app/
├── app/               Android Kotlin 메인 모듈
├── backend/           Next.js — Gemini 2.5 Flash 프록시 (Vercel 배포)
├── CLAUDE.md, README.md
└── ...
```

### 스택
- Kotlin 2.2 + Jetpack Compose
- minSdk 33 (Android 13) / targetSdk 36 (Android 16)
- Room 2.7 / Navigation Compose / WorkManager / DataStore
- OkHttp (백엔드 호출용)
- Gemini 2.5 Flash 멀티모달 (오디오 → 전사 + 요약, Vercel 프록시 경유)

## 중요한 기술적 제약

### Samsung 통화 녹음 의존
- 앱 자체는 통화 녹음하지 않음. **Samsung OS 내장 녹음** 파일만 읽음.
- 사용자가 Samsung 전화 앱 설정에서 "모든 통화 자동 녹음" 켜야 함.
- 파일 경로는 SAF(Storage Access Framework) 로 사용자가 `/Recordings/Call/` 지정.
- 그래서 **Samsung 기기 한정** 서비스. Pixel·iPhone 등 다른 기기는 미지원.

### 녹음 필터링 원칙
- `CallFolderScanWorker` 는 폴더 전체를 스캔하지만, **리드 DB 에 등록된 번호만** `CallRecord` 로 저장.
- 매칭 안 되는 파일(가족·지인 등)은 건드리지 않음 — 파일 복사/열기/삭제 어떤 동작도 하지 않음.
- 사용자에게 이 원칙을 설정 화면에 명시.

### API 키 보안
- Gemini API 키를 **APK 에 박지 않음** (디컴파일 유출 위험).
- 앱 → `backend/` Vercel Functions 프록시 → Gemini API 호출 구조.
- 백엔드 URL 은 앱 설정에서 변경 가능 (DataStore 에 저장).

## 작업 기본 방향
- 기존 파일 수정 우선. 새 파일·문서 최소화.
- Kotlin 코드는 `kr.wepick.leadapp` 패키지 아래에 기능별 서브 패키지.
- Compose 화면은 `ui/screens/`, 내비게이션은 `ui/nav/`, DB 는 `data/db/`, 비즈니스 로직은 `data/repo/`.
- 긴 작업은 `WorkManager` (`service/`) 로, 필요 시 ForegroundService 승격.
