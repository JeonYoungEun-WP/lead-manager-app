import { NextRequest, NextResponse } from "next/server";
import { list, put } from "@vercel/blob";
import { requireAppToken } from "../../../lib/auth";
import {
  buildTranscriptPathname,
  parseAudioPathname,
  parseTranscriptPathname,
  type CallType,
} from "../../../lib/blob-path";
import { extractCallback, normalizeIso } from "../../../lib/alerts";
import { suggestStatus, type AutoSuggestion } from "../../../lib/status-suggest";

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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  /** 재연락 약속 시각 (epoch ms). Phase 1 — 텍스트 마커 파싱 대신 구조화 필드. */
  callbackAt?: number;
  /** 콤마 구분 태그 (예: "재연락,긴급"). */
  tags?: string;
  /** Claude 통화 결과 분류 — 예약확정/재연락/거절의사/기타 (신버전 앱만 전달). */
  outcome?: string;
  /** outcome=예약확정 시 예약 일시 (KST "YYYY-MM-DDTHH:MM"). */
  reservationAt?: string;
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

  // ✨ 자동 상태 제안 (AI 초안 — 적용/수정/되돌리기는 사람 몫, PRD §10.0)
  // 재연락 마커는 summary 텍스트에서 직접 파싱 → 구버전 앱 업로드에도 동작.
  const cb = extractCallback(body.summary);
  const auto: AutoSuggestion | null = suggestStatus({
    callType,
    startedAt: body.startedAt,
    callbackAtIso: cb?.callbackAtIso ?? null,
    hasCallbackMarker: cb != null,
    outcome: body.outcome ?? null,
    reservationAtIso: body.reservationAt ? normalizeIso(body.reservationAt) : null,
  });

  const record = { id, ...body, uploadedAt, ...(auto ? { auto } : {}) };

  // v4 포맷 path — 생성/파싱 규약은 lib/blob-path.ts 한 곳에서 관리.
  const path = buildTranscriptPathname({
    startedAt: body.startedAt,
    agentName,
    leadPhone: body.leadPhone,
    leadName: body.leadName || "-",
    callType,
    durationSec: body.durationSec,
    id,
  });

  try {
    const blob = await put(path, JSON.stringify(record), {
      access: "public",
      contentType: "application/json; charset=utf-8",
      addRandomSuffix: false,
    });
    listCache = null; // 새 업로드 → 다음 GET 은 신선한 목록
    return NextResponse.json({ id, url: blob.url, uploadedAt });
  } catch (e) {
    return NextResponse.json(
      { error: `blob put 실패: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}

/**
 * audios/ blob 들을 한 번 list 해서 startedAt → audio URL 매핑 만든다.
 * Path 포맷: audios/YYYY-MM/{startedAt}_{clientCallId}.{ext}
 *   - 키: startedAt (ms 단위라 동시각 충돌 거의 없음)
 *   - 동일 startedAt 에 audio 가 2개면 가장 최근(uploadedAt) 우선
 */
async function buildAudioUrlMap(): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  try {
    const { blobs } = await list({ prefix: "audios/", limit: 500 });
    // 최신 업로드 우선 — 같은 startedAt 충돌 시 마지막에 set 한 것 유지하도록 오래된 것부터 처리
    const sorted = [...blobs].sort(
      (a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime(),
    );
    for (const b of sorted) {
      const startedAt = parseAudioPathname(b.pathname);
      if (startedAt == null) continue;
      map.set(startedAt, b.url);
    }
  } catch {
    // audio list 실패해도 transcripts 리스트 자체는 반환되도록 swallow
  }
  return map;
}

// 어드민 폴링이 Blob 연산 한도를 소진하지 않도록 인스턴스 단위 캐시.
// (2026-06-11 store suspended 사고 재발 방지 — list 연산을 TTL 당 1회로 제한)
let listCache: { at: number; payload: unknown } | null = null;
const LIST_CACHE_TTL_MS = 45_000;

export async function GET(_req: NextRequest) {
  // 어드민 조회는 토큰 없이 접근 가능. (POST 업로드는 X-App-Token 유지)
  // 보안 layer 가 필요하면 Vercel Authentication / IP 화이트리스트로 분리 권장.
  if (listCache && Date.now() - listCache.at < LIST_CACHE_TTL_MS) {
    return NextResponse.json(listCache.payload);
  }
  try {
    const [{ blobs }, audioUrlMap] = await Promise.all([
      list({ prefix: "transcripts/", limit: 500 }),
      buildAudioUrlMap(),
    ]);
    const items = blobs
      .map((b) => {
        // v4 → v1 하위 호환 파싱은 lib/blob-path.ts 가 담당.
        const meta = parseTranscriptPathname(b.pathname);
        if (!meta) return null;
        return {
          ...meta,
          url: b.url,
          pathname: b.pathname,
          size: b.size,
          uploadedAt: b.uploadedAt,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .map((it) => ({ ...it, audioUrl: audioUrlMap.get(it.startedAt) ?? null }))
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));

    // ✨ 부재중 차수 집계 — 번호별 NO_ANSWER 누적 (너처링 프리셋 2: 5회 소진 → 장기부재)
    const noAnswerTotal = new Map<string, number>();
    for (const it of items) {
      if (it.callType === "NO_ANSWER" && it.leadPhone) {
        noAnswerTotal.set(it.leadPhone, (noAnswerTotal.get(it.leadPhone) ?? 0) + 1);
      }
    }
    const enriched = items.map((it) => {
      if (it.callType !== "NO_ANSWER" || !it.leadPhone) return it;
      const count = noAnswerTotal.get(it.leadPhone) ?? 0;
      return {
        ...it,
        auto: {
          status: count >= 5 ? "장기부재" : "부재중",
          noAnswerCount: count,
          cap: 5,
        },
      };
    });
    listCache = { at: Date.now(), payload: { items: enriched } };
    return NextResponse.json({ items: enriched });
  } catch (e) {
    return NextResponse.json(
      { error: `blob list 실패: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
