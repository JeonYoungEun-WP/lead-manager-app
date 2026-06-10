/**
 * Vercel Blob path 규약 — 인코딩/파싱 순수 함수.
 * transcripts route 와 단위 테스트(blob-path.test.ts)가 공유한다.
 *
 * transcripts (v4, 현행):
 *   transcripts/YYYY-MM/{startedAt}_{agentEnc}_{phoneEnc}_{nameEnc}_{callType}_{durationSec}_{uuid}.json
 *   - 각 메타는 encodeURIComponent + '_'→'%5F' 이스케이프 (구분자 충돌 방지)
 *   - v3(durationSec 없음) / v2(callType 없음) / v1(메타 없음, '-{uuid}') 하위 호환 파싱
 *
 * audios:
 *   audios/YYYY-MM/{startedAt}_{clientCallId}.{ext}
 */

export type CallType = "RECORDED" | "NO_ANSWER" | "MISSED" | "REJECTED";

export type TranscriptPathMeta = {
  id: string;
  startedAt: number;
  agentName: string;
  leadPhone: string;
  leadName: string;
  callType: CallType;
  durationSec: number | null;
};

export function encodeMeta(s: string): string {
  return encodeURIComponent(s).replace(/_/g, "%5F");
}

export function decodeMeta(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** v4 포맷 pathname 생성 (POST /api/transcripts). */
export function buildTranscriptPathname(args: {
  startedAt: number;
  agentName: string;
  leadPhone: string;
  leadName: string;
  callType: CallType;
  durationSec: number | null | undefined;
  id: string;
}): string {
  const date = new Date(args.startedAt);
  const ym = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  const dur = args.durationSec != null && args.durationSec > 0 ? args.durationSec : 0;
  return (
    `transcripts/${ym}/${args.startedAt}_${encodeMeta(args.agentName)}_` +
    `${encodeMeta(args.leadPhone)}_${encodeMeta(args.leadName || "-")}_` +
    `${args.callType}_${dur}_${args.id}.json`
  );
}

const V4_RE =
  /^transcripts\/[^/]+\/(\d+)_([^_/]+)_([^_/]+)_([^_/]+)_(RECORDED|NO_ANSWER|MISSED|REJECTED)_(\d+)_([0-9a-f-]{36})\.json$/i;
const V3_RE =
  /^transcripts\/[^/]+\/(\d+)_([^_/]+)_([^_/]+)_([^_/]+)_(RECORDED|NO_ANSWER|MISSED|REJECTED)_([0-9a-f-]{36})\.json$/i;
const V2_RE =
  /^transcripts\/[^/]+\/(\d+)_([^_/]+)_([^_/]+)_([^_/]+)_([0-9a-f-]{36})\.json$/i;
const V1_RE = /^transcripts\/[^/]+\/(\d+)-([0-9a-f-]{36})\.json$/i;

/** transcripts pathname → 메타. 알 수 없는 포맷이면 null (v4 → v1 순서로 시도). */
export function parseTranscriptPathname(pathname: string): TranscriptPathMeta | null {
  const mV4 = pathname.match(V4_RE);
  if (mV4) {
    const d = Number(mV4[6]);
    return {
      id: mV4[7],
      startedAt: Number(mV4[1]),
      agentName: decodeMeta(mV4[2]),
      leadPhone: decodeMeta(mV4[3]),
      leadName: decodeMeta(mV4[4]),
      callType: mV4[5].toUpperCase() as CallType,
      durationSec: d > 0 ? d : null,
    };
  }
  const mV3 = pathname.match(V3_RE);
  if (mV3) {
    return {
      id: mV3[6],
      startedAt: Number(mV3[1]),
      agentName: decodeMeta(mV3[2]),
      leadPhone: decodeMeta(mV3[3]),
      leadName: decodeMeta(mV3[4]),
      callType: mV3[5].toUpperCase() as CallType,
      durationSec: null,
    };
  }
  const mV2 = pathname.match(V2_RE);
  if (mV2) {
    return {
      id: mV2[5],
      startedAt: Number(mV2[1]),
      agentName: decodeMeta(mV2[2]),
      leadPhone: decodeMeta(mV2[3]),
      leadName: decodeMeta(mV2[4]),
      callType: "RECORDED",
      durationSec: null,
    };
  }
  const mV1 = pathname.match(V1_RE);
  if (mV1) {
    return {
      id: mV1[2],
      startedAt: Number(mV1[1]),
      agentName: "",
      leadPhone: "",
      leadName: "",
      callType: "RECORDED",
      durationSec: null,
    };
  }
  return null;
}

const AUDIO_RE = /^audios\/[^/]+\/(\d+)_\d+\.[a-z0-9]+$/i;

/** audios pathname → startedAt(ms). 규약 불일치면 null. */
export function parseAudioPathname(pathname: string): number | null {
  const m = pathname.match(AUDIO_RE);
  if (!m) return null;
  const startedAt = Number(m[1]);
  return Number.isFinite(startedAt) ? startedAt : null;
}
