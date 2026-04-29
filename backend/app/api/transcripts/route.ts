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

/**
 * 통화 유형.
 * - RECORDED: 정상적으로 통화 연결되어 녹음 + 전사된 케이스 (기본).
 * - NO_ANSWER: 발신했으나 상대 미응답 (CallLog OUTGOING + duration=0).
 * - MISSED: 수신했으나 받지 못함 (CallLog MISSED).
 * - REJECTED: 수신 거절 (CallLog REJECTED).
 * NO_ANSWER/MISSED/REJECTED 는 녹음 파일이 없으므로 transcript / summary 가 비어있다.
 */
type CallType = "RECORDED" | "NO_ANSWER" | "MISSED" | "REJECTED";

type TranscriptPayload = {
  agentName: string;
  leadName?: string;
  leadPhone: string;
  startedAt: number;
  /** 비-RECORDED 통화는 비어있을 수 있음. */
  transcript?: string;
  /** 비-RECORDED 통화는 비어있을 수 있음. */
  summary?: string;
  clientCallId?: number;
  /** 통화 길이 (초). 앱이 MediaMetadataRetriever 또는 CallLog.duration 으로 채움. */
  durationSec?: number;
  /** 통화 유형 — 미지정시 RECORDED 로 간주 (구버전 클라이언트 호환). */
  callType?: CallType;
};

/**
 * 같은 통화가 이미 업로드됐는지 검사 — (startedAt, clientCallId, agentName) 조합으로 식별.
 * 일치하면 기존 record 반환 → 클라이언트 재시도 시 멱등성 보장.
 *
 * 비고: blob storage prefix list 는 효율적이지만 record JSON 을 fetch 해야 clientCallId 비교 가능.
 *       동일 startedAt 의 blob 은 거의 0개거나 매우 소수라서 N+1 비용은 무시 가능.
 */
async function findExistingDuplicate(
  ym: string,
  startedAt: number,
  clientCallId: number | undefined,
  agentName: string,
): Promise<{ id: string; url: string; uploadedAt: number } | null> {
  if (clientCallId == null) return null; // clientCallId 없으면 idempotency 검사 skip (구버전 클라이언트 호환)
  const { blobs } = await list({
    prefix: `transcripts/${ym}/${startedAt}${SEP}`,
    limit: 20,
  });
  for (const b of blobs) {
    try {
      const res = await fetch(b.url, { cache: "no-store" });
      if (!res.ok) continue;
      const json = (await res.json()) as Partial<TranscriptPayload> & {
        id?: string;
        uploadedAt?: number;
        clientCallId?: number;
      };
      if (json.clientCallId === clientCallId && json.agentName === agentName && json.id) {
        return {
          id: json.id,
          url: b.url,
          uploadedAt: json.uploadedAt ?? Date.now(),
        };
      }
    } catch {
      // 한 건 fetch 실패해도 다음 blob 시도. 모두 실패하면 신규 업로드.
    }
  }
  return null;
}

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
  // callType 정규화 (구버전 클라이언트 호환)
  const callType: CallType = body.callType ?? "RECORDED";
  body.callType = callType;

  // RECORDED 만 transcript 필수, 비-RECORDED 는 transcript 생략 허용.
  const required: (keyof TranscriptPayload)[] =
    callType === "RECORDED"
      ? ["agentName", "leadPhone", "startedAt", "transcript"]
      : ["agentName", "leadPhone", "startedAt"];
  for (const k of required) {
    if (!body[k]) return NextResponse.json({ error: `${k} 필드 누락` }, { status: 400 });
  }

  const date = new Date(body.startedAt);
  const ym = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  const agentName = body.agentName || "unknown";

  // Idempotency: 같은 (startedAt, clientCallId, agent) 조합이 이미 있으면 기존 결과 반환.
  const existing = await findExistingDuplicate(ym, body.startedAt, body.clientCallId, agentName);
  if (existing) {
    return NextResponse.json({
      id: existing.id,
      url: existing.url,
      uploadedAt: existing.uploadedAt,
      deduped: true,
    });
  }

  const id = crypto.randomUUID();
  const uploadedAt = Date.now();
  const record = { id, ...body, uploadedAt };

  const agentEnc = encodeMeta(agentName);
  const phoneEnc = encodeMeta(body.leadPhone);
  const nameEnc = encodeMeta(body.leadName || "-");
  // 신 포맷 (v3): {startedAt}_{agent}_{phone}_{name}_{callType}_{uuid}.json
  // callType 토큰들 (RECORDED|NO_ANSWER|MISSED|REJECTED) 은 [A-Z_]+ 패턴이라
  // 인접한 [^_/]+ greedy 매칭과 충돌하지 않음 (정규식 alternation 으로 정확 매칭).
  const path = `transcripts/${ym}/${body.startedAt}${SEP}${agentEnc}${SEP}${phoneEnc}${SEP}${nameEnc}${SEP}${callType}${SEP}${id}.json`;

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
  // 보안 layer 가 필요하면 Vercel Authentication / IP 화이트리스트로 분리 권장.
  try {
    const { blobs } = await list({ prefix: "transcripts/", limit: 500 });
    const items = blobs
      .map((b) => {
        // v3 (현행): {startedAt}_{agent}_{phone}_{name}_{callType}_{uuid}.json
        const mV3 = b.pathname.match(
          /transcripts\/[^/]+\/(\d+)_([^_/]+)_([^_/]+)_([^_/]+)_(RECORDED|NO_ANSWER|MISSED|REJECTED)_([0-9a-f-]{36})\.json$/i,
        );
        if (mV3) {
          return {
            id: mV3[6],
            url: b.url,
            pathname: b.pathname,
            startedAt: Number(mV3[1]),
            agentName: decodeMeta(mV3[2]),
            leadPhone: decodeMeta(mV3[3]),
            leadName: decodeMeta(mV3[4]),
            callType: mV3[5].toUpperCase() as CallType,
            size: b.size,
            uploadedAt: b.uploadedAt,
          };
        }
        // v2: {startedAt}_{agent}_{phone}_{name}_{uuid}.json — callType 정보 없음 → RECORDED 가정
        const mV2 = b.pathname.match(
          /transcripts\/[^/]+\/(\d+)_([^_/]+)_([^_/]+)_([^_/]+)_([0-9a-f-]{36})\.json$/i,
        );
        if (mV2) {
          return {
            id: mV2[5],
            url: b.url,
            pathname: b.pathname,
            startedAt: Number(mV2[1]),
            agentName: decodeMeta(mV2[2]),
            leadPhone: decodeMeta(mV2[3]),
            leadName: decodeMeta(mV2[4]),
            callType: "RECORDED" as CallType,
            size: b.size,
            uploadedAt: b.uploadedAt,
          };
        }
        // v1 (legacy): {startedAt}-{uuid}.json — 메타 일체 미보유
        const mV1 = b.pathname.match(
          /transcripts\/[^/]+\/(\d+)-([0-9a-f-]{36})\.json$/i,
        );
        if (mV1) {
          return {
            id: mV1[2],
            url: b.url,
            pathname: b.pathname,
            startedAt: Number(mV1[1]),
            agentName: "",
            leadPhone: "",
            leadName: "",
            callType: "RECORDED" as CallType,
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
