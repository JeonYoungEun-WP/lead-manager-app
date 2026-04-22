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
 *   어드민이 목록 조회. 최신순. 목록 응답에 리드/상담사 메타 포함 (blob path 에 인코딩).
 *   응답: { items: [{ id, url, pathname, agentName, leadPhone, leadName, startedAt, size, uploadedAt }] }
 *
 * blob path 포맷: transcripts/YYYY-MM/{startedAt}_{agentEnc}_{phoneEnc}_{nameEnc}_{uuid}.json
 *   - 각 메타는 encodeURIComponent + `_` → `%5F` 로 이스케이프 (구분자 충돌 방지).
 *   - leadName 이 비어있을 경우 "-" 로 채움.
 */

const SEP = "_";

function encodeMeta(s: string): string {
  return encodeURIComponent(s).replace(/_/g, "%5F");
}

function decodeMeta(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

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
  const agentEnc = encodeMeta(body.agentName || "unknown");
  const phoneEnc = encodeMeta(body.leadPhone);
  const nameEnc = encodeMeta(body.leadName || "-");
  const path = `transcripts/${ym}/${body.startedAt}${SEP}${agentEnc}${SEP}${phoneEnc}${SEP}${nameEnc}${SEP}${id}.json`;

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

export async function GET(req: NextRequest) {
  const authErr = requireAppToken(req);
  if (authErr) return authErr;

  try {
    const { blobs } = await list({ prefix: "transcripts/", limit: 500 });
    const items = blobs
      .map((b) => {
        // 신 포맷: transcripts/YYYY-MM/{startedAt}_{agentEnc}_{phoneEnc}_{nameEnc}_{uuid}.json
        const mNew = b.pathname.match(
          /transcripts\/[^/]+\/(\d+)_([^_/]+)_([^_/]+)_([^_/]+)_([0-9a-f-]{36})\.json$/i,
        );
        if (mNew) {
          return {
            id: mNew[5],
            url: b.url,
            pathname: b.pathname,
            startedAt: Number(mNew[1]),
            agentName: decodeMeta(mNew[2]),
            leadPhone: decodeMeta(mNew[3]),
            leadName: decodeMeta(mNew[4]),
            size: b.size,
            uploadedAt: b.uploadedAt,
          };
        }
        // 구 포맷: transcripts/YYYY-MM/{startedAt}-{uuid}.json — 메타 미보유
        const mOld = b.pathname.match(
          /transcripts\/[^/]+\/(\d+)-([0-9a-f-]{36})\.json$/i,
        );
        if (mOld) {
          return {
            id: mOld[2],
            url: b.url,
            pathname: b.pathname,
            startedAt: Number(mOld[1]),
            agentName: "",
            leadPhone: "",
            leadName: "",
            size: b.size,
            uploadedAt: b.uploadedAt,
          };
        }
        return null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json(
      { error: `blob list 실패: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
