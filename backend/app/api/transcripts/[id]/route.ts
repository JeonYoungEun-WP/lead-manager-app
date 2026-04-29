import { NextRequest, NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { requireAppToken } from "../../../../lib/auth";

/**
 * GET /api/transcripts/[id]
 *   단건 JSON 페이로드 반환.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authErr = requireAppToken(req);
  if (authErr) return authErr;
  const { id } = await params;

  try {
    const { blobs } = await list({ prefix: "transcripts/", limit: 1000 });
    // 구 포맷 path: ...-{uuid}.json, 신 포맷 path: ..._{uuid}.json — 둘 다 매치
    const match = blobs.find(
      (b) => b.pathname.endsWith(`-${id}.json`) || b.pathname.endsWith(`_${id}.json`),
    );
    if (!match) return NextResponse.json({ error: "없음" }, { status: 404 });
    const res = await fetch(match.url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `blob fetch 실패 (${res.status})` },
        { status: 502 },
      );
    }
    const json = await res.json();
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json(
      { error: `조회 실패: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
