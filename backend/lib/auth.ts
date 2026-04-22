import { NextRequest, NextResponse } from "next/server";

/**
 * X-App-Token 헤더 기반 최소 인증.
 * 환경변수 APP_SHARED_TOKEN 과 일치하면 통과.
 */
export function requireAppToken(req: NextRequest): NextResponse | null {
  const expected = process.env.APP_SHARED_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "APP_SHARED_TOKEN 이 서버에 설정되지 않았습니다." },
      { status: 503 },
    );
  }
  const provided = req.headers.get("x-app-token");
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }
  return null;
}
