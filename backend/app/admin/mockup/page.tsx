"use client";

/**
 * /admin/mockup — 리드 관리 페이지 디자인 목업 (가상 데이터).
 *
 * 실제 CRM(맥스) 통합 시안: 리드 테이블 + 선택 리드 상세 패널에
 * 통화 요약·핵심 포인트·전문 보기·녹음 다운로드를 어떻게 배치할지 제안.
 * 운영 데이터와 무관하며 모든 수치는 예시.
 */

import type { CSSProperties } from "react";
import { useState } from "react";

type CallType = "RECORDED" | "NO_ANSWER" | "MISSED" | "REJECTED";

const CALL_TYPE_LABEL: Record<CallType, string> = {
  RECORDED: "통화성공",
  NO_ANSWER: "부재중",
  MISSED: "놓친 전화",
  REJECTED: "거절",
};

const CALL_TYPE_COLOR: Record<CallType, { bg: string; fg: string }> = {
  RECORDED: { bg: "#e0f2fe", fg: "#075985" },
  NO_ANSWER: { bg: "#f1f5f9", fg: "#475569" },
  MISSED: { bg: "#fed7aa", fg: "#9a3412" },
  REJECTED: { bg: "#fecaca", fg: "#991b1b" },
};

// ── 가상 데이터 ─────────────────────────────────────────

type MockCall = {
  id: number;
  at: string;
  type: CallType;
  durationSec: number | null;
  agent: string;
  hasAudio: boolean;
  summary?: string[];
  keyPoints?: { title: string; detail: string }[];
  transcript?: string;
  callbackAt?: string;
};

type MockLead = {
  id: number;
  name: string;
  phone: string;
  grade: "A" | "B" | "C";
  status: string;
  agent: string;
  tags: string[];
  callbackAt?: string;
  calls: MockCall[];
};

