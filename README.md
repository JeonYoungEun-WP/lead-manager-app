# Booster Lead App

Samsung Galaxy 상담사용 잠재고객 관리 앱 (Android · Kotlin · Jetpack Compose).

## 기능

- 잠재고객 리스트 / 검색 / 등록 / 편집 / 삭제
- 전화 걸기 (CALL_PHONE) · 문자 작성 (기본 SMS 앱 인텐트)
- Samsung OS 통화 녹음 파일 자동 수집 (리드 DB 매칭 번호만)
- Gemini 2.5 Flash 로 전사문 + 5줄 요약 자동 생성 (Vercel 프록시 경유)
- 통화내역 타임라인 + 상세 보기

## 폴더 구조

```
booster-lead-app/
├── app/              ← Android 모듈 (Kotlin + Compose)
├── backend/          ← Vercel Functions (Gemini 프록시) — 차차 구현
└── CLAUDE.md
```

## 개발 환경

- Android Studio Panda 3 (2025.3.3 Patch 1) 이상
- JDK 17+ (Android Studio 내장)
- Gradle 8.x (래퍼 포함)
- Kotlin 2.2.10
- minSdk 33 · targetSdk 36

## 빌드 / 설치

### Android Studio 에서
1. 프로젝트 열기: `File > Open > booster-lead-app`
2. 첫 실행 시 Gradle Sync 대기 (5~15분)
3. Galaxy S22+ USB 연결 + 개발자 옵션 + USB 디버깅 ON
4. 상단 ▶ Run 버튼 클릭 → 기기 선택 → 설치

### 명령줄 (선택)
```bash
./gradlew assembleDebug              # APK 생성
./gradlew installDebug                # 연결된 기기에 설치
```

생성 APK 위치: `app/build/outputs/apk/debug/app-debug.apk`

## 사용자 첫 설정 (앱 설치 후)

1. **권한 승인** — 앱 실행 시 전화, 알림 권한 허용
2. **Samsung 통화 녹음 활성화**
   - 전화 앱 → ⋮ → 설정 → 통화 녹음 → "모든 통화 자동 녹음" ON
3. **앱 설정 탭 → "녹음 폴더 선택"** → `/내장 저장공간/Recordings/Call` 선택
4. **앱 설정 탭 → 백엔드 URL 입력** (예: `https://booster-dashboard-nine.vercel.app`)
5. 잠재고객 탭에서 + 버튼으로 리드 등록
6. 통화 시 상대 번호가 리드 DB 에 있으면 자동으로 녹음 파일 수집 → STT → 요약

## 보안 · 프라이버시

- **리드 DB 에 등록된 번호의 통화만** 수집·분석. 가족·지인 통화는 앱이 건드리지 않음.
- API 키는 APK 에 박지 않음. 모든 LLM 호출은 Vercel 프록시 경유.
- 로컬 Room DB 에 저장 (기기에서만 보관).

## 기술적 제약

- **Samsung 한정**. Google Pixel 은 통화녹음 파일 암호화로 접근 불가. iPhone 은 OS 차원 불가.
- Android 10+ 의 통화 녹음 API 제한으로 앱 자체 녹음은 구현하지 않음. Samsung OS 내장 녹음에 의존.

## 라이선스

Internal — (주)위픽 
