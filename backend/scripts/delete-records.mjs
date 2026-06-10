/**
 * 1회성 어드민 통화 데이터 정리 스크립트.
 * 지정한 leadName 들만 보존하고 나머지 transcript JSON + 매칭 audio blob 모두 삭제.
 *
 * 사용:
 *   KEEP_NAMES="홍길동,김철수" BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... \
 *     node backend/scripts/delete-records.mjs            # dry-run
 *   KEEP_NAMES="홍길동,김철수" BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... \
 *     node backend/scripts/delete-records.mjs --apply
 *
 * --apply 없으면 dry-run (삭제 후보만 출력).
 *
 * KEEP_NAMES 가 비어있으면 안전상 모두 보존 (실수 방지).
 */

import { list, del } from "@vercel/blob";

const KEEP_NAMES = new Set(
  (process.env.KEEP_NAMES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
const APPLY = process.argv.includes("--apply");

if (KEEP_NAMES.size === 0) {
  console.error(
    "ERROR: KEEP_NAMES 환경변수가 비어있습니다. 예: KEEP_NAMES=\"홍길동,김철수\" node ...",
  );
  process.exit(1);
}

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("ERROR: BLOB_READ_WRITE_TOKEN 환경변수가 필요합니다.");
  process.exit(1);
}

function decodeMeta(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

/** transcripts/ blob path 파싱 → { startedAt, leadName } */
function parseTranscriptPath(pathname) {
  // v4: transcripts/YYYY-MM/{startedAt}_{agent}_{phone}_{name}_{callType}_{durationSec}_{uuid}.json
  const v4 = pathname.match(
    /^transcripts\/[^/]+\/(\d+)_([^_/]+)_([^_/]+)_([^_/]+)_(RECORDED|NO_ANSWER|MISSED|REJECTED)_(\d+)_([0-9a-f-]{36})\.json$/i,
  );
  if (v4) return { startedAt: Number(v4[1]), leadName: decodeMeta(v4[4]) };
  // v3: callType 없이 같은 자리에 leadName
  const v3 = pathname.match(
    /^transcripts\/[^/]+\/(\d+)_([^_/]+)_([^_/]+)_([^_/]+)_(RECORDED|NO_ANSWER|MISSED|REJECTED)_([0-9a-f-]{36})\.json$/i,
  );
  if (v3) return { startedAt: Number(v3[1]), leadName: decodeMeta(v3[4]) };
  // v2: callType 없음
  const v2 = pathname.match(
    /^transcripts\/[^/]+\/(\d+)_([^_/]+)_([^_/]+)_([^_/]+)_([0-9a-f-]{36})\.json$/i,
  );
  if (v2) return { startedAt: Number(v2[1]), leadName: decodeMeta(v2[4]) };
  // v1: transcripts/YYYY-MM/{startedAt}-{uuid}.json — 메타 일체 없음.
  // leadName 을 추출할 방법이 없으므로 (KEEP_NAMES 매칭 불가) → 빈 이름으로 삭제 후보.
  const v1 = pathname.match(/^transcripts\/[^/]+\/(\d+)-([0-9a-f-]{36})\.json$/i);
  if (v1) return { startedAt: Number(v1[1]), leadName: "" };
  return null;
}

/** audios/YYYY-MM/{startedAt}_{clientCallId}.{ext} → startedAt */
function parseAudioPath(pathname) {
  const m = pathname.match(/^audios\/[^/]+\/(\d+)_\d+\.[a-z0-9]+$/i);
  return m ? Number(m[1]) : null;
}

async function main() {
  console.log(`mode: ${APPLY ? "APPLY (실제 삭제)" : "DRY-RUN (삭제 후보만 출력)"}`);
  console.log(`보존 대상 leadName: ${[...KEEP_NAMES].join(", ")}`);

  // 1) transcripts 분류
  const { blobs: txBlobs } = await list({ prefix: "transcripts/", limit: 1000 });
  const txKeep = [];
  const txDelete = [];
  const keepStartedAtSet = new Set();
  const deleteStartedAtSet = new Set();
  for (const b of txBlobs) {
    const meta = parseTranscriptPath(b.pathname);
    if (!meta) {
      // 파싱 실패 — 안전상 보존 (수동 검토)
      txKeep.push({ pathname: b.pathname, reason: "파싱불가-보존" });
      continue;
    }
    if (KEEP_NAMES.has(meta.leadName)) {
      txKeep.push({ pathname: b.pathname, leadName: meta.leadName, startedAt: meta.startedAt });
      keepStartedAtSet.add(meta.startedAt);
    } else {
      txDelete.push({ pathname: b.pathname, url: b.url, leadName: meta.leadName, startedAt: meta.startedAt });
      deleteStartedAtSet.add(meta.startedAt);
    }
  }

  // 2) audios 분류 (startedAt 기준 매칭)
  const { blobs: audioBlobs } = await list({ prefix: "audios/", limit: 1000 });
  const audioDelete = [];
  const audioKeep = [];
  for (const b of audioBlobs) {
    const startedAt = parseAudioPath(b.pathname);
    if (startedAt == null) {
      audioKeep.push({ pathname: b.pathname, reason: "파싱불가-보존" });
      continue;
    }
    // 보존 transcript 의 startedAt 과 매칭되면 보존, 삭제 transcript 의 startedAt 과 매칭되면 삭제,
    // 양쪽 모두 매칭 안 되면 고아 audio — 안전상 보존 (수동 검토)
    if (keepStartedAtSet.has(startedAt)) {
      audioKeep.push({ pathname: b.pathname, startedAt });
    } else if (deleteStartedAtSet.has(startedAt)) {
      audioDelete.push({ pathname: b.pathname, url: b.url, startedAt });
    } else {
      audioKeep.push({ pathname: b.pathname, startedAt, reason: "고아-보존" });
    }
  }

  // 3) 출력
  console.log("\n=== transcripts 보존 ===", txKeep.length, "건");
  console.log("=== transcripts 삭제 ===", txDelete.length, "건");
  for (const it of txDelete) {
    console.log(`  [DEL] ${it.leadName || "(empty)"} / ${new Date(it.startedAt).toLocaleString("ko-KR")} / ${it.pathname}`);
  }
  console.log("\n=== audios 보존 ===", audioKeep.length, "건");
  console.log("=== audios 삭제 ===", audioDelete.length, "건");
  for (const it of audioDelete) {
    console.log(`  [DEL] ${new Date(it.startedAt).toLocaleString("ko-KR")} / ${it.pathname}`);
  }

  if (!APPLY) {
    console.log("\n(--apply 가 없어 실제 삭제는 건너뜁니다)");
    return;
  }

  // 4) 실제 삭제
  const allUrlsToDelete = [...txDelete.map(x => x.url), ...audioDelete.map(x => x.url)];
  if (allUrlsToDelete.length === 0) {
    console.log("\n삭제할 파일 없음.");
    return;
  }
  console.log(`\n>>> ${allUrlsToDelete.length} 개 blob 삭제 중...`);
  // del() 은 단일 URL 또는 URL 배열 받음. 한 번에 100개씩 끊어서 호출.
  const CHUNK = 100;
  for (let i = 0; i < allUrlsToDelete.length; i += CHUNK) {
    const chunk = allUrlsToDelete.slice(i, i + CHUNK);
    await del(chunk);
    console.log(`  ...${Math.min(i + CHUNK, allUrlsToDelete.length)}/${allUrlsToDelete.length}`);
  }
  console.log("✅ 삭제 완료");
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
