"use client";

import type { CSSProperties, ChangeEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";

type RecordingStatus =
  | "uploading"
  | "transcribing"
  | "summarizing"
  | "completed"
  | "failed";

type Recording = {
  id: string;              // 로컬 UUID
  rtzrId?: string;         // RTZR transcribe id
  filename: string;
  sizeBytes: number;
  leadName?: string;
  phone?: string;
  createdAt: number;
  status: RecordingStatus;
  transcript?: string;     // 전문
  summary?: string[];      // 5줄 요약
  keyPoints?: { title: string; detail: string }[];
  error?: string;
};

const STORAGE_KEY = "booster.recordings.v1";

function loadRecordings(): Recording[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Recording[];
  } catch {
    return [];
  }
}

function saveRecordings(records: Recording[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminPage() {
  const [records, setRecords] = useState<Recording[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leadName, setLeadName] = useState("");
  const [phone, setPhone] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  useEffect(() => {
    setRecords(loadRecordings());
  }, []);

  const updateRecord = useCallback((id: string, patch: Partial<Recording>) => {
    setRecords((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, ...patch } : r));
      saveRecordings(next);
      return next;
    });
  }, []);

  const startPolling = useCallback(
    (localId: string, rtzrId: string) => {
      if (pollingRef.current.has(localId)) return;
      const timer = setInterval(async () => {
        try {
          const res = await fetch(`/api/rtzr/transcribe/${encodeURIComponent(rtzrId)}`);
          const json = await res.json();
          if (!res.ok) throw new Error(json?.error || `status ${res.status}`);

          if (json.status === "completed") {
            clearInterval(timer);
            pollingRef.current.delete(localId);
            const transcript: string = json.transcript ?? "";
            updateRecord(localId, { status: "summarizing", transcript });

            // 요약 요청
            const cur = loadRecordings().find((r) => r.id === localId);
            try {
              const sumRes = await fetch("/api/rtzr/summarize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  transcript,
                  leadName: cur?.leadName ?? "",
                  phone: cur?.phone ?? "",
                }),
              });
              const sumJson = await sumRes.json();
              if (!sumRes.ok) throw new Error(sumJson?.error || `status ${sumRes.status}`);
              updateRecord(localId, {
                status: "completed",
                summary: sumJson.summary ?? [],
                keyPoints: sumJson.keyPoints ?? [],
              });
            } catch (e) {
              updateRecord(localId, {
                status: "completed",
                error: `요약 실패: ${(e as Error).message}`,
              });
            }
          } else if (json.status === "failed") {
            clearInterval(timer);
            pollingRef.current.delete(localId);
            updateRecord(localId, {
              status: "failed",
              error: "RTZR 전사 실패",
            });
          }
          // "transcribing" 은 계속 폴링
        } catch (e) {
          clearInterval(timer);
          pollingRef.current.delete(localId);
          updateRecord(localId, {
            status: "failed",
            error: (e as Error).message,
          });
        }
      }, 5000);
      pollingRef.current.set(localId, timer);
    },
    [updateRecord],
  );

  useEffect(() => {
    // 새로고침 시 중단된 전사 작업 복구
    const current = loadRecordings();
    current.forEach((r) => {
      if (r.rtzrId && (r.status === "transcribing" || r.status === "uploading")) {
        startPolling(r.id, r.rtzrId);
      }
    });
    return () => {
      pollingRef.current.forEach((t) => clearInterval(t));
      pollingRef.current.clear();
    };
  }, [startPolling]);

  const handleUpload = async (file: File) => {
    const localId = uuid();
    const newRec: Recording = {
      id: localId,
      filename: file.name,
      sizeBytes: file.size,
      leadName: leadName.trim() || undefined,
      phone: phone.trim() || undefined,
      createdAt: Date.now(),
      status: "uploading",
    };
    setRecords((prev) => {
      const next = [newRec, ...prev];
      saveRecordings(next);
      return next;
    });
    setSelectedId(localId);
    setLeadName("");
    setPhone("");

    try {
      // 1) Vercel Blob 에 직접 업로드 (body 제한 없음)
      const pathname = `uploads/${Date.now()}-${file.name}`;
      const blob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        contentType: file.type || "audio/mp4",
      });

      // 2) Blob URL 을 백엔드에 넘겨 RTZR 제출
      const res = await fetch("/api/rtzr/transcribe-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: blob.url,
          filename: file.name,
          deleteAfter: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `status ${res.status}`);
      updateRecord(localId, { rtzrId: json.id, status: "transcribing" });
      startPolling(localId, json.id);
    } catch (e) {
      updateRecord(localId, { status: "failed", error: (e as Error).message });
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = (id: string) => {
    if (!confirm("이 녹취 기록을 삭제할까요?")) return;
    const timer = pollingRef.current.get(id);
    if (timer) {
      clearInterval(timer);
      pollingRef.current.delete(id);
    }
    setRecords((prev) => {
      const next = prev.filter((r) => r.id !== id);
      saveRecordings(next);
      return next;
    });
    if (selectedId === id) setSelectedId(null);
  };

  const handleRetrySummary = async (rec: Recording) => {
    if (!rec.transcript) return;
    updateRecord(rec.id, { status: "summarizing", error: undefined });
    try {
      const res = await fetch("/api/rtzr/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: rec.transcript,
          leadName: rec.leadName ?? "",
          phone: rec.phone ?? "",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `status ${res.status}`);
      updateRecord(rec.id, {
        status: "completed",
        summary: json.summary ?? [],
        keyPoints: json.keyPoints ?? [],
      });
    } catch (e) {
      updateRecord(rec.id, { status: "completed", error: `요약 실패: ${(e as Error).message}` });
    }
  };

  const handleDownload = (rec: Recording, kind: "transcript" | "summary") => {
    let content = "";
    let filename = "";
    if (kind === "transcript") {
      content = rec.transcript ?? "";
      filename = `${rec.filename.replace(/\.[^.]+$/, "")}_전문.txt`;
    } else {
      const lines: string[] = [];
      lines.push("## 5줄 요약");
      (rec.summary ?? []).forEach((s, i) => lines.push(`${i + 1}. ${s}`));
      lines.push("");
      lines.push("## 핵심 포인트");
      (rec.keyPoints ?? []).forEach((k) => lines.push(`- [${k.title}] ${k.detail}`));
      content = lines.join("\n");
      filename = `${rec.filename.replace(/\.[^.]+$/, "")}_요약.txt`;
    }
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selected = records.find((r) => r.id === selectedId) ?? null;

  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <h1 style={styles.h1}>녹취관리 어드민</h1>
        <p style={styles.subtitle}>RTZR STT로 음성 파일을 전문 텍스트와 핵심 요약으로 변환합니다.</p>
      </header>

      <section style={styles.uploadCard}>
        <h2 style={styles.h2}>새 녹취 업로드</h2>
        <div style={styles.uploadForm}>
          <div style={styles.row}>
            <label style={styles.label}>
              상대 이름 (선택)
              <input
                type="text"
                value={leadName}
                onChange={(e) => setLeadName(e.target.value)}
                placeholder="홍길동"
                style={styles.input}
              />
            </label>
            <label style={styles.label}>
              전화번호 (선택)
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010-1234-5678"
                style={styles.input}
              />
            </label>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.m4a,.mp4,.wav,.amr,.flac"
            onChange={handleFileChange}
            style={styles.fileInput}
          />
          <p style={styles.hint}>
            지원: mp4 / m4a / mp3 / amr / flac / wav · 최대 500MB / 4시간 · Vercel Blob 경유 직접 업로드
          </p>
        </div>
      </section>

      <section style={styles.listSection}>
        <h2 style={styles.h2}>녹취 목록 ({records.length})</h2>
        {records.length === 0 ? (
          <p style={styles.empty}>아직 업로드된 녹취가 없습니다.</p>
        ) : (
          <div style={styles.split}>
            <ul style={styles.list}>
              {records.map((r) => (
                <li
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  style={{
                    ...styles.listItem,
                    ...(r.id === selectedId ? styles.listItemActive : null),
                  }}
                >
                  <div style={styles.listItemTop}>
                    <strong>{r.filename}</strong>
                    <StatusBadge status={r.status} />
                  </div>
                  <div style={styles.listItemMeta}>
                    {r.leadName || r.phone
                      ? `${r.leadName ?? ""}${r.phone ? ` (${r.phone})` : ""} · `
                      : ""}
                    {formatBytes(r.sizeBytes)} · {formatDate(r.createdAt)}
                  </div>
                </li>
              ))}
            </ul>

            <div style={styles.detail}>
              {selected ? (
                <RecordingDetail
                  rec={selected}
                  onDelete={() => handleDelete(selected.id)}
                  onRetrySummary={() => handleRetrySummary(selected)}
                  onDownload={(k) => handleDownload(selected, k)}
                />
              ) : (
                <p style={styles.empty}>좌측에서 녹취를 선택하세요.</p>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: RecordingStatus }) {
  const map: Record<RecordingStatus, { label: string; color: string }> = {
    uploading: { label: "업로드중", color: "#888" },
    transcribing: { label: "전사중", color: "#2563eb" },
    summarizing: { label: "요약중", color: "#7c3aed" },
    completed: { label: "완료", color: "#059669" },
    failed: { label: "실패", color: "#dc2626" },
  };
  const { label, color } = map[status];
  return (
    <span
      style={{
        background: color,
        color: "white",
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 10,
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

function RecordingDetail({
  rec,
  onDelete,
  onRetrySummary,
  onDownload,
}: {
  rec: Recording;
  onDelete: () => void;
  onRetrySummary: () => void;
  onDownload: (kind: "transcript" | "summary") => void;
}) {
  const [tab, setTab] = useState<"summary" | "transcript">("summary");
  const hasSummary = (rec.summary?.length ?? 0) > 0;
  const hasTranscript = !!rec.transcript;

  return (
    <div>
      <div style={styles.detailHeader}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18 }}>{rec.filename}</h3>
          <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
            {rec.leadName || rec.phone
              ? `${rec.leadName ?? ""}${rec.phone ? ` (${rec.phone})` : ""} · `
              : ""}
            {formatBytes(rec.sizeBytes)} · {formatDate(rec.createdAt)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <StatusBadge status={rec.status} />
          <button onClick={onDelete} style={styles.btnDanger}>삭제</button>
        </div>
      </div>

      {rec.error && (
        <div style={styles.errorBox}>⚠ {rec.error}</div>
      )}

      {rec.status !== "completed" && rec.status !== "failed" && (
        <div style={styles.progressBox}>
          {rec.status === "uploading" && "RTZR 서버로 업로드 중..."}
          {rec.status === "transcribing" && "음성 인식 처리 중 (5초마다 상태 확인)..."}
          {rec.status === "summarizing" && "Gemini 로 핵심 요약 생성 중..."}
        </div>
      )}

      {(hasTranscript || hasSummary) && (
        <div style={styles.tabs}>
          <button
            onClick={() => setTab("summary")}
            style={{ ...styles.tab, ...(tab === "summary" ? styles.tabActive : null) }}
          >
            핵심 요약
          </button>
          <button
            onClick={() => setTab("transcript")}
            style={{ ...styles.tab, ...(tab === "transcript" ? styles.tabActive : null) }}
          >
            전문
          </button>
        </div>
      )}

      {tab === "summary" && (
        <div style={styles.contentBox}>
          {hasSummary ? (
            <>
              <h4 style={styles.sectionTitle}>5줄 요약</h4>
              <ol style={styles.summaryList}>
                {rec.summary!.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ol>
              {(rec.keyPoints?.length ?? 0) > 0 && (
                <>
                  <h4 style={styles.sectionTitle}>핵심 포인트</h4>
                  <ul style={styles.keyPointList}>
                    {rec.keyPoints!.map((k, i) => (
                      <li key={i}>
                        <strong>{k.title}</strong> — {k.detail}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <div style={styles.actions}>
                <button onClick={() => onDownload("summary")} style={styles.btn}>
                  요약 다운로드 (.txt)
                </button>
                {hasTranscript && (
                  <button onClick={onRetrySummary} style={styles.btnSecondary}>
                    요약 다시 생성
                  </button>
                )}
              </div>
            </>
          ) : hasTranscript ? (
            <div>
              <p style={{ color: "#666" }}>아직 요약이 생성되지 않았습니다.</p>
              <button onClick={onRetrySummary} style={styles.btn}>요약 생성</button>
            </div>
          ) : (
            <p style={{ color: "#666" }}>전사가 완료되면 요약이 자동 생성됩니다.</p>
          )}
        </div>
      )}

      {tab === "transcript" && (
        <div style={styles.contentBox}>
          {hasTranscript ? (
            <>
              <pre style={styles.transcript}>{rec.transcript}</pre>
              <div style={styles.actions}>
                <button onClick={() => onDownload("transcript")} style={styles.btn}>
                  전문 다운로드 (.txt)
                </button>
              </div>
            </>
          ) : (
            <p style={{ color: "#666" }}>전사가 아직 완료되지 않았습니다.</p>
          )}
        </div>
      )}
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
  h1: { fontSize: 28, margin: 0 },
  subtitle: { color: "#666", marginTop: 8, fontSize: 14 },
  h2: { fontSize: 18, margin: "0 0 16px" },
  uploadCard: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: 20,
    marginBottom: 32,
  },
  uploadForm: { display: "flex", flexDirection: "column", gap: 12 },
  row: { display: "flex", gap: 12, flexWrap: "wrap" },
  label: { display: "flex", flexDirection: "column", gap: 4, flex: 1, fontSize: 13, color: "#374151" },
  input: {
    padding: "8px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    fontSize: 14,
  },
  fileInput: {
    padding: 8,
    border: "1px dashed #94a3b8",
    borderRadius: 6,
    background: "white",
  },
  hint: { color: "#64748b", fontSize: 12, margin: 0 },
  listSection: {},
  empty: { color: "#94a3b8", padding: "20px 0" },
  split: { display: "grid", gridTemplateColumns: "340px 1fr", gap: 20 },
  list: { listStyle: "none", padding: 0, margin: 0, maxHeight: 600, overflowY: "auto" },
  listItem: {
    padding: 12,
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    marginBottom: 8,
    cursor: "pointer",
    background: "white",
  },
  listItemActive: { borderColor: "#2563eb", boxShadow: "0 0 0 1px #2563eb" },
  listItemTop: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 },
  listItemMeta: { color: "#64748b", fontSize: 12 },
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
  progressBox: {
    padding: 12,
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    borderRadius: 6,
    color: "#1e40af",
    fontSize: 13,
    marginBottom: 16,
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
  tabs: { display: "flex", gap: 4, borderBottom: "1px solid #e2e8f0", marginBottom: 16 },
  tab: {
    padding: "8px 16px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: 14,
    color: "#64748b",
    borderBottom: "2px solid transparent",
    marginBottom: -1,
  },
  tabActive: { color: "#2563eb", borderBottomColor: "#2563eb", fontWeight: 600 },
  contentBox: {},
  sectionTitle: { fontSize: 14, margin: "16px 0 8px", color: "#374151" },
  summaryList: { paddingLeft: 20, margin: 0, lineHeight: 1.7 },
  keyPointList: { paddingLeft: 20, margin: 0, lineHeight: 1.7 },
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
    fontFamily: 'inherit',
  },
  actions: { display: "flex", gap: 8, marginTop: 16 },
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
  btnDanger: {
    padding: "6px 12px",
    border: "1px solid #fecaca",
    background: "white",
    color: "#dc2626",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12,
  },
};
