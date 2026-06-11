"use client";

/**
 * /admin/mockup — 부스터맥스(BoosterMAX) 잠재고객 페이지 통합 시안 (가상 데이터).
 *
 * 부스터리드 앱이 자동 업로드하는 통화 기록을 부스터맥스 UI 에 통합하는 제안:
 *   - 상담이력에 AI 통화 기록 자동 추가 (✨통화성공/부재중 배지, 요약, 전문 보기)
 *   - 상담내용/상담일시 자동 입력, 상담 녹취록 자동 업로드 (다운로드는 이곳 한 군데)
 *   - 상단 토글: 데스크톱 / 모바일 (폰 프레임 3장: 목록·상세·전문)
 */

import type { CSSProperties } from "react";
import { useState } from "react";

// ── 가상 데이터 ─────────────────────────────────────────

type AiCall = {
  kind: "ai-call";
  id: number;
  badge: "통화성공" | "부재중";
  at: string;
  durationSec: number | null;
  agent: string;
  hasAudio: boolean;
  summary?: string[];
  keyPoints?: { title: string; detail: string }[];
  transcript?: string;
};
type ManualEntry = { kind: "manual"; id: number; badge: string; at: string; lines: string[] };
type HistoryEntry = AiCall | ManualEntry;

const HISTORY: HistoryEntry[] = [
  {
    kind: "ai-call",
    id: 1,
    badge: "통화성공",
    at: "2026.06.10 14:26",
    durationSec: 312,
    agent: "전영은",
    hasAudio: true,
    summary: [
      "[#재연락 2026-06-11T16:30] 내일 오후 4시 반 재연락 약속",
      "랜딩페이지 제작 패키지 가격(월 49만원) 안내",
      "현재 타사 빌더 사용 중 — 이전 비용 문의",
      "구글시트 연동 기능에 높은 관심 보임",
      "결정권자(대표) 보고 후 회신 예정",
    ],
    keyPoints: [
      { title: "재연락 약속", detail: "6/11(목) 16:30 — 대표 보고 후" },
      { title: "이전 비용", detail: "타사 빌더 → 부스터맥스 마이그레이션 문의" },
      { title: "관심 기능", detail: "구글시트 리드 연동" },
    ],
    transcript:
      "상담사: 안녕하세요 황순님, 상용워크플레이스 전영은입니다. 랜딩페이지 문의주셔서 연락드렸습니다.\n\n고객: 네 안녕하세요. 지금 다른 빌더를 쓰고 있는데 옮기려면 비용이 어떻게 되나요?\n\n상담사: 제작 패키지가 월 49만원이고, 기존 페이지 이전은 무료로 도와드립니다.\n\n고객: 구글시트로 리드 받는 것도 되나요? 그게 제일 중요해서요.\n\n상담사: 네, 구글시트 연동은 기본 제공입니다. 유입되는 즉시 시트에 쌓입니다.\n\n고객: 좋네요. 대표님께 보고하고 내일 오후 4시 반쯤 다시 통화 가능할까요?\n\n상담사: 네, 내일 16시 30분에 다시 연락드리겠습니다. 감사합니다.",
  },
  {
    kind: "manual",
    id: 2,
    badge: "재연락",
    at: "2026.06.10 14:26",
    lines: ["연락대기 → 재연락", "상담사: 전영은", "📅 상담일시: 2026.06.11 16:30"],
  },
  {
    kind: "ai-call",
    id: 3,
    badge: "부재중",
    at: "2026.06.09 11:20",
    durationSec: null,
    agent: "전영은",
    hasAudio: false,
  },
  { kind: "manual", id: 4, badge: "연락대기", at: "2026.05.20 17:47", lines: ["리드유입"] },
];

const ROWS = [
  { no: 277, at: "2026.05.20 17:47", svc: "구글연동", route: "구글시트", proj: "-", name: "황순6", phone: "010-5113-1116", status: "재연락", agent: "이유림", touch: 1, ai: true },
  { no: 276, at: "2026.05.20 17:42", svc: "BoosterMAX", route: "폼 제출", proj: "상용워크플레이스", name: "미장센", phone: "010-5291-1944", status: "연락대기", agent: "전영은", touch: 0, ai: false },
  { no: 275, at: "2026.05.20 17:19", svc: "구글연동", route: "구글시트", proj: "-", name: "황순5", phone: "010-5113-1115", status: "연락대기", agent: "이유림", touch: 0, ai: false },
  { no: 274, at: "2026.05.20 14:42", svc: "BoosterMAX", route: "폼 제출", proj: "상용워크플레이스", name: "에스파", phone: "010-5291-1948", status: "연락대기", agent: "이유림", touch: 0, ai: false },
  { no: 273, at: "2026.05.14 17:03", svc: "엑셀", route: "엑셀", proj: "상용워크플레이스", name: "네번째", phone: "010-5558-6857", status: "연락대기", agent: "이유림", touch: 0, ai: false },
];

