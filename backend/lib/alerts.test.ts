/**
 * alerts 단위 테스트 — 앱 CallbackParser.kt 와 1:1 규약 검증.
 * 실행: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyAlert, extractCallback, normalizeIso } from "./alerts.ts";

// ── extractCallback ─────────────────────────────────────

test("마커 없음 → null", () => {
  assert.equal(extractCallback(undefined), null);
  assert.equal(extractCallback(""), null);
  assert.equal(extractCallback("1. 가격 문의\n2. 다음 주 결정"), null);
});

test("시각 없는 마커", () => {
  const cb = extractCallback("[#재연락] 바쁘니까 다시 연락 요청");
  assert.ok(cb);
  assert.equal(cb.callbackAtIso, null);
  assert.equal(cb.callbackAtMs, null);
  assert.equal(cb.note, "바쁘니까 다시 연락 요청");
});

test("정상 시각 — KST→UTC ms 변환", () => {
  const cb = extractCallback("[#재연락 2026-04-30T15:00] 오후 3시 약속");
  assert.ok(cb);
  assert.equal(cb.callbackAtIso, "2026-04-30T15:00");
  // KST 15:00 == UTC 06:00
  assert.equal(cb.callbackAtMs, Date.UTC(2026, 3, 30, 6, 0));
});

test("leading 리스트 번호 제거 후 인식", () => {
  const cb = extractCallback("1. [#재연락 2026-05-01T09:30] 아침 통화");
  assert.ok(cb);
  assert.equal(cb.callbackAtIso, "2026-05-01T09:30");
});

test("자릿수 편차 — zero-pad 정규화", () => {
  const cb = extractCallback("[#재연락 2026-4-3T9:00] 메모");
  assert.ok(cb);
  assert.equal(cb.callbackAtIso, "2026-04-03T09:00");
  assert.equal(cb.callbackAtMs, Date.UTC(2026, 3, 3, 0, 0)); // KST 09:00 == UTC 00:00
});

test("해석 불가 시각 — 마커는 살리고 시각 미정", () => {
  const cb = extractCallback("[#재연락 내일쯤] 다시 연락");
  assert.ok(cb);
  assert.equal(cb.callbackAtIso, null);
  assert.equal(cb.callbackAtMs, null);
  assert.equal(cb.note, "다시 연락");
});

// ── normalizeIso ────────────────────────────────────────

test("normalizeIso: 규격/편차/불가", () => {
  assert.equal(normalizeIso("2026-04-30T15:00"), "2026-04-30T15:00");
  assert.equal(normalizeIso("2026-4-3T9:00"), "2026-04-03T09:00");
  assert.equal(normalizeIso("2026-05-01 14:30"), "2026-05-01T14:30");
  assert.equal(normalizeIso("내일쯤"), null);
  assert.equal(normalizeIso("2026-04-30"), null);
});

// ── classifyAlert ───────────────────────────────────────

test("classifyAlert: 상태 분류", () => {
  const now = 1_000_000_000_000;
  assert.equal(classifyAlert(null, now), "undated");
  assert.equal(classifyAlert(now - 1, now), "past");
  assert.equal(classifyAlert(now + 10 * 60_000, now), "imminent"); // 10분 후
  assert.equal(classifyAlert(now + 31 * 60_000, now), "future");   // 31분 후
});
