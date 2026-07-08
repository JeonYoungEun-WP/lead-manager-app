# 상담성과 대시보드 구현 지시 (Claude Code용)

> 이 문서 + `consultation_performance.html` + `consultation_metrics_definition.md` 3종을 함께 컨텍스트에 넣고 개발 시작.

---

## 무엇을 만드나

부스터맥스 어드민의 **성과관리 > 상담성과** 화면.
`consultation_performance.html`이 **완성된 레퍼런스 구현이자 정본 명세**다 — 화면 구조, 계산식, 색 기준, 판정 로직이 전부 이 파일의 JS에 들어있다. 이걸 실제 스택으로 이식하고 더미 데이터를 실DB로 교체하는 것이 과제.

## 기술 스택 (준수)

- 백엔드: FastAPI/Python (`apps/api`), SQLAlchemy, PK = String(36) UUID
- 모든 쿼리에 `organization_id` 필수 (워크스페이스 단위)
- `product_type` enum으로 리드 필터
- 전화번호 평문 조인 금지 → `phone_hash`
- `docs/harness/` 규약 존재 시 준수 (00-공통 + 해당 트랙)
- 프론트: 기존 어드민 스택(React)으로 HTML의 레이아웃·계산 이식. 다크모드 변수 유지

## 절대 규칙

1. **스코프 필터**: 집계는 `product_type IN (CPR+, CPA+)`만. CPA 혼입 금지 (연락대기 노이즈로 전 지표 왜곡).
2. **계산식은 HTML JS가 정본**: renderFunnel(퍼널·누적%), renderLandTable(랜딩 테이블), renderAgent+cardCell(상담사 테이블·카드 이행), renderQuadrant(4분면·상관 판정), renderAgentChart(👑 하이라이트). 분모·색 기준·정렬을 임의 변경 금지.
3. **더미 교체 지점**: JS 상단 `LAND`, `AGENT`, `SUM` 배열 → API 응답으로. 배열 스키마가 곧 API 응답 스키마의 출발점.

## 데이터 소스 매핑

| 화면 데이터 | 원천 |
|---|---|
| 리드·상태값 | leads 테이블 (상태값 enum, 무효 6종 = 결번·중복신청·사전중복·불량·테스트·리워드) |
| 콜터치·통화연결·콜 시각 | 통화앱 콜 로그 (발신 1건=콜터치+1, 통화거절 1초=미연결) |
| 카드 발생·이행 | 액션카드 이벤트 (신규 30분 / 부재중 당일 / 가망 당일·약속±30분) — 판정 기준은 정의서 §3 |
| 배정 | original_owner (본인이 처음 배정받은 리드) |
| 랜딩·브랜드 | 랜딩페이지 ↔ 리드 연결 |

## 구현 순서 (권장)

1. 집계 API 설계: `GET /performance/landing`, `GET /performance/agents` (기간·organization_id 파라미터). 응답 스키마 = HTML의 LAND/AGENT/SUM 구조 기준
2. 판정 로직을 백엔드 집계 쿼리로: 무효DB 분류, 통화연결 판정, 카드 이행 판정 (정의서 체크리스트 §5의 미확정 항목은 구현 전 질문할 것)
3. 프론트 이식: HTML 레이아웃 → React 컴포넌트. 계산은 백엔드 집계값 사용, 4분면·상관·👑은 프론트 계산 유지 가능
4. 정합성 검증: CPR+/CPA+ 실데이터(예: 858건 표본 — 유효 795, 연결 578=72.7%, 예약 270=34.0%)와 대조

## 미확정 — 구현 중 만나면 멈추고 질문

- 방문 상태값이 CPR+/CPA+ 흐름에서 기록되는지 (안 되면 "—" 표시)
- 액션카드 이벤트 테이블의 실제 스키마
- 기간 필터 기본값 (최근 30일?)
- CPS 포함 여부 (현재 제외)
