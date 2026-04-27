import { NextRequest, NextResponse } from "next/server";
import { list, put } from "@vercel/blob";
import { requireAppToken } from "../../../lib/auth";

/**
 * POST /api/transcripts
 *   앱이 완료된 전사/요약을 업로드.
 *   요청: { agentName, leadName?, leadPhone, startedAt, transcript, summary, clientCallId? }
 *   응답: { id, url, uploadedAt }
 *
 * GET /api/transcripts
 *   어드민이 목록 조회. 최신순.
 *   응답: [{ id, url, pathname, agentName?, leadName?, leadPhone?, startedAt?, uploadedAt }]
 *   (메타는 blob path 에서 파싱)
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TranscriptPayload = {
  agentName: string;
  leadName?: string;
  leadPhone: string;
  startedAt: number;
  transcript: string;
  summary: string;
  clientCallId?: number;
};

export async function POST(req: NextRequest) {
  const authErr = requireAppToken(req);
  if (authErr) return authErr;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN 이 서버에 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  let body: TranscriptPayload;
  try {
    body = (await req.json()) as TranscriptPayload;
  } catch {
    return NextResponse.json({ error: "JSON 파싱 실패" }, { status: 400 });
  }
  const required: (keyof TranscriptPayload)[] = [
    "agentName",
    "leadPhone",
    "startedAt",
    "transcript",
  ];
  for (const k of required) {
    if (!body[k]) return NextResponse.json({ error: `${k} 필드 누락` }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const uploadedAt = Date.now();
  const record = { id, ...body, uploadedAt };

  const date = new Date(body.startedAt);
  const ym = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  const path = `transcripts/${ym}/${body.startedAt}-${id}.json`;

  try {
    const blob = await put(path, JSON.stringify(record), {
      access: "public",
      contentType: "application/json; charset=utf-8",
      addRandomSuffix: false,
    });
    return NextResponse.json({ id, url: blob.url, uploadedAt });
  } catch (e) {
    return NextResponse.json(
      { error: `blob put 실패: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}

export async function GET(_req: NextRequest) {
  // 어드민 조회는 토큰 없이 접근 가능. (POST 업로드는 X-App-Token 유지)
  // 보안 layer 가 필요하면 Vercel Authentication / IP 화이트리스트로 분리.
  try {
    const { blobs } = await list({ prefix: "transcripts/", limit: 500 });
    // 두 가지 파일명 포맷을 모두 지원:
    //   포맷 A (현재): transcripts/YYYY-MM/{startedAt}-{uuid}.json
    //   포맷 B (구버전): transcripts/YYYY-MM/{startedAt}_{agent}_{phone}_{lead}_{uuid}.json (URL 인코딩 한글 포함 가능)
    const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/i;
    const TS_RE = /\/(\d+)[_-]/;
    const items = blobs
      .map((b) => {
        const tsM = b.pathname.match(TS_RE);
        const startedAt = tsM ? Number(tsM[1]) : 0;
        const idM = b.pathname.match(UUID_RE);
        const id = idM ? idM[1] : b.pathname;
        return {
          id,
          url: b.url,
          pathname: b.pathname,
          startedAt,
          size: b.size,
          uploadedAt: b.uploadedAt,
        };
      })
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json(
      { error: `blob list 실패: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