const STATS: [string, number][] = [
  ["전체", 277], ["연락대기", 275], ["부재중", 1], ["반려", 0], ["기타", 0],
  ["재연락", 1], ["예약성공", 0], ["예약실패", 0], ["방문성공", 0],
  ["방문취소", 0], ["결제성공", 0], ["결제실패", 0], ["블랙리스트", 0],
];

function fmtDur(sec: number | null): string {
  if (sec == null) return "";
  return `${Math.floor(sec / 60)}분 ${String(sec % 60).padStart(2, "0")}초`;
}

// ── 페이지 ──────────────────────────────────────────────

export default function BoosterMaxMockup() {
  const [view, setView] = useState<"desktop" | "mobile">("desktop");
  const [modalOpen, setModalOpen] = useState(true);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const aiCall = HISTORY[0] as AiCall;

  return (
    <div style={S.shell}>
      {/* ── 사이드바 ── */}
      <aside style={S.sidebar}>
        <div style={S.ws}>
          <div style={S.wsIcon}>B</div>
          <div>
            <div style={S.wsName}>상용워크플레이스</div>
            <div style={S.wsMail}>youngeun@wepick.kr</div>
          </div>
        </div>
        <nav style={S.nav}>
          <div style={S.navItem}>▦ 대시보드</div>
          <div style={S.navItem}>◇ 랜딩빌더</div>
          <div style={S.navItem}>👥 잠재고객</div>
          <div style={{ ...S.navSub, ...S.navActive }}>잠재고객</div>
          <div style={S.navItem}>📈 성과관리</div>
          <div style={S.navItem}>⚙ 설정</div>
        </nav>
        <div style={S.mockTag}>DESIGN MOCKUP — 가상 데이터</div>
        <div style={S.brand}>booster<strong>MAX</strong></div>
      </aside>

      <main style={S.main}>
        <div style={S.pageHead}>
          <div>
            <h1 style={S.h1}>잠재고객 ⓘ</h1>
            <div style={S.subtitle}>리드를 확인하고 관리해요.</div>
          </div>
          {/* 데스크톱/모바일 토글 */}
          <div style={S.segmented}>
            <button
              style={{ ...S.segBtn, ...(view === "desktop" ? S.segBtnActive : null) }}
              onClick={() => setView("desktop")}
            >🖥 데스크톱</button>
            <button
              style={{ ...S.segBtn, ...(view === "mobile" ? S.segBtnActive : null) }}
              onClick={() => setView("mobile")}
            >📱 모바일</button>
          </div>
        </div>

        {view === "desktop" ? (
          <>
            <div style={S.stats}>
              {STATS.map(([k, v]) => (
                <div key={k} style={S.stat}>
                  <div style={S.statLabel}>{k}</div>
                  <div style={{ ...S.statValue, ...(k === "전체" ? { color: "#2563eb" } : v > 0 && k !== "연락대기" ? { color: "#0f172a" } : null) }}>
                    {v}
                  </div>
                </div>
              ))}
            </div>

            <div style={S.tableCard}>
              <table style={S.table}>
                <thead>
                  <tr>
                    {["번호", "유입일시", "서비스명", "유입경로", "프로젝트명", "고객정보", "상태", "콜상담사", "콜터치수", "최근 통화"].map((h) => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r, i) => (
                    <tr
                      key={r.no}
                      style={{ ...S.tr, ...(i === 0 ? S.trActive : null) }}
                      onClick={() => i === 0 && setModalOpen(true)}
                    >
                      <td style={S.td}>{r.no}</td>
                      <td style={S.td}>{r.at}</td>
                      <td style={S.td}>{r.svc}</td>
                      <td style={S.td}><span style={S.routeChip}>{r.route}</span></td>
                      <td style={S.td}>{r.proj}</td>
                      <td style={S.td}>
                        <div style={{ fontWeight: 600 }}>{r.name}</div>
                        <div style={{ color: "#94a3b8", fontSize: 14 }}>{r.phone}</div>
                      </td>
                      <td style={S.td}>
                        <span style={r.status === "재연락" ? S.chipBlue : S.chipGray}>{r.status}</span>
                      </td>
                      <td style={S.td}>{r.agent} ▾</td>
                      <td style={{ ...S.td, textAlign: "center" }}>{r.touch}</td>
                      <td style={S.td}>
                        {r.ai ? <span style={S.aiChip}>✨ 통화성공 · 요약 있음</span> : <span style={{ color: "#cbd5e1" }}>-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={S.tableHint}>※ 첫 행(황순6)을 클릭하면 통화 기록이 통합된 고객 상세를 볼 수 있습니다.</div>
            </div>
          </>
        ) : (
          /* ── 모바일 시안: 폰 프레임 3장 ── */
          <div style={M.wrap}>
            {/* ① 목록 */}
            <PhoneFrame label="① 잠재고객 목록">
              <div style={M.topbar}>
                <strong style={{ fontSize: 18 }}>잠재고객</strong>
                <span style={{ marginLeft: "auto", color: "#94a3b8" }}>⌕ ☰</span>
              </div>
              <div style={M.chipScroll}>
                {[["전체", 277], ["연락대기", 275], ["재연락", 1], ["부재중", 1]].map(([k, v]) => (
                  <span key={k} style={{ ...M.statChip, ...(k === "전체" ? M.statChipActive : null) }}>
                    {k} <strong>{v}</strong>
                  </span>
                ))}
              </div>
              {ROWS.slice(0, 4).map((r, i) => (
                <div key={r.no} style={{ ...M.leadCard, ...(i === 0 ? M.leadCardActive : null) }}>
                  <div style={M.leadTop}>
                    <strong style={{ fontSize: 16 }}>{r.name}</strong>
                    <span style={r.status === "재연락" ? S.chipBlue : S.chipGray}>{r.status}</span>
                  </div>
                  <div style={M.leadPhone}>{r.phone} · {r.agent}</div>
                  <div style={M.leadMeta}>
                    {r.ai
                      ? <span style={S.aiChip}>✨ 통화성공 · 요약</span>
                      : <span style={{ color: "#cbd5e1", fontSize: 13 }}>통화 기록 없음</span>}
                    <span style={{ marginLeft: "auto", color: "#94a3b8", fontSize: 13 }}>콜터치 {r.touch}</span>
                  </div>
                </div>
              ))}
            </PhoneFrame>

            {/* ② 고객 상세 */}
            <PhoneFrame label="② 고객 상세">
              <div style={M.topbar}>
                <span style={{ color: "#475569" }}>←</span>
                <strong style={{ fontSize: 17, marginLeft: 10 }}>황순6</strong>
                <span style={{ ...S.chipBlue, marginLeft: 8 }}>재연락</span>
              </div>
              <div style={M.section}>
                <div style={M.custRow}>
                  <div>
                    <div style={{ color: "#475569" }}>📞 010-5113-1116</div>
                    <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 2 }}>신청일 2026.05.20 17:47 · 구글시트</div>
                  </div>
                  <button style={M.callBtn}>📞 콜상담</button>
                </div>
              </div>

              {/* AI 통화 카드 */}
              <div style={M.section}>
                <div style={M.sectionTitle}>최근 통화</div>
                <div style={S.aiCard}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={S.chipSky}>✨ 통화성공</span>
                    <span style={{ marginLeft: "auto", color: "#94a3b8", fontSize: 13 }}>06.10 14:26</span>
                  </div>
                  <div style={S.aiMeta}>{fmtDur(aiCall.durationSec)} · 상담사 {aiCall.agent} · 자동 기록</div>
                  <ol style={S.aiSummary}>
                    {aiCall.summary!.slice(0, 3).map((s, i) => (
                      <li key={i} style={s.startsWith("[#재연락") ? S.aiCallbackLine : undefined}>{s}</li>
                    ))}
                    <li style={{ color: "#94a3b8" }}>… 더보기</li>
                  </ol>
                  <div style={S.kpRow}>
                    {aiCall.keyPoints!.map((k) => <span key={k.title} style={S.kpChip}>{k.title}</span>)}
                  </div>
                  <button style={{ ...S.btnSmall, marginTop: 12, width: "100%" }}>📄 전문 보기</button>
                </div>
              </div>

              {/* 상담 작성 (자동 채움) */}
              <div style={M.section}>
                <div style={M.sectionTitle}>콜상담 작성</div>
                <div style={M.fieldLabel}>상담내용 <span style={S.autoMini}>✨ 자동 입력</span></div>
                <div style={S.textareaFilled}>
                  랜딩페이지 패키지(월 49만원) 안내. 구글시트 연동 관심.
                  대표 보고 후 6/11(목) 16:30 재연락 약속.
                </div>
                <div style={{ ...M.fieldLabel, marginTop: 12 }}>상담일시 <span style={S.autoMini}>✨ 자동 감지</span></div>
                <div style={S.select}>2026-06-11 16:30</div>
                <div style={{ ...M.fieldLabel, marginTop: 12 }}>상담 녹취록</div>
                <div style={S.audioBox}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>🎧 통화녹음_황순6_20260610.m4a</div>
                  <div style={{ color: "#16a34a", fontSize: 13, marginTop: 2 }}>✓ 앱에서 자동 업로드됨 · 5분 12초</div>
                  <button style={{ ...S.btnSmall, marginTop: 10 }}>⬇ 다운로드</button>
                </div>
                <button style={{ ...M.callBtn, width: "100%", marginTop: 14 }}>저장</button>
              </div>

              {/* 상담이력 압축 */}
              <div style={M.section}>
                <div style={M.sectionTitle}>상담이력 4건</div>
                {HISTORY.map((h) => (
                  <div key={h.id} style={M.histRow}>
                    <span style={
                      h.badge === "통화성공" ? S.chipSky
                      : h.badge === "재연락" ? S.chipBlue
                      : S.chipGray
                    }>
                      {h.kind === "ai-call" && "✨ "}{h.badge}
                    </span>
                    <span style={{ marginLeft: "auto", color: "#94a3b8", fontSize: 13 }}>{h.at}</span>
                  </div>
                ))}
              </div>
            </PhoneFrame>

            {/* ③ 전문 보기 */}
            <PhoneFrame label="③ 통화 전문">
              <div style={M.topbar}>
                <span style={{ color: "#475569" }}>←</span>
                <strong style={{ fontSize: 17, marginLeft: 10 }}>통화 전문</strong>
                <span style={{ marginLeft: "auto", color: "#94a3b8", fontSize: 13 }}>06.10 14:26 · 5분 12초</span>
              </div>
              <div style={{ padding: 16 }}>
                <pre style={{ ...S.transcript, fontSize: 14.5 }}>{aiCall.transcript}</pre>
                <button style={{ ...S.btnSmallGhost, marginTop: 12, width: "100%" }}>⬇ 전문 .txt 다운로드</button>
              </div>
            </PhoneFrame>
          </div>
        )}
      </main>

      {/* ── 데스크톱: 고객 상세 모달 ── */}
      {view === "desktop" && modalOpen && (
        <div style={S.overlay}>
          <div style={S.modal}>
            <div style={S.modalHead}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <strong style={{ fontSize: 20 }}>황순6</strong>
                <span style={S.chipBlue}>재연락</span>
              </div>
              <div style={{ display: "flex", gap: 14, color: "#94a3b8" }}>
                <span>‹</span><span>›</span>
                <span style={{ cursor: "pointer" }} onClick={() => setModalOpen(false)}>✕</span>
              </div>
            </div>

            <div style={S.cols}>
              {/* ① 고객 정보 */}
              <section style={S.col1}>
                <div style={S.colTitle}>👤 고객 정보 <span style={S.lpChip}>랜딩페이지</span></div>
                <div style={S.custCard}>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>황순6</div>
                  <div style={{ color: "#475569", marginTop: 4 }}>📞 010-5113-1116</div>
                </div>
                <div style={S.infoBlock}>
                  <div style={S.infoTitle}>ⓘ 유입 정보</div>
                  {[["브랜드", "-"], ["프로젝트", "-"], ["랜딩페이지", "-"], ["신청일", "2026.05.20 17:47"]].map(([k, v]) => (
                    <div key={k} style={S.infoRow}><span style={S.infoKey}>{k}</span><span>{v}</span></div>
                  ))}
                </div>
                <div style={S.infoBlock}>
                  <div style={S.infoTitle}>📝 폼 입력값</div>
                  <div style={{ color: "#94a3b8", fontSize: 15 }}>입력값 없음</div>
                </div>
                <div style={S.infoBlock}>
                  <div style={S.infoTitle}>✓ 동의 현황</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {["개인정보", "제3자제공", "마케팅"].map((t) => <span key={t} style={S.chipGray}>{t}</span>)}
                  </div>
                </div>
              </section>

              {/* ② 상담 작성 */}
              <section style={S.col2}>
                <div style={S.colTitle}>📋 상담 작성</div>
                <button style={S.callBtn}>📞 콜상담</button>
                <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0 10px" }}>
                  <strong style={{ fontSize: 16 }}>| 콜상담 작성</strong>
                  <span style={S.chipBlue}>재연락</span>
                </div>

                <div style={S.formRow}>
                  <span style={S.formKey}>상태값</span>
                  <div style={S.select}>재연락 ▾</div>
                </div>
                <div style={S.formRow}>
                  <span style={S.formKey}>상담내용</span>
                  <div style={S.textareaFilled}>
                    <div style={S.autoFillTag}>✨ 통화 요약에서 자동 입력됨 — 수정 가능</div>
                    랜딩페이지 제작 패키지(월 49만원) 안내. 타사 빌더에서 이전 희망,
                    구글시트 연동에 관심. 대표 보고 후 6/11(목) 16:30 재연락 약속.
                  </div>
                </div>
                <div style={S.formRow}>
                  <span style={S.formKey}>상담일시</span>
                  <div style={S.select}>
                    2026-06-11 16:30 <span style={S.autoMini}>✨ 재연락 마커 자동 감지</span>
                  </div>
                </div>
                <div style={{ textAlign: "right", margin: "12px 0 18px" }}>
                  <button style={S.saveBtn}>저장</button>
                </div>

                {/* 녹취록 — 다운로드는 여기 한 곳에만 */}
                <div style={S.formRow}>
                  <span style={S.formKey}>상담 녹취록</span>
                  <div style={S.audioBox}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span>🎧</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>통화녹음_황순6_20260610.m4a</div>
                        <div style={{ color: "#16a34a", fontSize: 14 }}>✓ 부스터리드 앱에서 자동 업로드됨 · 5분 12초</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button style={S.btnSmall} onClick={(e) => e.preventDefault()}>⬇ 다운로드</button>
                      <button style={S.btnSmallGhost}>파일 선택 (MP3, WAV, M4A)</button>
                    </div>
                  </div>
                </div>
              </section>

              {/* ③ 상담이력 */}
              <section style={S.col3}>
                <div style={S.colTitle}>
                  🕘 상담이력 <span style={S.countChip}>{HISTORY.length}건</span>
                </div>
                <div style={S.history}>
                  {HISTORY.map((h) => (
                    <div key={h.id} style={S.histItem}>
                      <div style={S.histHead}>
                        <span style={
                          h.badge === "통화성공" ? S.chipSky
                          : h.badge === "부재중" ? S.chipGray
                          : h.badge === "재연락" ? S.chipBlue
                          : S.chipGray
                        }>
                          {h.kind === "ai-call" && "✨ "}{h.badge}
                        </span>
                        <span style={S.histAt}>{h.at}</span>
                      </div>

                      {h.kind === "manual" && (
                        <div style={S.histBody}>
                          {h.lines.map((l) => <div key={l}>{l}</div>)}
                        </div>
                      )}

                      {h.kind === "ai-call" && h.summary && (
                        <div style={S.aiCard}>
                          <div style={S.aiMeta}>
                            {fmtDur(h.durationSec)} · 상담사 {h.agent} · 부스터리드 앱 자동 기록
                          </div>
                          <ol style={S.aiSummary}>
                            {h.summary.map((s, i) => (
                              <li key={i} style={s.startsWith("[#재연락") ? S.aiCallbackLine : undefined}>{s}</li>
                            ))}
                          </ol>
                          <div style={S.kpRow}>
                            {h.keyPoints!.map((k) => (
                              <span key={k.title} style={S.kpChip} title={k.detail}>{k.title}</span>
                            ))}
                          </div>
                          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                            <button style={S.btnSmall} onClick={() => setTranscriptOpen(true)}>📄 전문 보기</button>
                          </div>
                        </div>
                      )}

                      {h.kind === "ai-call" && !h.summary && (
                        <div style={S.histBody}>발신 — 고객이 받지 않음 (부스터리드 앱 자동 기록)</div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>

          {/* 전문 보기 (중첩 모달) */}
          {transcriptOpen && (
            <div style={S.overlay2} onClick={() => setTranscriptOpen(false)}>
              <div style={S.tModal} onClick={(e) => e.stopPropagation()}>
                <div style={S.modalHead}>
                  <div>
                    <strong>황순6</strong> 통화 전문
                    <span style={{ color: "#94a3b8", fontSize: 14, marginLeft: 8 }}>
                      2026.06.10 14:26 · {fmtDur(aiCall.durationSec)}
                    </span>
                  </div>
                  <span style={{ cursor: "pointer", color: "#94a3b8" }} onClick={() => setTranscriptOpen(false)}>✕</span>
                </div>
                <pre style={S.transcript}>{aiCall.transcript}</pre>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button style={S.btnSmallGhost} onClick={(e) => e.preventDefault()}>⬇ 전문 .txt 다운로드</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 폰 프레임 ───────────────────────────────────────────

function PhoneFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={M.frameWrap}>
      <div style={M.frameLabel}>{label}</div>
      <div style={M.frame}>
        <div style={M.notch} />
        <div style={M.screen}>{children}</div>
      </div>
    </div>
  );
}

// ── 스타일 (폰트 +2 적용) ───────────────────────────────

const S: Record<string, CSSProperties> = {
  shell: {
    display: "flex",
    minHeight: "100vh",
    background: "#f7f8fa",
    color: "#1e293b",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif',
    fontSize: 16,
  },
  sidebar: {
    width: 230,
    background: "white",
    borderRight: "1px solid #eef0f4",
    display: "flex",
    flexDirection: "column",
    padding: "16px 12px",
    flexShrink: 0,
  },
  ws: { display: "flex", gap: 10, alignItems: "center", padding: "4px 8px 16px" },
  wsIcon: {
    width: 36, height: 36, borderRadius: 8, background: "#0f172a", color: "white",
    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16,
  },
  wsName: { fontWeight: 700, fontSize: 16 },
  wsMail: { fontSize: 13, color: "#94a3b8" },
  nav: { flex: 1, display: "flex", flexDirection: "column", gap: 2 },
  navItem: { padding: "10px 10px", fontWeight: 600, color: "#334155", borderRadius: 8, fontSize: 15.5 },
  navSub: { padding: "8px 10px 8px 34px", color: "#64748b", borderRadius: 8, fontSize: 15, cursor: "pointer" },
  navActive: { background: "#f1f5f9", color: "#0f172a", fontWeight: 600 },
  mockTag: {
    margin: "12px 4px 8px", padding: "8px 10px", background: "#fff7ed",
    border: "1px solid #fdba74", color: "#9a3412", fontSize: 13, fontWeight: 700,
    borderRadius: 8, textAlign: "center",
  },
  brand: { padding: "8px 10px", color: "#0f172a", fontSize: 17 },

  main: { flex: 1, padding: "24px 28px", minWidth: 0 },
  pageHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  h1: { fontSize: 22, margin: 0, fontWeight: 700 },
  subtitle: { color: "#94a3b8", fontSize: 15, marginTop: 4 },
  segmented: { display: "inline-flex", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "white" },
  segBtn: { padding: "9px 18px", border: "none", background: "white", color: "#64748b", cursor: "pointer", fontSize: 15 },
  segBtnActive: { background: "#0f172a", color: "white", fontWeight: 700 },

  stats: {
    display: "flex", background: "white", border: "1px solid #eef0f4", borderRadius: 12,
    overflow: "hidden", marginBottom: 16, overflowX: "auto",
  },
  stat: { flex: "1 0 88px", padding: "14px 8px", textAlign: "center", borderRight: "1px solid #f1f5f9" },
  statLabel: { fontSize: 14, color: "#94a3b8" },
  statValue: { fontSize: 20, fontWeight: 700, marginTop: 6, color: "#cbd5e1" },

  tableCard: { background: "white", border: "1px solid #eef0f4", borderRadius: 12, overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 15 },
  th: {
    textAlign: "left", padding: "12px 14px", color: "#64748b", fontWeight: 600,
    fontSize: 14, borderBottom: "1px solid #eef0f4", whiteSpace: "nowrap", background: "#fafbfc",
  },
  tr: { borderBottom: "1px solid #f5f7fa", cursor: "pointer" },
  trActive: { background: "#f0f7ff" },
  td: { padding: "13px 14px", whiteSpace: "nowrap", verticalAlign: "middle" },
  routeChip: {
    background: "#ecfdf5", color: "#047857", fontSize: 14, padding: "3px 10px",
    borderRadius: 6, fontWeight: 600,
  },
  chipBlue: {
    display: "inline-block", border: "1px solid #93c5fd", color: "#2563eb",
    background: "#eff6ff", fontSize: 14, padding: "3px 10px", borderRadius: 8, fontWeight: 600,
  },
  chipSky: {
    display: "inline-block", background: "#e0f2fe", color: "#075985",
    fontSize: 14, padding: "3px 10px", borderRadius: 8, fontWeight: 700,
  },
  chipGray: {
    display: "inline-block", border: "1px solid #e2e8f0", color: "#64748b",
    background: "white", fontSize: 14, padding: "3px 10px", borderRadius: 8, fontWeight: 500,
  },
  aiChip: {
    background: "#f5f3ff", color: "#6d28d9", border: "1px solid #ddd6fe",
    fontSize: 14, padding: "3px 10px", borderRadius: 8, fontWeight: 600,
  },
  tableHint: { padding: "10px 14px", fontSize: 14, color: "#94a3b8", background: "#fafbfc" },

  overlay: {
    position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 40,
  },
  modal: {
    background: "white", borderRadius: 16, width: "min(1320px, 100%)",
    maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden",
  },
  modalHead: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "16px 22px", borderBottom: "1px solid #eef0f4", fontSize: 17,
  },
  cols: { display: "flex", overflow: "auto", minHeight: 0 },
  col1: { width: 310, padding: 20, borderRight: "1px solid #eef0f4", flexShrink: 0, background: "#fafbfc" },
  col2: { flex: 1, padding: 20, borderRight: "1px solid #eef0f4", minWidth: 360 },
  col3: { width: 400, padding: 20, flexShrink: 0, overflowY: "auto" },
  colTitle: { fontWeight: 700, fontSize: 16, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 },
  lpChip: {
    marginLeft: "auto", border: "1px solid #e2e8f0", borderRadius: 8,
    fontSize: 14, padding: "3px 10px", color: "#475569", fontWeight: 500,
  },
  custCard: { background: "white", border: "1px solid #eef0f4", borderRadius: 12, padding: 16, marginBottom: 16 },
  infoBlock: { marginBottom: 16 },
  infoTitle: { fontWeight: 600, fontSize: 15, marginBottom: 8, color: "#334155" },
  infoRow: { display: "flex", justifyContent: "space-between", fontSize: 15, color: "#475569", padding: "3px 0" },
  infoKey: { color: "#94a3b8" },

  callBtn: {
    padding: "11px 20px", background: "#0f172a", color: "white", border: "none",
    borderRadius: 10, fontWeight: 700, fontSize: 16, cursor: "pointer",
  },
  formRow: { display: "flex", gap: 14, marginBottom: 12, alignItems: "flex-start" },
  formKey: { width: 84, color: "#475569", fontSize: 15, paddingTop: 10, flexShrink: 0 },
  select: {
    flex: 1, border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px",
    fontSize: 15, color: "#0f172a", background: "white",
  },
  textareaFilled: {
    flex: 1, border: "1px solid #c7d2fe", background: "#f5f7ff", borderRadius: 10,
    padding: "11px 13px", fontSize: 15, lineHeight: 1.7, color: "#1e293b",
  },
  autoFillTag: { fontSize: 13, color: "#6d28d9", fontWeight: 700, marginBottom: 6 },
  autoMini: { fontSize: 13, color: "#6d28d9", fontWeight: 600, marginLeft: 8 },
  saveBtn: {
    padding: "11px 28px", background: "#0f172a", color: "white", border: "none",
    borderRadius: 10, fontWeight: 700, fontSize: 16, cursor: "pointer",
  },
  audioBox: {
    flex: 1, border: "1px solid #bbf7d0", background: "#f0fdf4",
    borderRadius: 10, padding: "12px 14px",
  },
  btnSmall: {
    padding: "8px 14px", background: "#2563eb", color: "white", border: "none",
    borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  btnSmallGhost: {
    padding: "8px 14px", background: "white", color: "#334155",
    border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14, cursor: "pointer",
  },

  countChip: {
    background: "#0f172a", color: "white", fontSize: 13, fontWeight: 700,
    borderRadius: 999, padding: "2px 9px",
  },
  history: { display: "flex", flexDirection: "column", gap: 14 },
  histItem: { borderBottom: "1px solid #f1f5f9", paddingBottom: 14 },
  histHead: { display: "flex", alignItems: "center", gap: 10 },
  histAt: { marginLeft: "auto", fontSize: 14, color: "#94a3b8" },
  histBody: { fontSize: 15, color: "#475569", marginTop: 8, lineHeight: 1.7 },

  aiCard: {
    marginTop: 10, background: "#fafaff", border: "1px solid #e4e4f7",
    borderRadius: 12, padding: "13px 15px",
  },
  aiMeta: { fontSize: 13.5, color: "#94a3b8", marginBottom: 8 },
  aiSummary: { margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4, fontSize: 14.5, lineHeight: 1.6 },
  aiCallbackLine: { color: "#b45309", fontWeight: 700 },
  kpRow: { display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" },
  kpChip: {
    background: "#eff6ff", color: "#1d4ed8", border: "1px solid #dbeafe",
    fontSize: 13.5, padding: "3px 10px", borderRadius: 999, fontWeight: 600, cursor: "default",
  },

  overlay2: {
    position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 60,
  },
  tModal: {
    background: "white", borderRadius: 14, padding: 22,
    width: "min(720px, 100%)", maxHeight: "85vh", display: "flex", flexDirection: "column",
  },
  transcript: {
    whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#f8fafc",
    border: "1px solid #eef2f7", padding: 18, borderRadius: 10, fontSize: 15,
    lineHeight: 1.8, overflowY: "auto", fontFamily: "inherit", margin: 0,
  },
};

// ── 모바일 프레임 스타일 ────────────────────────────────

const M: Record<string, CSSProperties> = {
  wrap: { display: "flex", gap: 28, alignItems: "flex-start", flexWrap: "wrap" },
  frameWrap: { display: "flex", flexDirection: "column", gap: 10 },
  frameLabel: { fontWeight: 700, fontSize: 15, color: "#475569", paddingLeft: 6 },
  frame: {
    width: 392,
    border: "10px solid #0f172a",
    borderRadius: 44,
    background: "#0f172a",
    overflow: "hidden",
    position: "relative",
    boxShadow: "0 18px 40px rgba(15,23,42,0.18)",
  },
  notch: {
    position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
    width: 110, height: 22, background: "#0f172a", borderRadius: 999, zIndex: 2,
  },
  screen: {
    background: "#f7f8fa", borderRadius: 34, height: 720, overflowY: "auto",
    paddingTop: 36,
  },
  topbar: {
    display: "flex", alignItems: "center", padding: "10px 16px 12px",
    background: "white", borderBottom: "1px solid #eef0f4", position: "sticky", top: 0, zIndex: 1,
  },
  chipScroll: { display: "flex", gap: 8, padding: "12px 16px", overflowX: "auto" },
  statChip: {
    border: "1px solid #e2e8f0", background: "white", borderRadius: 999,
    padding: "6px 14px", fontSize: 14, color: "#64748b", whiteSpace: "nowrap",
  },
  statChipActive: { background: "#0f172a", color: "white", border: "1px solid #0f172a" },
  leadCard: {
    background: "white", border: "1px solid #eef0f4", borderRadius: 14,
    margin: "0 16px 12px", padding: "14px 16px",
  },
  leadCardActive: { border: "1.5px solid #93c5fd", background: "#f8fbff" },
  leadTop: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  leadPhone: { color: "#94a3b8", fontSize: 14, marginTop: 4 },
  leadMeta: { display: "flex", alignItems: "center", marginTop: 10 },
  section: { background: "white", borderTop: "8px solid #f1f3f6", padding: "14px 16px" },
  sectionTitle: { fontWeight: 700, fontSize: 15.5, marginBottom: 10 },
  custRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  callBtn: {
    padding: "11px 18px", background: "#0f172a", color: "white", border: "none",
    borderRadius: 12, fontWeight: 700, fontSize: 15.5, cursor: "pointer", flexShrink: 0,
  },
  fieldLabel: { fontSize: 14.5, color: "#475569", marginBottom: 6, fontWeight: 600 },
  histRow: {
    display: "flex", alignItems: "center", gap: 8, padding: "9px 0",
    borderBottom: "1px solid #f5f7fa",
  },
};
