/**
 * status-suggest 단위 테스트 — 자동 상태 제안 엔진.
 * 실행: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultNextContactKst, suggestStatus } from "./status-suggest.ts";

/** KST wall time → epoch ms (KST = UTC+9) */
function kstMs(y: number, mo: number, d: number, h = 10, mi = 0): number {
  return Date.UTC(y, mo - 1, d, h - 9, mi);
}

// ── defaultNextContactKst (+2일 14:00, 주말→월) ─────────

test("평일 통화 → +2일 14:00", () => {
  // 2026-06-09(화) → 06-11(목)
  assert.equal(defaultNextContactKst(kstMs(2026, 6, 9)), "2026-06-11T14:00");
});

test("+2일이 토요일 → 다음 월요일", () => {
  // 2026-06-11(목) → +2 = 06-13(토) → 06-15(월)
  assert.equal(defaultNextContactKst(kstMs(2026, 6, 11)), "2026-06-15T14:00");
});

test("+2일이 일요일 → 다음 월요일", () => {
  // 2026-06-12(금) → +2 = 06-14(일) → 06-15(월)
  assert.equal(defaultNextContactKst(kstMs(2026, 6, 12)), "2026-06-15T14:00");
});

test("월말 경계 — 달 넘어감", () => {
  // 2026-06-29(월) → 07-01(수)
  assert.equal(defaultNextContactKst(kstMs(2026, 6, 29)), "2026-07-01T14:00");
});

// ── suggestStatus ───────────────────────────────────────

const BASE = { startedAt: kstMs(2026, 6, 9) };

test("NO_ANSWER → 부재중 (자동 확정 가능)", () => {
  const s = suggestStatus({ ...BASE, callType: "NO_ANSWER" });
  assert.ok(s);
  assert.equal(s.status, "부재중");
  assert.equal(s.proposalOnly, false);
});

test("MISSED(인바운드)/REJECTED → 제안 없음 (상태 유지)", () => {
  assert.equal(suggestStatus({ ...BASE, callType: "MISSED" }), null);
  assert.equal(suggestStatus({ ...BASE, callType: "REJECTED" }), null);
});

test("RECORDED + 마커 시각 → 재연락(일시 입력)", () => {
  const s = suggestStatus({
    ...BASE, callType: "RECORDED",
    callbackAtIso: "2026-06-11T16:30", hasCallbackMarker: true,
  });
  assert.ok(s);
  assert.equal(s.status, "재연락(일시 입력)");
  assert.equal(s.nextContactAtIso, "2026-06-11T16:30");
});

test("RECORDED + 마커 시각 미정 → 재연락(일시 미입력) + 기본 +2일 자동", () => {
  const s = suggestStatus({ ...BASE, callType: "RECORDED", hasCallbackMarker: true });
  assert.ok(s);
  assert.equal(s.status, "재연락(일시 미입력)");
  assert.equal(s.nextContactAtIso, "2026-06-11T14:00"); // 화 → 목 14:00
});

test("RECORDED + outcome 재연락 (마커 없어도) → 재연락(미정)", () => {
  const s = suggestStatus({ ...BASE, callType: "RECORDED", outcome: "재연락" });
  assert.ok(s);
  assert.equal(s.status, "재연락(일시 미입력)");
});

test("RECORDED + 예약확정 → 예약성공 (예약일시 포함)", () => {
  const s = suggestStatus({
    ...BASE, callType: "RECORDED",
    outcome: "예약확정", reservationAtIso: "2026-06-14T11:00",
  });
  assert.ok(s);
  assert.equal(s.status, "예약성공");
  assert.equal(s.reservationAtIso, "2026-06-14T11:00");
  assert.equal(s.proposalOnly, false);
});

test("RECORDED + 거절의사 → 예약실패는 '제안만' (영구 종료 자동 확정 금지)", () => {
  const s = suggestStatus({ ...BASE, callType: "RECORDED", outcome: "거절의사" });
  assert.ok(s);
  assert.equal(s.status, "예약실패");
  assert.equal(s.proposalOnly, true);
});

test("예약확정이 재연락 마커보다 우선", () => {
  const s = suggestStatus({
    ...BASE, callType: "RECORDED",
    outcome: "예약확정", callbackAtIso: "2026-06-11T16:30", hasCallbackMarker: true,
  });
  assert.ok(s);
  assert.equal(s.status, "예약성공");
});

test("RECORDED + 기타/정보 없음 → 제안 없음", () => {
  assert.equal(suggestStatus({ ...BASE, callType: "RECORDED", outcome: "기타" }), null);
  assert.equal(suggestStatus({ ...BASE, callType: "RECORDED" }), null);
});
