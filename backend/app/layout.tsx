export const metadata = {
  title: "Booster Lead App Backend",
  description: "Gemini 프록시 API",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
