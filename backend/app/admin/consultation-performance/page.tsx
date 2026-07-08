import Link from "next/link";

/**
 * 상담성과 — 정적 목업 HTML(`public/consultation-performance.html`)을
 * 전체 화면 iframe 으로 띄운다. HTML 이 인라인 CSS/JS 자기완결형이라
 * iframe 로 로드하면 스크립트까지 그대로 동작한다.
 */
export default function ConsultationPerformancePage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          borderBottom: "1px solid #E8E6DF",
          fontFamily: "sans-serif",
          fontSize: 14,
        }}
      >
        <Link href="/admin" style={{ color: "#185FA5", textDecoration: "none" }}>
          ← 녹취관리 어드민
        </Link>
        <span style={{ color: "#8E8D87" }}>상담성과</span>
      </div>
      <iframe
        src="/consultation-performance.html"
        title="상담성과"
        style={{ flex: 1, width: "100%", border: "none" }}
      />
    </div>
  );
}
