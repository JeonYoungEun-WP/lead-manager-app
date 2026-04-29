import { NextRequest, NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { classifyAlert, extractCallback, type AlertState } from "../../../lib/alerts";

/**
 * GET /api/alerts
 *   업로드된 통화 record 들을 모두 조회해 알림 마커가 있는 항목만 반환.
 *   현재는 '재연락' 알림만 지원. 추후 종류 추가 가능.
 *
 * 응답: { items: AlertItem[] }
 *   AlertItem = {
 *     type: 'callback',
 *     id: string,
 *     leadName: string,
 *     leadPhone: string,
 *     agentName: string,
 *     startedAt: number,        // 원래 통화 시각 (ms)
 *     callbackAtMs: number|null,
 *     callbackAtIso: string|null,
 *     note: string,
 *     state: 'past'|'imminent'|'future'|'undated',
 *     pathname: string,
 *   }
 *
 * 비고: blob 내용을 모두 fetch 하므로 N+1 호출 — 레코드 < 100 건 기준 설계.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const FETCH_CONCURRENCY = 8;
const MAX_RECORDS = 200;

type BlobMeta = {
  pathname: string;
  url: string;
  startedAt: number;
};

// v3: callType 포함 — {startedAt}_{agent}_{phone}_{name}_{callType}_{uuid}.json
const V3_PATH_RE =
  /transcripts\/[^/]+\/(\d+)_([^_/]+)_([^_/]+)_([^_/]+)_(RECORDED|NO_ANSWER|MISSED|REJECTED)_([0-9a-f-]{36})\.json$/i;
// v2: 메타만 — {startedAt}_{agent}_{phone}_{name}_{uuid}.json (callType 없음, RECORDED 가정)
const NEW_PATH_RE =
  /transcripts\/[^/]+\/(\d+)_([^_/]+)_([^_/]+)_([^_/]+)_([0-9a-f-]{36})\.json$/i;
// v1: 메타 일체 미보유 — {startedAt}-{uuid}.json
const OLD_PATH_RE = /transcripts\/[^/]+\/(\d+)-([0-9a-f-]{36})\.json$/i;

function decodeMeta(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

type ParsedMeta = {
  id: string;
  startedAt: number;
  agentName: string;
  leadPhone: string;
  leadName: string;
};

function parsePath(pathname: string): ParsedMeta | null {
  const mV3 = pathname.match(V3_PATH_RE);
  if (mV3) {
    return {
      id: mV3[6],
      startedAt: Number(mV3[1]),
      agentName: decodeMeta(mV3[2]),
      leadPhone: decodeMeta(mV3[3]),
      leadName: decodeMeta(mV3[4]),
    };
  }
  const mNew = pathname.match(NEW_PATH_RE);
  if (mNew) {
    return {
      id: mNew[5],
      startedAt: Number(mNew[1]),
      agentName: decodeMeta(mNew[2]),
      leadPhone: decodeMeta(mNew[3]),
      leadName: decodeMeta(mNew[4]),
    };
  }
  const mOld = pathname.match(OLD_PATH_RE);
  if (mOld) {
    return {
      id: mOld[2],
      startedAt: Number(mOld[1]),
      agentName: "",
      leadPhone: "",
      leadName: "",
    };
  }
  return null;
}

async function fetchInBatches<T, R>(
  items: T[],
  worker: (x: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const res = await Promise.all(batch.map(worker));
    out.push(...res);
  }
  return out;
}

export async function GET(_req: NextRequest) {
  // 어드민 알림 조회는 토큰 없이 접근 가능 (transcripts GET 과 동일 정책).
  try {
    const { blobs } = await list({ prefix: "transcripts/", limit: 500 });
    const limited = blobs.slice(0, MAX_RECORDS).map((b): BlobMeta => ({
      pathname: b.pathname,
      url: b.url,
      startedAt: 0,
    }));

    const now = Date.now();
    const results = await fetchInBatches(
      limited,
      async (b) => {
        const meta = parsePath(b.pathname);
        if (!meta) return null;
        let summary = "";
        let leadName = meta.leadName;
        let leadPhone = meta.leadPhone;
        let agentName = meta.agentName;
        try {
          const r = await fetch(b.url, { cache: "no-store" });
          if (!r.ok) return null;
          const json = (await r.json()) as {
            summary?: string;
            leadName?: string;
            leadPhone?: string;
            agentName?: string;
          };
          summary = String(json.summary ?? "");
          // 구 포맷 blob 은 path 에 메타가 없음 — record JSON 의 값을 우선 사용
          if (!leadName && json.leadName) leadName = String(json.leadName);
          if (!leadPhone && json.leadPhone) leadPhone = String(json.leadPhone);
          if (!agentName && json.agentName) agentName = String(json.agentName);
        } catch {
          return null;
        }
        const callback = extractCallback(summary);
        if (!callback) return null;
        const state: AlertState = classifyAlert(callback.callbackAtMs, now);
        return {
          type: "callback" as const,
          id: meta.id,
          pathname: b.pathname,
          startedAt: meta.startedAt,
          agentName,
          leadName,
          leadPhone,
          callbackAtIso: callback.callbackAtIso,
          callbackAtMs: callback.callbackAtMs,
          note: callback.note,
          state,
        };
      },
      FETCH_CONCURRENCY,
    );

    const items = results
      .filter((x): x is NonNullable<typeof x> => x !== null)
      // 정렬: past(지남) → imminent(임박) → undated → future, 같은 그룹 내에선 callbackAt asc
      .sort((a, b) => {
        const order: Record<AlertState, number> = {
          past: 0,
          imminent: 1,
          undated: 2,
          future: 3,
        };
        const oa = order[a.state] - order[b.state];
        if (oa !== 0) return oa;
        const at = a.callbackAtMs ?? a.startedAt;
        const bt = b.callbackAtMs ?? b.startedAt;
        return at - bt;
      });

    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json(
      { error: `alerts 조회 실패: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