const LEADS: MockLead[] = [
  {
    id: 1,
    name: "김민준",
    phone: "010-1234-5678",
    grade: "A",
    status: "상담 진행중",
    agent: "박상담",
    tags: ["영어회화", "주2회", "재연락"],
    callbackAt: "2026-06-12 14:00",
    calls: [
      {
        id: 11,
        at: "2026-06-10 15:42",
        type: "RECORDED",
        durationSec: 312,
        agent: "박상담",
        hasAudio: true,
        callbackAt: "2026-06-12 14:00",
        summary: [
          "[#재연락 2026-06-12T14:00] 목요일 오후 2시 재연락 약속",
          "주 2회 영어회화 수업 가격(월 30만원) 안내",
          "수강 시간대는 평일 저녁 7시 이후 희망",
          "배우자와 상의 후 결정하겠다고 함",
          "타사(B어학원) 견적과 비교 중 — 가격 민감",
        ],
        keyPoints: [
          { title: "재연락 약속", detail: "6/12(목) 14:00 — 배우자 상의 후 결정" },
          { title: "가격 민감", detail: "B어학원 월 25만원 견적과 비교 중" },
          { title: "시간 제약", detail: "평일 저녁 7시 이후만 가능" },
        ],
        transcript:
          "상담사: 안녕하세요 김민준 고객님, 부스터 영어 박상담입니다. 지난번 문의주신 영어회화 수업 관련해서 연락드렸습니다.\n\n고객: 네 안녕하세요. 마침 궁금한 게 있었어요. 주 2회 수업이면 한 달에 얼마인가요?\n\n상담사: 주 2회 기준 월 30만원이고요, 첫 달은 레벨테스트 포함입니다.\n\n고객: 음… 다른 데는 25만원이던데요. B어학원이요.\n\n상담사: 저희는 원어민 1:1 수업이라 그룹 수업과는 차이가 있습니다. 평일 저녁 시간대도 가능하고요.\n\n고객: 저녁 7시 이후만 되는데 가능한가요?\n\n상담사: 네, 7시·8시 타임 모두 열려 있습니다.\n\n고객: 알겠습니다. 아내랑 상의해보고 목요일 오후 2시쯤 다시 전화 주실 수 있나요?\n\n상담사: 네, 목요일 오후 2시에 다시 연락드리겠습니다. 감사합니다.",
      },
      { id: 12, at: "2026-06-09 11:20", type: "NO_ANSWER", durationSec: null, agent: "박상담", hasAudio: false },
      { id: 13, at: "2026-06-08 16:05", type: "MISSED", durationSec: null, agent: "박상담", hasAudio: false },
    ],
  },
  {
    id: 2,
    name: "이서연",
    phone: "010-9876-5432",
    grade: "B",
    status: "신규",
    agent: "최영업",
    tags: ["수학", "고2"],
    calls: [
      {
        id: 21,
        at: "2026-06-10 10:15",
        type: "RECORDED",
        durationSec: 187,
        agent: "최영업",
        hasAudio: true,
        summary: [
          "고2 자녀 수학 내신 대비 문의",
          "현재 3등급 — 여름방학 집중반 관심",
          "주말반 가능 여부 문의함",
          "학부모 설명회(6/15) 초대 안내",
          "설명회 참석 후 등록 여부 결정 예정",
        ],
        keyPoints: [
          { title: "설명회 초대", detail: "6/15(일) 학부모 설명회 참석 예정" },
          { title: "주말반 희망", detail: "토요일 오전 선호" },
        ],
        transcript:
          "상담사: 안녕하세요, 이서연 학부모님 맞으실까요?\n\n고객: 네 맞아요.\n\n상담사: 고2 자녀분 수학 문의주셨죠. 현재 등급이 어떻게 되나요?\n\n고객: 3등급이에요. 여름방학 때 바짝 올리고 싶어서요…",
      },
    ],
  },
  {
    id: 3,
    name: "정도현",
    phone: "010-5555-2222",
    grade: "C",
    status: "장기 미응답",
    agent: "박상담",
    tags: ["코딩", "초등"],
    calls: [
      { id: 31, at: "2026-06-07 14:30", type: "NO_ANSWER", durationSec: null, agent: "박상담", hasAudio: false },
      { id: 32, at: "2026-06-05 10:00", type: "NO_ANSWER", durationSec: null, agent: "박상담", hasAudio: false },
      { id: 33, at: "2026-06-03 16:45", type: "REJECTED", durationSec: null, agent: "박상담", hasAudio: false },
    ],
  },
];

// ── 컴포넌트 ────────────────────────────────────────────

function fmtDuration(sec: number | null): string {
  if (sec == null) return "-";
  return `${Math.floor(sec / 60)}분 ${String(sec % 60).padStart(2, "0")}초`;
}

function TypeBadge({ t }: { t: CallType }) {
  const c = CALL_TYPE_COLOR[t];
  return (
    <span style={{ ...S.badge, background: c.bg, color: c.fg }}>
      {CALL_TYPE_LABEL[t]}
    </span>
  );
}

