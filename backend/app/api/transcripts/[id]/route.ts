import { NextRequest, NextResponse } from "next/server";
import { list } from "@vercel/blob";

/**
 * GET /api/transcripts/[id]
 *   단건 JSON 페이로드 반환.
 *   어드민 조회는 토큰 없이 접근 가능 (보안 layer 는 Vercel Authentication / IP 제한으로 분리 권장).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const { blobs } = await list({ prefix: "transcripts/", limit: 1000 });
    // 두 가지 파일명 포맷을 모두 지원 (list 엔드포인트와 동일 로직):
    //   포맷 A: ...-{uuid}.json   포맷 B: ..._{uuid}.json
    const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/i;
    const match = blobs.find((b) => {
      const m = b.pathname.match(UUID_RE);
      return m?.[1] === id;
    });
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
