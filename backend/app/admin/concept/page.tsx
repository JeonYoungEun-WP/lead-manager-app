/**
 * /admin/concept — 너처링 × 부스터리드 앱 콜 시스템 연동 개념도 (정적 문서).
 *
 * 한 장 구조: ① 앱 통화 수집 → ② 자동 상태 제안(AI 초안 + 사람 확정)
 *           → ③ 부스터맥스 너처링(상태값 = 시퀀스 트리거) → 폐루프.
 * 부스터맥스 API 연동(②→③ 점선)은 별도 작업.
 */

import type { CSSProperties } from "react";

export const metadata = { title: "연동 개념도 — 부스터리드 × 너처링" };

type Ramp = { fill: string; stroke: string; title: string; sub: string };

// 라이트 팔레트 — 50 fill / 600 stroke / 800 title / 600 sub
const RAMP = {
  blue: { fill: "#E6F1FB", stroke: "#185FA5", title: "#0C447C", sub: "#185FA5" },
  purple: { fill: "#EEEDFE", stroke: "#534AB7", title: "#3C3489", sub: "#534AB7" },
  coral: { fill: "#FAECE7", stroke: "#993C1D", title: "#712B13", sub: "#993C1D" },
  gray: { fill: "#F1EFE8", stroke: "#5F5E5A", title: "#2C2C2A", sub: "#5F5E5A" },
  green: { fill: "#EAF3DE", stroke: "#3B6D11", title: "#27500A", sub: "#3B6D11" },
  red: { fill: "#FCEBEB", stroke: "#A32D2D", title: "#791F1F", sub: "#A32D2D" },
} satisfies Record<string, Ramp>;

const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#94a3b8";
const DASH = "#cbd5e1";

/** 가운데 정렬 노드 — 제목 1줄 + 부제 1~2줄 */
function CNode(p: { x: number; y: number; w: number; h: number; ramp: Ramp; title: string; subs: string[] }) {
  const cx = p.x + p.w / 2;
  const titleDy = p.subs.length > 1 ? 20 : 18;
  const subDys = p.subs.length > 1 ? [40, 58] : [36];
  return (
    <g>
      <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={8} fill={p.ramp.fill} stroke={p.ramp.stroke} strokeWidth={0.75} />
      <text x={cx} y={p.y + titleDy} textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={600} fill={p.ramp.title}>
        {p.title}
      </text>
      {p.subs.map((s, i) => (
        <text key={s} x={cx} y={p.y + subDys[i]} textAnchor="middle" dominantBaseline="central" fontSize={12} fill={p.ramp.sub}>
          {s}
        </text>
      ))}
    </g>
  );
}

/** 왼쪽 정렬 노드 — 제목 + 항목 리스트 */
function LNode(p: { x: number; y: number; w: number; h: number; ramp: Ramp; title: string; rows: string[]; rowStart: number; rowGap: number }) {
  const tx = p.x + 24;
  return (
    <g>
      <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={8} fill={p.ramp.fill} stroke={p.ramp.stroke} strokeWidth={0.75} />
      <text x={tx} y={p.y + 24} dominantBaseline="central" fontSize={14} fontWeight={600} fill={p.ramp.title}>
        {p.title}
      </text>
      {p.rows.map((r, i) => (
        <text key={r} x={tx} y={p.y + p.rowStart + i * p.rowGap} dominantBaseline="central" fontSize={12} fill={p.ramp.sub}>
          {r}
        </text>
      ))}
    </g>
  );
}

