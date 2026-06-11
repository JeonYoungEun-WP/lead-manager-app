/**
 * 자동 상태 제안 엔진 — 폰 통화 결과 → 잠재고객 상태값 제안 (순수 함수).
 *
 * PRD §10.0 원칙 (AI 초안 + 사람 확정):
 *  - 결과는 어디까지나 "제안" — 기록에 ✨자동 표시, 상담사 수정/되돌리기 가능
 *  - 영구 종료 (예약실패 등) 는 proposalOnly=true — 자동 확정 금지, 승인 필요
 *  - 다운그레이드/영구 종료 덮어쓰기 방지는 적용측(부스터맥스 연동) 책임
 *  - 재연락+일시 미정 → 기본 다음 컨택 = 통화일 +2일 14:00 KST (주말→다음 영업일)
 *    — 너처링 프리셋 3 의 D+2 1차 재통화와 정합 (확정 2026-06-11)
 */

import type { CallType } from "./blob-path";

export type Outcome = "예약확정" | "재연락" | "거절의사" | "기타";

export type SuggestInput = {
  callType: CallType;
  /** 통화 시작 (epoch ms) */
  startedAt: number;
  /** 재연락 마커의 시각 (정규화된 KST ISO) — 시각 미정 마커면 null */
  callbackAtIso?: string | null;
  /** 재연락 마커 존재 여부 (시각 유무 무관) */
  hasCallbackMarker?: boolean;
  /** Claude outcome 분류 (신버전 앱만 전달 — 없으면 마커 기반으로만 판단) */
  outcome?: string | null;
  /** outcome=예약확정 시 예약 일시 (KST ISO) */
  reservationAtIso?: string | null;
};

export type AutoSuggestion = {
  /** 부스터맥스 상태값 제안 */
  status:
    | "부재중"
    | "재연락(일시 입력)"
    | "재연락(일시 미입력)"
    | "예약성공"
    | "예약실패";
  /** true = 자동 확정 금지, 상담사 승인 필요 (영구 종료군) */
  proposalOnly: boolean;
  /** 다음 컨택/알림 시각 (KST ISO). 미정 재연락이면 기본값 자동 세팅 */
  nextContactAtIso: string | null;
  /** 예약 일시 (예약성공일 때) */
  reservationAtIso: string | null;
  /** 사람이 읽을 제안 근거 */
  basis: string;
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * 재연락+일시 미정 기본값: 통화일 +2일 14:00 KST, 주말이면 다음 영업일(월).
 * (확정 2026-06-11 — 너처링 프리셋 3 D+2 와 정합)
 */
export function defaultNextContactKst(startedAtMs: number): string {
  const kst = new Date(startedAtMs + KST_OFFSET_MS);
  // KST 달력 기준 +2일
  const d = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 2));
  const dow = d.getUTCDay();
  if (dow === 6) d.setUTCDate(d.getUTCDate() + 2); // 토 → 월
  else if (dow === 0) d.setUTCDate(d.getUTCDate() + 1); // 일 → 월
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T14:00`;
}

/**
 * 단건 통화 기준 상태 제안. 차수 집계(부재중 n/5 → 장기부재)는 조회측에서 수행.
 * 제안 없음(상태 유지)이면 null — MISSED(인바운드)/REJECTED/단순 통화.
 */
export function suggestStatus(input: SuggestInput): AutoSuggestion | null {
  const { callType, startedAt } = input;

  if (callType === "NO_ANSWER") {
    return {
      status: "부재중",
      proposalOnly: false,
      nextContactAtIso: null, // 재시도 일정은 너처링 프리셋 2 (D+0·1·2·4·7) 가 관리
      reservationAtIso: null,
      basis: "발신 미연결 (음성사서함/통화거절 포함)",
    };
  }

  // 인바운드 부재(MISSED)·상담사 거절(REJECTED)은 고객 의사가 아님 — 상태 유지
  if (callType !== "RECORDED") return null;

  const outcome = (input.outcome ?? null) as Outcome | null;

  // 우선순위: 예약확정 > 거절의사 > 재연락(시각) > 재연락(미정)
  if (outcome === "예약확정") {
    return {
      status: "예약성공",
      proposalOnly: false,
      nextContactAtIso: input.reservationAtIso ?? null,
      reservationAtIso: input.reservationAtIso ?? null,
      basis: "통화에서 방문/상담 예약 확정 감지",
    };
  }

  if (outcome === "거절의사") {
    return {
      status: "예약실패",
      proposalOnly: true, // 영구 종료 — 자동 확정 금지, 상담사 승인 필요
      nextContactAtIso: null,
      reservationAtIso: null,
      basis: "명확한 거절 의사 감지 — 승인 시 영구 종료/발송 차단",
    };
  }

  if (input.callbackAtIso) {
    return {
      status: "재연락(일시 입력)",
      proposalOnly: false,
      nextContactAtIso: input.callbackAtIso,
      reservationAtIso: null,
      basis: "재연락 마커의 약속 시각",
    };
  }

  if (input.hasCallbackMarker || outcome === "재연락") {
    return {
      status: "재연락(일시 미입력)",
      proposalOnly: false,
      nextContactAtIso: defaultNextContactKst(startedAt),
      reservationAtIso: null,
      basis: "재연락 요청 — 시각 미정이라 기본값(+2일 14:00, 주말→영업일) 자동 세팅",
    };
  }

  return null; // outcome 기타/미상 — 상태 유지
}
