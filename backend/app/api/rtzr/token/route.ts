import { NextRequest, NextResponse } from "next/server";
import { requireAppToken } from "../../../../lib/auth";
import { getRtzrTokenWithExpiry, rtzrCredentials } from "../../../../lib/rtzr";

/**
 * POST /api/rtzr/token
 *
 * 앱이 RTZR API 를 직접 호출할 때 사용할 단기 JWT 발급.
 * RTZR 토큰은 6시간 유효. 서버에서 캐시된 토큰 그대로 넘겨준다.
 *
 * 응답: { token: string, expireAt: number(unix sec) }
 */

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authErr = requireAppToken(req);
  if (authErr) return authErr;
  if (!rtzrCredentials()) {
    return NextResponse.json(
      { error: "RTZR_CLIENT_ID / RTZR_CLIENT_SECRET 가 서버에 설정되지 않았습니다." },
      { status: 503 },
    );
  }
  try {
    const t = await getRtzrTokenWithExpiry();
    return NextResponse.json(t);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