function ConceptDiagram() {
  return (
    <svg width="100%" viewBox="0 0 680 860" role="img" aria-labelledby="concept-title">
      <title id="concept-title">너처링 × 앱 콜 시스템 연동 개념도</title>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
          <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>

      {/* 통화 이벤트 */}
      <rect x={230} y={30} width={220} height={44} rx={8} fill="#f1f5f9" stroke={DASH} strokeWidth={0.75} />
      <text x={340} y={52} textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={600} fill={INK}>
        고객 ↔ 상담사 통화
      </text>
      <line x1={340} y1={78} x2={340} y2={98} stroke={LINE} strokeWidth={1.5} markerEnd="url(#arrow)" />

      {/* ① 부스터리드 앱 */}
      <rect x={40} y={104} width={600} height={202} rx={12} fill="none" stroke={DASH} strokeDasharray="4 4" />
      <text x={60} y={130} fontSize={14} fontWeight={700} fill={INK}>① 부스터리드 앱 — 통화 자동 수집</text>
      <CNode x={60} y={146} w={560} h={56} ramp={RAMP.blue} title="통화 감지·분류"
        subs={["통화성공 · 부재중(음성사서함 포함) · 놓친 전화 · 거절"]} />
      <line x1={340} y1={206} x2={340} y2={224} stroke={LINE} strokeWidth={1.5} markerEnd="url(#arrow)" />
      <CNode x={60} y={230} w={560} h={56} ramp={RAMP.blue} title="AI 분석 — RTZR 전사 + Claude 요약"
        subs={["요약 5줄 · 재연락 마커 · 통화 결과 분류 · 음성사서함 판정"]} />
      <line x1={340} y1={310} x2={340} y2={334} stroke={LINE} strokeWidth={1.5} markerEnd="url(#arrow)" />

      {/* ② 자동 상태 제안 */}
      <rect x={40} y={340} width={600} height={210} rx={12} fill="none" stroke={DASH} strokeDasharray="4 4" />
      <text x={60} y={366} fontSize={14} fontWeight={700} fill={INK}>② 자동 상태 제안 — AI 초안 (서버)</text>
      <LNode x={60} y={382} w={350} h={148} ramp={RAMP.purple} title="상태 초안 생성 — suggestStatus" rowStart={52} rowGap={22}
        rows={[
          "부재중 n회 누적 — 5회 소진 시 장기부재",
          "재연락 + 일시 입력 → 콜백 약속",
          "재연락 미정 → +2일 14:00 (주말은 월요일)",
          "예약확정 → 예약성공 + 예약 일시",
          "거절의사 → 예약실패 (제안만)",
        ]} />
      <LNode x={430} y={382} w={190} h={148} ramp={RAMP.purple} title="사람 확정 원칙" rowStart={56} rowGap={28}
        rows={["자동 제안 표시", "원클릭 수정·되돌리기", "영구종료는 승인 필수"]} />
      <line x1={340} y1={554} x2={340} y2={578} stroke={LINE} strokeWidth={1.5} strokeDasharray="5 4" markerEnd="url(#arrow)" />
      <text x={356} y={568} fontSize={12} fill={MUTED}>부스터맥스 API — 별도 연동</text>

      {/* ③ 부스터맥스 너처링 */}
      <rect x={40} y={584} width={600} height={230} rx={12} fill="none" stroke={DASH} strokeDasharray="4 4" />
      <text x={60} y={610} fontSize={14} fontWeight={700} fill={INK}>③ 부스터맥스 너처링 — 상태값이 시퀀스를 가동</text>
      <CNode x={60} y={626} w={173} h={76} ramp={RAMP.coral} title="연락대기" subs={["프리셋 1", "즉시 시작"]} />
      <CNode x={253} y={626} w={173} h={76} ramp={RAMP.coral} title="부재중" subs={["프리셋 2", "콜 D+0·1·2·4·7"]} />
      <CNode x={446} y={626} w={174} h={76} ramp={RAMP.gray} title="총량 캡" subs={["콜 6회 · SMS 6건", "재시작 2회"]} />
      <CNode x={60} y={718} w={150} h={76} ramp={RAMP.coral} title="재연락+일시 입력" subs={["콜백 약속 +80", "알림 2회 · 캡 무관"]} />
      <CNode x={226} y={718} w={120} h={76} ramp={RAMP.coral} title="재연락 미정" subs={["프리셋 3", "D+2·3·7"]} />
      <CNode x={362} y={718} w={120} h={76} ramp={RAMP.green} title="예약 성공" subs={["성공 · 프리셋 4", "D-1 리마인드"]} />
      <CNode x={498} y={718} w={120} h={76} ramp={RAMP.red} title="예약 실패" subs={["실패 · 영구종료", "발송 차단"]} />

      {/* 폐루프 */}
      <text x={340} y={838} textAnchor="middle" fontSize={12} fill={MUTED}>
        ↻ 너처링이 만든 콜 일정·고객 회신 전화 → 새 통화 발생 → ① 에서 다시 수집 (폐루프)
      </text>
    </svg>
  );
}

