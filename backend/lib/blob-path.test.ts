/**
 * blob-path 단위 테스트 — Node 내장 test runner (의존성 없음).
 * 실행: npm test  (= node --test lib/)
 * Node 24 의 타입 스트리핑으로 .ts 직접 실행.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTranscriptPathname,
  decodeMeta,
  encodeMeta,
  parseAudioPathname,
  parseTranscriptPathname,
} from "./blob-path.ts";

const UUID = "3fda66b1-2b9b-44c0-b533-481e838a84e7";

// ── encodeMeta / decodeMeta ─────────────────────────────

test("encodeMeta: 언더스코어를 %5F 로 이스케이프 (path 구분자 충돌 방지)", () => {
  assert.equal(encodeMeta("리더스_아카데미").includes("_"), false);
  assert.equal(encodeMeta("a_b"), "a%5Fb");
});

test("encodeMeta/decodeMeta 라운드트립", () => {
  for (const s of ["김하준", "리더스_아카데미", "a b/c?&=", "-", "전영은"]) {
    assert.equal(decodeMeta(encodeMeta(s)), s);
  }
});

test("decodeMeta: 잘못된 인코딩은 원문 그대로 (throw 안 함)", () => {
  assert.equal(decodeMeta("%E0%A4%A"), "%E0%A4%A");
});

// ── buildTranscriptPathname / parseTranscriptPathname (v4) ──

test("v4 build → parse 라운드트립", () => {
  const path = buildTranscriptPathname({
    startedAt: 1778242374000,
    agentName: "전영은",
    leadPhone: "01051251948",
    leadName: "김하준",
    callType: "RECORDED",
    durationSec: 109,
    id: UUID,
  });
  assert.equal(path.startsWith("transcripts/2026-05/1778242374000_"), true);
  const meta = parseTranscriptPathname(path);
  assert.ok(meta);
  assert.equal(meta.id, UUID);
  assert.equal(meta.startedAt, 1778242374000);
  assert.equal(meta.agentName, "전영은");
  assert.equal(meta.leadPhone, "01051251948");
  assert.equal(meta.leadName, "김하준");
  assert.equal(meta.callType, "RECORDED");
  assert.equal(meta.durationSec, 109);
});

test("v4: 이름에 언더스코어 포함돼도 필드 안 깨짐", () => {
  const path = buildTranscriptPathname({
    startedAt: 1778242374000,
    agentName: "상담_사",
    leadPhone: "0316099799",
    leadName: "리더스_아카데미",
    callType: "MISSED",
    durationSec: 0,
    id: UUID,
  });
  const meta = parseTranscriptPathname(path);
  assert.ok(meta);
  assert.equal(meta.agentName, "상담_사");
  assert.equal(meta.leadName, "리더스_아카데미");
  assert.equal(meta.callType, "MISSED");
});

test("v4: durationSec 0 → null (미보유 표기)", () => {
  const path = buildTranscriptPathname({
    startedAt: 1778242374000,
    agentName: "a",
    leadPhone: "01000000000",
    leadName: "b",
    callType: "NO_ANSWER",
    durationSec: 0,
    id: UUID,
  });
  const meta = parseTranscriptPathname(path);
  assert.ok(meta);
  assert.equal(meta.durationSec, null);
});

test("v4: leadName 빈 문자열은 '-' 로 대체", () => {
  const path = buildTranscriptPathname({
    startedAt: 1778242374000,
    agentName: "a",
    leadPhone: "01000000000",
    leadName: "",
    callType: "RECORDED",
    durationSec: null,
    id: UUID,
  });
  const meta = parseTranscriptPathname(path);
  assert.ok(meta);
  assert.equal(meta.leadName, "-");
});

// ── 하위 호환 파싱 (v3 / v2 / v1) ────────────────────────

test("v3: callType 있음, durationSec 없음", () => {
  const meta = parseTranscriptPathname(
    `transcripts/2026-04/1776729053000_unknown_01032441948_%ED%99%A9%EC%88%99%EC%9E%90_NO_ANSWER_${UUID}.json`,
  );
  assert.ok(meta);
  assert.equal(meta.callType, "NO_ANSWER");
  assert.equal(meta.durationSec, null);
  assert.equal(meta.leadName, "황숙자");
});

test("v2: callType 없음 → RECORDED 가정", () => {
  const meta = parseTranscriptPathname(
    `transcripts/2026-04/1776729053000_unknown_01032441948_%ED%99%A9%EC%88%99%EC%9E%90_${UUID}.json`,
  );
  assert.ok(meta);
  assert.equal(meta.callType, "RECORDED");
  assert.equal(meta.agentName, "unknown");
});

test("v1: 메타 없음 — 빈 문자열 + RECORDED", () => {
  const meta = parseTranscriptPathname(`transcripts/2026-04/1776755256000-${UUID}.json`);
  assert.ok(meta);
  assert.equal(meta.id, UUID);
  assert.equal(meta.startedAt, 1776755256000);
  assert.equal(meta.agentName, "");
  assert.equal(meta.leadName, "");
  assert.equal(meta.callType, "RECORDED");
});

test("알 수 없는 path 는 null", () => {
  assert.equal(parseTranscriptPathname("transcripts/2026-04/garbage.json"), null);
  assert.equal(parseTranscriptPathname("audios/2026-05/1778242374000_42.m4a"), null);
  assert.equal(parseTranscriptPathname(""), null);
});

// ── parseAudioPathname ──────────────────────────────────

test("audio path → startedAt", () => {
  assert.equal(parseAudioPathname("audios/2026-05/1778242374000_42.m4a"), 1778242374000);
  assert.equal(parseAudioPathname("audios/2026-06/1780961528000_177.amr"), 1780961528000);
});

test("audio 규약 불일치 → null", () => {
  assert.equal(parseAudioPathname("audios/2026-05/noid.m4a"), null);
  assert.equal(parseAudioPathname("audios/2026-05/1778242374000.m4a"), null);
  assert.equal(parseAudioPathname("transcripts/2026-05/1_2.m4a"), null);
});
