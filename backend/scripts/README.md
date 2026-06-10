# Backend scripts

운영 시 1회성 유지보수 도구. 모두 `BLOB_READ_WRITE_TOKEN` 환경변수 필요.

`.env.local` 에 토큰 두고 `node --env-file=.env.local scripts/<name>.mjs` 형태로 실행.

## delete-records.mjs

**용도**: 특정 leadName 들만 어드민에 보존하고 나머지는 transcript JSON + audio blob 모두 삭제.

**사용**:
```bash
# dry-run (삭제 후보만 출력)
KEEP_NAMES="홍길동,김철수" node --env-file=.env.local scripts/delete-records.mjs

# 실제 삭제
KEEP_NAMES="홍길동,김철수" node --env-file=.env.local scripts/delete-records.mjs --apply
```

- `KEEP_NAMES` 는 콤마 구분 (공백 허용).
- `KEEP_NAMES` 가 비어있으면 안전상 거부 (실수 방지).
- audio blob (`audios/...`) 도 보존 transcript 의 startedAt 매칭으로 같이 살림.
- 파싱 불가 path 는 안전상 보존 (수동 검토).

## delete-records-selective.mjs

**용도**: 특정 leadName 의 **특정 시각만** 보존하는 정밀 정리. 어드민 화면 캡처와 동기화할 때.

**설정 파일** (JSON, **gitignore 하세요**):
```json
{
  "keepAll": ["홍길동", "테스트회사"],
  "selective": {
    "김철수": [
      "2026-05-08 14:29",
      "2026-05-08 14:28",
      "2026-05-07 15:55"
    ]
  }
}
```

- `keepAll`: 해당 이름의 모든 통화 보존
- `selective`: 해당 이름은 명시한 KST `yyyy-MM-dd HH:mm` 분 단위 시각만 보존 (나머지 모두 삭제)
- 시각 매칭은 KST (Asia/Seoul) 기준 분 단위. 분 안의 모든 record 가 매칭됨.

**사용**:
```bash
KEEP_CONFIG_PATH=./keep-config.json node --env-file=.env.local scripts/delete-records-selective.mjs
KEEP_CONFIG_PATH=./keep-config.json node --env-file=.env.local scripts/delete-records-selective.mjs --apply
```

## 보안 주의

- 두 스크립트 모두 **상담사 / 고객 실명** 을 받아 처리하므로 입력 데이터(`KEEP_NAMES` 환경변수, `keep-config.json`) 는 **절대 깃에 커밋하지 마세요**.
- 토큰은 `BLOB_READ_WRITE_TOKEN` 만 필요. Vercel 대시보드 → Storage → Blob 에서 복사.
- 작업 끝나면 `.env.local` 의 토큰 값을 비우거나 파일 삭제 권장.
