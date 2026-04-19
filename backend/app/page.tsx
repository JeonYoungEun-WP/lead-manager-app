export default function Home() {
  return (
    <main style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>Booster Lead App — Backend</h1>
      <p>Gemini 2.5 Flash 프록시 API.</p>
      <ul>
        <li><code>POST /api/process-call</code> — 오디오 업로드 → 전사 + 5줄 요약</li>
        <li><code>GET /api/health</code> — 상태 체크</li>
      </ul>
    </main>
  );
}