export default function LeadMockupPage() {
  const [selectedId, setSelectedId] = useState<number>(1);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const lead = LEADS.find((l) => l.id === selectedId)!;
  const lastRecorded = lead.calls.find((c) => c.type === "RECORDED");

  return (
    <div style={S.shell}>
      {/* ── 사이드바 ── */}
      <aside style={S.sidebar}>
        <div style={S.logo}>부스터맥스</div>
        <nav style={S.nav}>
          {["대시보드", "리드 관리", "통화 기록", "알림", "통계", "설정"].map((m, i) => (
            <div key={m} style={{ ...S.navItem, ...(i === 1 ? S.navItemActive : null) }}>
              {m}
            </div>
          ))}
        </nav>
        <div style={S.mockTag}>DESIGN MOCKUP — 가상 데이터</div>
      </aside>

      <div style={S.main}>
        {/* ── 상단 바 ── */}
        <header style={S.topbar}>
          <h1 style={S.title}>리드 관리</h1>
          <input style={S.search} placeholder="이름·번호·태그 검색" readOnly />
          <div style={S.user}>전영은 ▾</div>
        </header>

        <div style={S.content}>
          {/* ── 리드 테이블 ── */}
          <section style={S.tableWrap}>
            <div style={S.tableHeader}>
              <span>리드 {LEADS.length}명</span>
              <button style={S.btnPrimary}>+ 리드 추가</button>
            </div>
            <table style={S.table}>
              <thead>
                <tr>
                  {["이름", "연락처", "등급", "상태", "담당", "최근 통화", "재연락"].map((h) => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LEADS.map((l) => {
                  const last = l.calls[0];
                  return (
                    <tr
                      key={l.id}
                      onClick={() => { setSelectedId(l.id); setTranscriptOpen(false); }}
                      style={{ ...S.tr, ...(l.id === selectedId ? S.trActive : null) }}
                    >
                      <td style={{ ...S.td, fontWeight: 600 }}>{l.name}</td>
                      <td style={S.td}>{l.phone}</td>
                      <td style={S.td}>
                        <span style={{ ...S.grade, ...S[`grade${l.grade}` as keyof typeof S] as CSSProperties }}>
                          {l.grade}
                        </span>
                      </td>
                      <td style={S.td}>{l.status}</td>
                      <td style={S.td}>{l.agent}</td>
                      <td style={S.td}>{last ? <TypeBadge t={last.type} /> : "-"}</td>
                      <td style={{ ...S.td, color: l.callbackAt ? "#b45309" : "#94a3b8" }}>
                        {l.callbackAt ? `🔔 ${l.callbackAt}` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* ── 리드 상세 패널 ── */}
          <section style={S.detail}>
            {/* 고객 카드 */}
            <div style={S.card}>
              <div style={S.leadHeader}>
                <div>
                  <div style={S.leadName}>
                    {lead.name}
                    <span style={{ ...S.grade, ...S[`grade${lead.grade}` as keyof typeof S] as CSSProperties, marginLeft: 8 }}>
                      {lead.grade}등급
                    </span>
                  </div>
                  <div style={S.leadPhone}>{lead.phone} · 담당 {lead.agent}</div>
                  <div style={S.tags}>
                    {lead.tags.map((t) => <span key={t} style={S.tag}>#{t}</span>)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={S.btnPrimary}>📞 전화</button>
                  <button style={S.btnGhostBorder}>💬 SMS</button>
                </div>
              </div>
              {lead.callbackAt && (
                <div style={S.callbackBanner}>
                  🔔 재연락 예정 — <strong>{lead.callbackAt}</strong> (통화 요약에서 자동 감지됨)
                </div>
              )}
            </div>

            {/* 최근 통화 — AI 요약 */}
            {lastRecorded ? (
              <div style={S.card}>
                <div style={S.callHeader}>
                  <div>
                    <span style={S.sectionTitle}>최근 통화</span>
                    <span style={S.callMeta}>
                      {lastRecorded.at} · {fmtDuration(lastRecorded.durationSec)} · 상담사 {lastRecorded.agent}
                    </span>
                  </div>
                  <TypeBadge t={lastRecorded.type} />
                </div>

                <div style={S.summaryBox}>
                  <div style={S.summaryLabel}>✨ AI 통화 요약</div>
                  <ol style={S.summaryList}>
                    {lastRecorded.summary!.map((s, i) => (
                      <li key={i} style={{ ...S.summaryLine, ...(s.startsWith("[#재연락") ? S.summaryCallback : null) }}>
                        {s}
                      </li>
                    ))}
                  </ol>
                </div>

                <div style={S.keyPoints}>
                  {lastRecorded.keyPoints!.map((k) => (
                    <div key={k.title} style={S.keyPoint}>
                      <div style={S.keyPointTitle}>{k.title}</div>
                      <div style={S.keyPointDetail}>{k.detail}</div>
                    </div>
                  ))}
                </div>

                <div style={S.actionRow}>
                  <button style={S.btnPrimary} onClick={() => setTranscriptOpen(true)}>
                    📄 전문 보기
                  </button>
                  {lastRecorded.hasAudio && (
                    <button style={S.btnGhostBorder} onClick={(e) => e.preventDefault()}>
                      🎧 녹음파일 다운로드
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div style={S.card}>
                <span style={S.sectionTitle}>최근 통화</span>
                <p style={{ color: "#94a3b8", fontSize: 13, margin: "12px 0 0" }}>
                  아직 연결된 통화가 없습니다. (부재중/거절만 기록됨)
                </p>
              </div>
            )}

            {/* 통화 이력 타임라인 */}
            <div style={S.card}>
              <span style={S.sectionTitle}>통화 이력 ({lead.calls.length}건)</span>
              <ul style={S.timeline}>
                {lead.calls.map((c) => (
                  <li key={c.id} style={S.timelineItem}>
                    <span style={S.timelineDot} />
                    <span style={S.timelineAt}>{c.at}</span>
                    <TypeBadge t={c.type} />
                    {c.durationSec != null && <span style={S.timelineDur}>{fmtDuration(c.durationSec)}</span>}
                    {c.hasAudio && <span style={S.audioChip}>🎧</span>}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </div>

      {/* ── 전문 보기 모달 ── */}
      {transcriptOpen && lastRecorded?.transcript && (
        <div style={S.modalOverlay} onClick={() => setTranscriptOpen(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <div>
                <strong>{lead.name}</strong> 통화 전문
                <span style={S.callMeta}> · {lastRecorded.at} · {fmtDuration(lastRecorded.durationSec)}</span>
              </div>
              <button style={S.modalClose} onClick={() => setTranscriptOpen(false)}>✕</button>
            </div>
            <pre style={S.transcript}>{lastRecorded.transcript}</pre>
            <div style={{ ...S.actionRow, marginTop: 12 }}>
              <button style={S.btnGhostBorder} onClick={(e) => e.preventDefault()}>⬇ 전문 .txt 다운로드</button>
              <button style={S.btnGhostBorder} onClick={(e) => e.preventDefault()}>🎧 녹음파일 다운로드</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 스타일 ──────────────────────────────────────────────

const S: Record<string, CSSProperties> = {
  shell: {
    display: "flex",
    minHeight: "100vh",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif',
    background: "#f1f5f9",
    color: "#0f172a",
  },
  sidebar: {
    width: 200,
    background: "#0f172a",
    color: "#cbd5e1",
    display: "flex",
    flexDirection: "column",
    padding: "20px 0",
    flexShrink: 0,
  },
  logo: { fontSize: 18, fontWeight: 700, color: "white", padding: "0 20px 20px" },
  nav: { flex: 1 },
  navItem: { padding: "11px 20px", fontSize: 14, cursor: "pointer" },
  navItemActive: { background: "#1e293b", color: "white", borderLeft: "3px solid #3b82f6", fontWeight: 600 },
  mockTag: {
    margin: "0 12px",
    padding: "8px 10px",
    background: "#7c2d12",
    color: "#fed7aa",
    fontSize: 11,
    fontWeight: 700,
    borderRadius: 6,
    textAlign: "center",
  },
  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  topbar: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "14px 24px",
    background: "white",
    borderBottom: "1px solid #e2e8f0",
  },
  title: { fontSize: 20, margin: 0, fontWeight: 700 },
  search: {
    flex: 1,
    maxWidth: 360,
    padding: "8px 14px",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    fontSize: 13,
    background: "#f8fafc",
  },
  user: { marginLeft: "auto", fontSize: 14, color: "#475569" },
  content: { display: "flex", gap: 20, padding: 24, alignItems: "flex-start" },

  tableWrap: { flex: "1 1 480px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" },
  tableHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 16px",
    fontSize: 14,
    fontWeight: 600,
    borderBottom: "1px solid #e2e8f0",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    background: "#f8fafc",
    color: "#64748b",
    fontWeight: 600,
    fontSize: 12,
    borderBottom: "1px solid #e2e8f0",
    whiteSpace: "nowrap",
  },
  tr: { cursor: "pointer", borderBottom: "1px solid #f1f5f9" },
  trActive: { background: "#eff6ff", boxShadow: "inset 3px 0 0 #3b82f6" },
  td: { padding: "11px 12px", whiteSpace: "nowrap" },
  grade: { display: "inline-block", padding: "1px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700 },
  gradeA: { background: "#dcfce7", color: "#166534" },
  gradeB: { background: "#fef9c3", color: "#854d0e" },
  gradeC: { background: "#f1f5f9", color: "#64748b" },
  badge: { display: "inline-block", padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" },

  detail: { flex: "1 1 520px", display: "flex", flexDirection: "column", gap: 16, minWidth: 0 },
  card: { background: "white", borderRadius: 12, border: "1px solid #e2e8f0", padding: 20 },
  leadHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" },
  leadName: { fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center" },
  leadPhone: { color: "#475569", fontSize: 13, marginTop: 4 },
  tags: { display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" },
  tag: { background: "#f1f5f9", color: "#475569", fontSize: 11, padding: "2px 8px", borderRadius: 999 },
  callbackBanner: {
    marginTop: 14,
    padding: "10px 14px",
    background: "#fef3c7",
    border: "1px solid #fcd34d",
    color: "#92400e",
    borderRadius: 8,
    fontSize: 13,
  },
  callHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: "#0f172a" },
  callMeta: { fontSize: 12, color: "#94a3b8", marginLeft: 8 },
  summaryBox: { background: "#f8fafc", borderRadius: 10, padding: "14px 16px", border: "1px solid #eef2f7" },
  summaryLabel: { fontSize: 12, fontWeight: 700, color: "#6d28d9", marginBottom: 8 },
  summaryList: { margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 5 },
  summaryLine: { fontSize: 13, lineHeight: 1.6 },
  summaryCallback: { color: "#b45309", fontWeight: 600 },
  keyPoints: { display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" },
  keyPoint: { flex: "1 1 140px", background: "#eff6ff", borderRadius: 8, padding: "10px 12px", border: "1px solid #dbeafe" },
  keyPointTitle: { fontSize: 12, fontWeight: 700, color: "#1d4ed8" },
  keyPointDetail: { fontSize: 12, color: "#334155", marginTop: 3, lineHeight: 1.5 },
  actionRow: { display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" },
  btnPrimary: {
    padding: "9px 16px",
    border: "none",
    background: "#2563eb",
    color: "white",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  btnGhostBorder: {
    padding: "9px 16px",
    border: "1px solid #cbd5e1",
    background: "white",
    color: "#334155",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
  },
  timeline: { listStyle: "none", margin: "12px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 10 },
  timelineItem: { display: "flex", alignItems: "center", gap: 10, fontSize: 13 },
  timelineDot: { width: 8, height: 8, borderRadius: "50%", background: "#cbd5e1", flexShrink: 0 },
  timelineAt: { color: "#475569", fontVariantNumeric: "tabular-nums", minWidth: 130 },
  timelineDur: { color: "#94a3b8", fontSize: 12 },
  audioChip: { fontSize: 12 },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
    padding: 24,
  },
  modal: {
    background: "white",
    borderRadius: 14,
    padding: 24,
    width: "min(720px, 100%)",
    maxHeight: "85vh",
    display: "flex",
    flexDirection: "column",
  },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, fontSize: 15 },
  modalClose: { border: "none", background: "transparent", fontSize: 18, cursor: "pointer", color: "#64748b" },
  transcript: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    background: "#f8fafc",
    border: "1px solid #eef2f7",
    padding: 18,
    borderRadius: 10,
    fontSize: 13,
    lineHeight: 1.8,
    overflowY: "auto",
    fontFamily: "inherit",
    margin: 0,
  },
};
