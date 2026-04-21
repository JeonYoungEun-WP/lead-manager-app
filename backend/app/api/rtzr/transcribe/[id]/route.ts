import { NextRequest, NextResponse } from "next/server";
import { getTranscribeStatus, utterancesToTranscript, rtzrCredentials } from "../../../../../lib/rtzr";

/**
 * GET /api/rtzr/transcribe/[id]
 *
 * RTZR 전사 작업 상태/결과 조회.
 *
 * 응답:
 *   { status: "transcribing" | "completed" | "failed",
 *     transcript?: string,           // status == completed 일 때
 *     utterances?: Utterance[] }
 */

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!rtzrCredentials()) {
    return NextResponse.json(
      { error: "RTZR_CLIENT_ID / RTZR_CLIENT_SECRET 가 서버에 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id 누락" }, { status: 400 });
  }

  try {
    const status = await getTranscribeStatus(id);
    const payload: Record<string, unknown> = { id: status.id, status: status.status };
    if (status.status === "completed" && status.results?.utterances) {
      payload.utterances = status.results.utterances;
      payload.transcript = utterancesToTranscript(status.results.utterances);
    }
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
