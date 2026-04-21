export default function Home() {
  return (
    <main style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 720 }}>
      <h1>Booster Lead App — Backend</h1>
      <p>Gemini 2.5 Flash · RTZR STT 프록시 API.</p>

      <h2 style={{ marginTop: 32 }}>어드민</h2>
      <ul>
        <li>
          <a href="/admin">/admin</a> — 녹취관리 어드민 (파일 업로드 → 전문 + 핵심 요약)
        </li>
      </ul>

      <h2 style={{ marginTop: 32 }}>API</h2>
      <ul>
        <li><code>POST /api/process-call</code> — Gemini 원샷 전사 + 요약 (Android 앱용, ≤4.5MB)</li>
        <li><code>POST /api/blob/upload</code> — Vercel Blob 클라이언트 업로드 토큰 (대용량)</li>
        <li><code>POST /api/rtzr/transcribe-from-url</code> — Blob URL → RTZR 제출 → {"{ id }"}</li>
        <li><code>POST /api/rtzr/transcribe</code> — RTZR 직접 업로드 (≤4.5MB, 레거시)</li>
        <li><code>GET /api/rtzr/transcribe/[id]</code> — 전사 상태/결과 조회</li>
        <li><code>POST /api/rtzr/summarize</code> — 전사 텍스트 → 5줄 요약 + 핵심 포인트</li>
        <li><code>GET /api/health</code> — 상태 체크</li>
      </ul>
    </main>
  );
}
