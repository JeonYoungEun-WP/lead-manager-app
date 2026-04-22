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

const TOKEN_KEY = "booster.admin.token";

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
  const [token, setToken] = useState<string>("");
  const [tokenInput, setTokenInput] = useState("");
  const [items, setItems] = useState<TranscriptItem[] | null>(null);
  const [selected, setSelected] = useState<TranscriptDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterAgent, setFilterAgent] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const t = localStorage.getItem(TOKEN_KEY) ?? "";
      setToken(t);
      setTokenInput(t);
    }
  }, []);

  const fetchList = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/transcripts", {
        headers: { "X-App-Token": token },
        cache: "no-store",
      });
      if (res.status === 401) {
        setError("토큰 인증 실패");
        localStorage.removeItem(TOKEN_KEY);
        setToken("");
        return;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = await res.json();
      setItems(json.items ?? []);
      setLastRefresh(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) void fetchList();
  }, [token, fetchList]);

  useEffect(() => {
    if (!token || !autoRefresh) return;
    const INTERVAL_MS = 20_000;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void fetchList();
    };
    const id = window.setInterval(tick, INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) void fetchList();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, autoRefresh, fetchList]);

  const fetchDetail = useCallback(
    async (id: string) => {
      setSelected(null);
      setSelectedId(id);
      try {
        const res = await fetch(`/api/transcripts/${id}`, {
          headers: { "X-App-Token": token },
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        setSelected((await res.json()) as TranscriptDetail);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [token],
  );

  const saveToken = () => {
    const t = tokenInput.trim();
    if (!t) return;
    localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setItems(null);
    setSelected(null);
    setSelectedId(null);
  };

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

  if (!token) {
    return (
      <main style={styles.main}>
        <header style={styles.header}>
          <h1 style={styles.h1}>녹취관리 어드민</h1>
          <p style={styles.subtitle}>접근 토큰이 필요합니다.</p>
        </header>
        <div style={styles.tokenBox}>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="X-App-Token 값 입력"
            style={styles.input}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveToken();
            }}
          />
          <button onClick={saveToken} style={styles.btn}>로그인</button>
        </div>
      </main>
    );
  }

  const agentOptions = Array.from(
    new Set((items ?? []).map((it) => it.agentName).filter(Boolean)),
  ).sort();
  const list = (items ?? []).filter((it) =>
    filterAgent ? it.agentName === filterAgent : true,
  );

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
          <button onClick={logout} style={styles.btnGhost}>로그아웃</button>
        </div>
      </header>

      {error && <div style={styles.errorBox}>⚠ {error}</div>}

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
    </main>
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
