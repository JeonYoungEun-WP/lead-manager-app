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
    //   포맷 A (현재 POST 가 생성): transcripts/YYYY-MM/{startedAt}-{uuid}.json
    //   포맷 B (구버전, 메타 인코딩): transcripts/YYYY-MM/{startedAt}_{agent}_{phone}_{lead}_{uuid}.json
    const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/i;
    const items = blobs
      .map((b) => {
        const filename = b.pathname.split("/").pop() ?? "";
        // 파일명 첫머리 숫자가 startedAt (epoch ms). YYYY-MM 디렉토리 부분에 매칭되면 안 되므로 basename 기준.
        const tsM = filename.match(/^(\d+)/);
        const startedAt = tsM ? Number(tsM[1]) : 0;
        const idM = filename.match(UUID_RE);
        const id = idM ? idM[1] : b.pathname;

        // 포맷 B 의 경우 파일명 중간에 상담사/번호/리드가 URL 인코딩되어 들어있음 → 디코드해서 미리보기 제공.
        // 포맷 A 는 ts-uuid 만 있으므로 메타 없음.
        let agentName: string | undefined;
        let leadPhone: string | undefined;
        let leadName: string | undefined;
        const stripped = filename.replace(/^\d+_/, "").replace(UUID_RE, "");
        const parts = stripped.split("_").filter(Boolean);
        // 기대: [agent, phone, lead] (단, 끝 _ 제거 후 trailing 빈 문자열 가능)
        if (parts.length >= 3) {
          try {
            agentName = decodeURIComponent(parts[0]);
            leadPhone = decodeURIComponent(parts[1]);
            leadName = decodeURIComponent(parts.slice(2).join("_"));
          } catch {
            // 디코딩 실패는 무시 — detail 클릭 시 JSON 에서 정확한 값 가져옴.
          }
        }

        return {
          id,
          url: b.url,
          pathname: b.pathname,
          startedAt,
          size: b.size,
          uploadedAt: b.uploadedAt,
          agentName,
          leadPhone,
          leadName,
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
