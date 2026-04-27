"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";

type TranscriptItem = {
  id: string;
  url: string;
  pathname: string;
  startedAt: number;
  size: number;
  uploadedAt: string;
  agentName?: string;
  leadPhone?: string;
  leadName?: string;
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

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/transcripts", { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = await res.json();
      setItems(json.items ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

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

  return (
    <main style={styles.main}>
      <header style={styles.headerRow}>
        <div>
          <h1 style={styles.h1}>녹취관리 어드민</h1>
          <p style={styles.subtitle}>상담사 폰에서 업로드된 통화 전문/요약</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => fetchList()} style={styles.btnSecondary} disabled={loading}>
            {loading ? "불러오는 중…" : "새로고침"}
          </button>
        </div>
      </header>

      {error && <div style={styles.errorBox}>⚠ {error}</div>}

      <section style={styles.listSection}>
        <h2 style={styles.h2}>통화 기록 ({(items ?? []).length})</h2>
        {items === null ? (
          <p style={styles.empty}>불러오는 중…</p>
        ) : items.length === 0 ? (
          <p style={styles.empty}>아직 업로드된 통화가 없습니다.</p>
        ) : (
          <div style={styles.split}>
            <ul style={styles.list}>
              {items.map((it) => (
                <li
                  key={it.id}
                  onClick={() => fetchDetail(it.id)}
                  style={{
                    ...styles.listItem,
                    ...(it.id === selectedId ? styles.listItemActive : null),
                  }}
                >
                  <div style={styles.listItemTop}>
                    <strong>
                      {it.leadName || "(이름 없음)"}
                      {it.leadPhone ? ` · ${formatPhone(it.leadPhone)}` : ""}
                    </strong>
                  </div>
                  <div style={styles.listItemSub}>
                    {formatDate(it.startedAt)}
                    {it.agentName ? ` · 상담사 ${it.agentName}` : ""}
                  </div>
                </li>
              ))}
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
  listItemTop: { marginBottom: 4, fontSize: 14 },
  listItemSub: { color: "#64748b", fontSize: 12 },
  listItemMeta: { color: "#64748b", fontSize: 11, wordBreak: "break-all" },
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
};
