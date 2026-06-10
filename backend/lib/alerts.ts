/**
 * 통화 요약 텍스트에서 알림(태그)을 추출.
 *
 * 현재 지원하는 알림 종류:
 *   - callback: 재연락 요청. 마커 포맷 '[#재연락]' 또는 '[#재연락 YYYY-MM-DDTHH:MM]' (KST)
 *
 * 추후 새 알림 타입(예: 후속조치 미실행, 누적 미응답)을 추가할 때
 * 여기에 추출 함수를 늘리고 AlertItem 의 type 을 union 으로 확장한다.
 */

export type CallbackAlert = {
  type: "callback";
  /** ISO 8601 (YYYY-MM-DDTHH:MM, KST 가정) — 시각이 모호하면 null */
  callbackAtIso: string | null;
  /** UTC 밀리초 변환값 (없으면 null) */
  callbackAtMs: number | null;
  /** 마커 뒤에 붙은 메모 (한 줄) */
  note: string;
};

export type AlertItem = CallbackAlert;

// 마커는 시각 형식과 무관하게 인식 — 시각이 깨져도 재연락 자체는 등록돼야 한다.
// (앱 CallbackParser.kt 와 1:1 동일 규약 유지)
const CALLBACK_RE = /\[#재연락(?:\s+([^\]]+))?\]\s*(.*)/;

/** AI 출력의 자릿수 편차 허용: 2026-4-3T9:00 / 'T' 대신 공백도 인정. */
const LENIENT_TIME_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})$/;

/** 자릿수 편차를 zero-pad 해 'YYYY-MM-DDTHH:MM' 으로 정규화. 해석 불가면 null. */
export function normalizeIso(raw: string): string | null {
  const m = raw.trim().match(LENIENT_TIME_RE);
  if (!m) return null;
  const pad = (s: string) => s.padStart(2, "0");
  return `${m[1]}-${pad(m[2])}-${pad(m[3])}T${pad(m[4])}:${m[5]}`;
}

/** KST ISO 'YYYY-MM-DDTHH:MM' → UTC 밀리초 */
function kstIsoToMs(iso: string): number {
  // KST = UTC+9. iso 는 KST 기준 wall time 이라고 가정 → UTC 시간으로 빼서 ms.
  const d = new Date(iso + ":00Z"); // 일단 UTC 로 파싱
  return d.getTime() - 9 * 60 * 60 * 1000;
}

/** summary 텍스트(여러 줄 가능)에서 첫 줄에 있는 callback 마커 추출. 없으면 null. */
export function extractCallback(summary: string | undefined): CallbackAlert | null {
  if (!summary) return null;
  // app 이 "1. ..." 형태로 numbering 을 붙일 수 있으므로 leading "n. " 제거 후 매치
  const firstLine = summary.split("\n")[0]?.replace(/^\s*\d+\.\s*/, "").trim() ?? "";
  const m = firstLine.match(CALLBACK_RE);
  if (!m) return null;
  const rawTime = m[1]?.trim() || null;
  // 시각 정규화 실패 시에도 마커는 유효 — "시각 미정" 재연락으로 등록
  const iso = rawTime ? normalizeIso(rawTime) : null;
  return {
    type: "callback",
    callbackAtIso: iso,
    callbackAtMs: iso ? kstIsoToMs(iso) : null,
    note: (m[2] ?? "").trim(),
  };
}

/** 알림 상태: 도래 시각과 현재 시각 비교 */
export type AlertState = "past" | "imminent" | "future" | "undated";

const IMMINENT_WINDOW_MS = 30 * 60_000; // 30분

export function classifyAlert(at: number | null, now: number = Date.now()): AlertState {
  if (at == null) return "undated";
  const diff = at - now;
  if (diff < 0) return "past";
  if (diff <= IMMINENT_WINDOW_MS) return "imminent";
  return "future";
}
