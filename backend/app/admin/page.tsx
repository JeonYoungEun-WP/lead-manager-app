"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";

type TranscriptItem = {
  id: string;
  url: string;
  pathname: string;
  startedAt: number;
  agentName: string;
  leadPhone: string;
  leadName: string;
  size: number;
  uploadedAt: string;
};

type TranscriptDetail = {
  id: string;
  agentName: string;
  leadName?: string;
  leadPhone: string;
  startedAt: number;
  uploadedAt: number;
  transcript: string;
  summary: string;
  clientCallId?: number;
};

type AlertState = "past" | "imminent" | "future" | "undated";

type AlertItem = {
  type: "callback";
  id: string;
  pathname: string;
  startedAt: number;
  agentName: string;
  leadName: string;
  leadPhone: string;
  callbackAtIso: string | null;
  callbackAtMs: number | null;
  note: string;
  state: AlertState;
};

type Tab = "list" | "alerts";

function formatDate(ts: number): string {
  if (!ts) return "-";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatPhone(raw: string): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

export default function AdminPage() {
  const [items, setItems] = useState<TranscriptItem[] | null>(null);
  const [selected, setSelected] = useState<TranscriptDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterAgent, setFilterAgent] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("list");
  const [alerts, setAlerts] = useState<AlertItem[] | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/transcripts", { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = await res.json();
      setItems(json.items ?? []);
      setLastRefresh(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const res = await fetch("/api/alerts", { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = await res.json();
      setAlerts(json.items ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList();
    void fetchAlerts();
  }, [fetchList, fetchAlerts]);

  useEffect(() => {
    if (!autoRefresh) return;
    const INTERVAL_MS = 20_000;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void fetchList();
      void fetchAlerts();
    };
    const id = window.setInterval(tick, INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) {
        void fetchList();
        void fetchAlerts();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [autoRefresh, fetchList, fetchAlerts]);

  const fetchDetail = useCallback(async (id: string) => {
    setSelected(null);
    setSelectedId(id);
    try {
      const res = await fetch(`/api/transcripts/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setSelected((await res.json()) as TranscriptDetail);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const handleDownload = (d: TranscriptDetail) => {
    const lines: string[] = [];
    lines.push(`상담사: ${d.agentName}`);
    if (d.leadName) lines.push(`고객: ${d.leadName}`);
    lines.push(`번호: ${formatPhone(d.leadPhone)}`);
    lines.push(`통화 시작: ${formatDate(d.startedAt)}`);
    lines.push("");
    if (d.summary) {
      lines.push("## 요약");
      lines.push(d.summary);
      lines.push("");
    }
    lines.push("## 전문");
    lines.push(d.transcript);
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${d.leadName || d.leadPhone}_${formatDate(d.startedAt).replace(/[: ]/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const agentOptions = Array.from(
    new Set((items ?? []).map((it) => it.agentName).filter(Boolean)),
  ).sort();
  const list = (items ?? []).filter((it) =>
    filterAgent ? it.agentName === filterAgent : true,
  );
  const dueAlertCount = (alerts ?? []).filter(
    (a) => a.state === "past" || a.state === "imminent",
  ).length;

  return (
    <main style={styles.main}>
      <header style={styles.headerRow}>
        <div>
          <h1 style={styles.h1}>녹취관리 어드민</h1>
          <p style={styles.subtitle}>
            상담사 폰에서 업로드된 통화 전문/요약
            {lastRefresh && ` · 최근 갱신 ${new Date(lastRefresh).toLocaleTimeString("ko-KR")}`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            style={styles.select}
          >
            <option value="">상담사 전체</option>
            {agentOptions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <label style={styles.autoRefreshLabel} title="20초 간격 자동 갱신">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            자동 갱신
          </label>
          <button onClick={() => fetchList()} style={styles.btnSecondary} disabled={loading}>
            {loading ? "불러오는 중…" : "새로고침"}
          </button>
        </div>
      </header>

      {error && <div style={styles.errorBox}>⚠ {error}</div>}

      {dueAlertCount > 0 && (
        <div style={styles.alertBanner} onClick={() => setTab("alerts")}>
          🔔 재연락 시각이 도래한 통화가 <strong>{dueAlertCount}건</strong> 있습니다 — 클릭해서 알림 탭으로 이동
        </div>
      )}

      <nav style={styles.tabs}>
        <button
          onClick={() => setTab("list")}
          style={{ ...styles.tabBtn, ...(tab === "list" ? styles.tabBtnActive : null) }}
        >
          통화 기록
          <span style={styles.tabBadge}>{(items ?? []).length}</span>
        </button>
        <button
          onClick={() => setTab("alerts")}
          style={{ ...styles.tabBtn, ...(tab === "alerts" ? styles.tabBtnActive : null) }}
        >
          알림
          <span
            style={{
              ...styles.tabBadge,
              ...(dueAlertCount > 0 ? styles.tabBadgeAlert : null),
            }}
          >
            {(alerts ?? []).length}
          </span>
        </button>
      </nav>

      {tab === "list" ? (
        <section style={styles.listSection}>
          <h2 style={styles.h2}>
            통화 기록 ({list.length}
            {filterAgent && (items ?? []).length !== list.length
              ? ` / 전체 ${(items ?? []).length}`
              : ""}
            )
          </h2>
          {items === null ? (
            <p style={styles.empty}>불러오는 중…</p>
          ) : items.length === 0 ? (
            <p style={styles.empty}>아직 업로드된 통화가 없습니다.</p>
          ) : (
            <div style={styles.split}>
              <ul style={styles.list}>
                {list.map((it) => {
                  const leadName = it.leadName && it.leadName !== "-" ? it.leadName : "";
                  const agent = it.agentName || "-";
                  return (
                    <li
                      key={it.id}
                      onClick={() => fetchDetail(it.id)}
                      style={{
                        ...styles.listItem,
                        ...(it.id === selectedId ? styles.listItemActive : null),
                      }}
                    >
                      <div style={styles.listItemTop}>
                        <strong>{leadName || "(이름 없음)"}</strong>
                        <span style={styles.listItemPhone}>{formatPhone(it.leadPhone)}</span>
                      </div>
                      <div style={styles.listItemMeta}>
                        {formatDate(it.startedAt)} · 상담사 {agent}
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div style={styles.detail}>
                {selected ? (
                  <Detail d={selected} onDownload={() => handleDownload(selected)} />
                ) : (
                  <p style={styles.empty}>좌측에서 통화를 선택하세요.</p>
                )}
              </div>
            </div>
          )}
        </section>
      ) : (
        <AlertsTab
          alerts={alerts}
          loading={alertsLoading}
          onSelect={(id) => {
            setTab("list");
            fetchDetail(id);
          }}
        />
      )}
    </main>
  );
}

function AlertsTab({
  alerts,
  loading,
  onSelect,
}: {
  alerts: AlertItem[] | null;
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  if (alerts === null) {
    return (
      <section style={styles.listSection}>
        <p style={styles.empty}>{loading ? "불러오는 중…" : "데이터 없음"}</p>
      </section>
    );
  }
  if (alerts.length === 0) {
    return (
      <section style={styles.listSection}>
        <h2 style={styles.h2}>알림 (0)</h2>
        <p style={styles.empty}>활성 알림이 없습니다. 재연락 요청 통화가 업로드되면 여기에 표시됩니다.</p>
      </section>
    );
  }
  return (
    <section style={styles.listSection}>
      <h2 style={styles.h2}>알림 ({alerts.length})</h2>
      <ul style={styles.alertList}>
        {alerts.map((a) => (
          <li key={a.id} style={styles.alertCard} onClick={() => onSelect(a.id)}>
            <div style={styles.alertCardTop}>
              <StateBadge state={a.state} />
              <strong style={styles.alertLead}>
                {a.leadName && a.leadName !== "-" ? a.leadName : "(이름 없음)"}
              </strong>
              <span style={styles.alertPhone}>{formatPhone(a.leadPhone)}</span>
              <span style={styles.alertAgent}>· 상담사 {a.agentName || "-"}</span>
            </div>
            <div style={styles.alertCardBody}>
              <div>
                <span style={styles.alertLabel}>재연락 시각</span>
                <span style={styles.alertValue}>
                  {a.callbackAtIso
                    ? `${a.callbackAtIso.replace("T", " ")} (KST)`
                    : "시각 미정"}
                </span>
              </div>
              <div>
                <span style={styles.alertLabel}>통화 시각</span>
                <span style={styles.alertValue}>{formatDate(a.startedAt)}</span>
              </div>
              {a.note && (
                <div>
                  <span style={styles.alertLabel}>메모</span>
                  <span style={styles.alertValue}>{a.note}</span>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StateBadge({ state }: { state: AlertState }) {
  const conf = {
    past: { label: "지남", bg: "#fee2e2", color: "#991b1b" },
    imminent: { label: "임박", bg: "#fef3c7", color: "#92400e" },
    future: { label: "예정", bg: "#dbeafe", color: "#1e40af" },
    undated: { label: "시각 미정", bg: "#e2e8f0", color: "#334155" },
  }[state];
  return (
    <span
      style={{
        background: conf.bg,
        color: conf.color,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {conf.label}
    </span>
  );
}

function Detail({ d, onDownload }: { d: TranscriptDetail; onDownload: () => void }) {
  return (
    <div>
      <div style={styles.detailHeader}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18 }}>
            {d.leadName || "(이름 없음)"} · {formatPhone(d.leadPhone)}
          </h3>
          <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
            상담사 <strong>{d.agentName}</strong> · 통화 {formatDate(d.startedAt)} · 업로드 {formatDate(d.uploadedAt)}
          </div>
        </div>
        <button onClick={onDownload} style={styles.btn}>전문+요약 다운로드</button>
      </div>

      {d.summary && (
        <div style={styles.contentBox}>
          <h4 style={styles.sectionTitle}>요약</h4>
          <pre style={styles.summary}>{d.summary}</pre>
        </div>
      )}

      <div style={styles.contentBox}>
        <h4 style={styles.sectionTitle}>전문</h4>
        <pre style={styles.transcript}>{d.transcript || "(없음)"}</pre>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  main: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "32px 24px 80px",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif',
    color: "#111",
  },
  header: { marginBottom: 32 },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
    gap: 16,
    flexWrap: "wrap",
  },
  h1: { fontSize: 28, margin: 0 },
  subtitle: { color: "#666", marginTop: 8, fontSize: 14 },
  h2: { fontSize: 18, margin: "0 0 16px" },
  tokenBox: { display: "flex", gap: 8, maxWidth: 480 },
  input: {
    flex: 1,
    padding: "10px 12px",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    fontSize: 14,
  },
  listSection: {},
  empty: { color: "#94a3b8", padding: "20px 0" },
  split: { display: "grid", gridTemplateColumns: "320px 1fr", gap: 20 },
  list: { listStyle: "none", padding: 0, margin: 0, maxHeight: 640, overflowY: "auto" },
  listItem: {
    padding: 12,
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    marginBottom: 8,
    cursor: "pointer",
    background: "white",
  },
  listItemActive: { borderColor: "#2563eb", boxShadow: "0 0 0 1px #2563eb" },
  listItemTop: {
    marginBottom: 4,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
  },
  listItemPhone: { color: "#475569", fontSize: 12, fontVariantNumeric: "tabular-nums" },
  listItemMeta: { color: "#64748b", fontSize: 12 },
  select: {
    padding: "8px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    fontSize: 13,
    background: "white",
    color: "#334155",
    minWidth: 140,
  },
  autoRefreshLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "#475569",
    cursor: "pointer",
    userSelect: "none",
  },
  alertBanner: {
    padding: "12px 16px",
    background: "#fef3c7",
    border: "1px solid #fcd34d",
    color: "#92400e",
    borderRadius: 8,
    fontSize: 14,
    marginBottom: 16,
    cursor: "pointer",
  },
  tabs: {
    display: "flex",
    gap: 4,
    borderBottom: "1px solid #e2e8f0",
    marginBottom: 16,
  },
  tabBtn: {
    background: "none",
    border: "none",
    padding: "10px 16px",
    fontSize: 14,
    color: "#64748b",
    cursor: "pointer",
    borderBottom: "2px solid transparent",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },
  tabBtnActive: {
    color: "#2563eb",
    borderBottomColor: "#2563eb",
    fontWeight: 600,
  },
  tabBadge: {
    fontSize: 11,
    padding: "1px 8px",
    borderRadius: 999,
    background: "#e2e8f0",
    color: "#475569",
    fontWeight: 600,
  },
  tabBadgeAlert: {
    background: "#fee2e2",
    color: "#991b1b",
  },
  alertList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  alertCard: {
    padding: 14,
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    background: "white",
    cursor: "pointer",
  },
  alertCardTop: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  alertLead: { fontSize: 15 },
  alertPhone: { color: "#475569", fontSize: 13, fontVariantNumeric: "tabular-nums" },
  alertAgent: { color: "#94a3b8", fontSize: 12 },
  alertCardBody: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "6px 16px",
    fontSize: 13,
  },
  alertLabel: { color: "#94a3b8", marginRight: 8 },
  alertValue: { color: "#334155" },
  detail: {
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: 20,
    background: "white",
    minHeight: 400,
  },
  detailHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  contentBox: { marginTop: 16 },
  sectionTitle: { fontSize: 14, margin: "0 0 8px", color: "#374151" },
  summary: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    background: "#f8fafc",
    padding: 16,
    borderRadius: 6,
    fontSize: 13,
    lineHeight: 1.7,
    fontFamily: "inherit",
    margin: 0,
  },
  transcript: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    background: "#f8fafc",
    padding: 16,
    borderRadius: 6,
    fontSize: 13,
    lineHeight: 1.7,
    maxHeight: 500,
    overflowY: "auto",
    fontFamily: "inherit",
    margin: 0,
  },
  errorBox: {
    padding: 12,
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 6,
    color: "#991b1b",
    fontSize: 13,
    marginBottom: 16,
  },
  btn: {
    padding: "8px 14px",
    border: "none",
    background: "#2563eb",
    color: "white",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
  },
  btnSecondary: {
    padding: "8px 14px",
    border: "1px solid #cbd5e1",
    background: "white",
    color: "#334155",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
  },
  btnGhost: {
    padding: "8px 14px",
    border: "none",
    background: "transparent",
    color: "#64748b",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
  },
};