export default function ConceptPage() {
  return (
    <div style={P.shell}>
      <div style={P.container}>
        <header style={P.head}>
          <div>
            <h1 style={P.h1}>너처링 × 부스터리드 앱 — 연동 개념도</h1>
            <p style={P.subtitle}>
              통화 결과가 리드 상태값이 되고, 상태값이 너처링 시퀀스를 가동하는 폐루프 구조
            </p>
          </div>
          <nav style={P.nav}>
            <a href="/admin" style={P.navLink}>어드민</a>
            <a href="/admin/mockup" style={P.navLink}>목업</a>
          </nav>
        </header>

        <div style={P.card}>
          <div style={P.scrollX}>
            <div style={{ minWidth: 680 }}>
              <ConceptDiagram />
            </div>
          </div>
        </div>

        <section style={P.notes}>
          <div style={P.note}>
            <strong style={P.noteTitle}>연동 인터페이스는 “리드 상태값” 하나</strong>
            앱(①)은 통화를 수집·분석해 상태 초안(②)을 만들고, 너처링(③)은 그 상태값을 트리거로
            시퀀스를 가동합니다. 두 시스템은 상태값으로만 만나므로 부스터맥스 API(점선 구간)만 연결하면
            그대로 맞물립니다.
          </div>
          <div style={P.note}>
            <strong style={P.noteTitle}>②와 ③ 사이에 사람이 서 있음 (AI 초안 + 사람 확정)</strong>
            AI는 초안만 만들고, 시퀀스를 실제로 가동시키는 상태 확정은 상담사 몫입니다. 특히
            예약실패(영구종료)는 제안만 하고 자동 적용하지 않습니다.
          </div>
          <div style={P.note}>
            <strong style={P.noteTitle}>맨 아래 폐루프가 핵심</strong>
            너처링이 잡은 콜 일정(프리셋 2의 D+0·1·2·4·7 등)이나 SMS 를 받은 고객의 회신 전화가
            새 통화를 만들면 앱이 다시 수집·분류해 상태를 갱신합니다. 부재중 5회 소진 → 장기부재 전환,
            재연락 미정의 +2일 기본값이 프리셋 3의 D+2와 맞물립니다.
          </div>
        </section>

        <footer style={P.footer}>DESIGN DOC — 부스터맥스 API 연동(②→③)은 별도 작업</footer>
      </div>
    </div>
  );
}

const P: Record<string, CSSProperties> = {
  shell: { minHeight: "100vh", background: "#f8fafc", padding: "32px 16px", color: "#0f172a" },
  container: { maxWidth: 860, margin: "0 auto" },
  head: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 20 },
  h1: { fontSize: 22, fontWeight: 700, margin: 0 },
  subtitle: { color: "#64748b", fontSize: 14, margin: "6px 0 0" },
  nav: { display: "flex", gap: 8, flexShrink: 0 },
  navLink: {
    fontSize: 13, color: "#475569", textDecoration: "none", border: "1px solid #e2e8f0",
    borderRadius: 8, padding: "6px 12px", background: "#fff",
  },
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "20px 16px" },
  scrollX: { overflowX: "auto" },
  notes: { display: "grid", gap: 10, marginTop: 20, fontSize: 14, lineHeight: 1.7, color: "#334155" },
  note: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 18px" },
  noteTitle: { display: "block", marginBottom: 4, color: "#0f172a" },
  footer: { textAlign: "center", color: "#94a3b8", fontSize: 12, margin: "24px 0 8px" },
};
