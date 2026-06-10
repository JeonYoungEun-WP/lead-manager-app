/**
 * 1회성 어드민 통화 데이터 선별 정리 스크립트.
 *
 * 두 가지 보존 모드 지원:
 *   - 특정 leadName 의 전체 통화 보존 (KEEP_ALL_NAMES)
 *   - 특정 leadName 의 특정 시각(KST 분 단위)만 보존 (SELECTIVE_KEEP)
 *
 * 사용:
 *   설정 파일을 외부 JSON 으로 분리 (개인정보는 깃에 안 들어가게):
 *
 *     # config.json (gitignored)
 *     {
 *       "keepAll": ["홍길동", "테스트회사"],
 *       "selective": {
 *         "김철수": ["2026-05-08 14:29", "2026-05-08 14:28"]
 *       }
 *     }
 *
 *   KEEP_CONFIG_PATH=./config.json BLOB_READ_WRITE_TOKEN=... \
 *     node backend/scripts/delete-records-selective.mjs --apply
 */

import { list, del } from "@vercel/blob";
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("ERROR: BLOB_READ_WRITE_TOKEN 환경변수 필요");
  process.exit(1);
}

const configPath = process.env.KEEP_CONFIG_PATH;
if (!configPath) {
  console.error(
    'ERROR: KEEP_CONFIG_PATH 환경변수 필요 (예: KEEP_CONFIG_PATH=./keep-config.json)',
  );
  process.exit(1);
}

let config;
try {
  config = JSON.parse(readFileSync(configPath, "utf8"));
} catch (e) {
  console.error(`ERROR: ${configPath} 읽기 실패:`, e.message);
  process.exit(1);
}

const KEEP_ALL_NAMES = new Set(config.keepAll || []);
const SELECTIVE = {};
for (const [name, mins] of Object.entries(config.selective || {})) {
  SELECTIVE[name] = new Set(mins);
}

if (KEEP_ALL_NAMES.size === 0 && Object.keys(SELECTIVE).length === 0) {
  console.error("ERROR: keepAll 또는 selective 중 최소 하나는 비어있지 않아야 함");
  process.exit(1);
}

function decodeMeta(s) { try { return decodeURIComponent(s); } catch { return s; } }
function fmtKstMinute(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function parseTranscript(pathname) {
  // v4
  let m = pathname.match(/^transcripts\/[^/]+\/(\d+)_([^_/]+)_([^_/]+)_([^_/]+)_(RECORDED|NO_ANSWER|MISSED|REJECTED)_(\d+)_([0-9a-f-]{36})\.json$/i);
  if (m) return { startedAt: Number(m[1]), leadName: decodeMeta(m[4]) };
  // v3
  m = pathname.match(/^transcripts\/[^/]+\/(\d+)_([^_/]+)_([^_/]+)_([^_/]+)_(RECORDED|NO_ANSWER|MISSED|REJECTED)_([0-9a-f-]{36})\.json$/i);
  if (m) return { startedAt: Number(m[1]), leadName: decodeMeta(m[4]) };
  // v2
  m = pathname.match(/^transcripts\/[^/]+\/(\d+)_([^_/]+)_([^_/]+)_([^_/]+)_([0-9a-f-]{36})\.json$/i);
  if (m) return { startedAt: Number(m[1]), leadName: decodeMeta(m[4]) };
  // v1 (메타 없음 — 보존 대상 아님)
  m = pathname.match(/^transcripts\/[^/]+\/(\d+)-([0-9a-f-]{36})\.json$/i);
  if (m) return { startedAt: Number(m[1]), leadName: "" };
  return null;
}

function parseAudio(pathname) {
  const m = pathname.match(/^audios\/[^/]+\/(\d+)_\d+\.[a-z0-9]+$/i);
  return m ? Number(m[1]) : null;
}

function shouldKeep(leadName, startedAt) {
  if (KEEP_ALL_NAMES.has(leadName)) return true;
  const set = SELECTIVE[leadName];
  if (set && set.has(fmtKstMinute(startedAt))) return true;
  return false;
}

async function main() {
  console.log(`mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);

  const { blobs: txs } = await list({ prefix: "transcripts/", limit: 1000 });
  const txKeep = [], txDel = [];
  const keepStartedAt = new Set(), delStartedAt = new Set();
  for (const b of txs) {
    const meta = parseTranscript(b.pathname);
    if (!meta) { txKeep.push({...b, reason:"파싱불가-보존"}); continue; }
    if (shouldKeep(meta.leadName, meta.startedAt)) {
      txKeep.push({ url:b.url, pathname:b.pathname, ...meta });
      keepStartedAt.add(meta.startedAt);
    } else {
      txDel.push({ url:b.url, pathname:b.pathname, ...meta });
      delStartedAt.add(meta.startedAt);
    }
  }

  const { blobs: audios } = await list({ prefix: "audios/", limit: 1000 });
  const audioDel = [], audioKeep = [];
  for (const b of audios) {
    const sa = parseAudio(b.pathname);
    if (sa == null) { audioKeep.push({...b, reason:"파싱불가"}); continue; }
    if (keepStartedAt.has(sa)) audioKeep.push({ url:b.url, pathname:b.pathname, sa });
    else if (delStartedAt.has(sa)) audioDel.push({ url:b.url, pathname:b.pathname, sa });
    else audioKeep.push({ url:b.url, pathname:b.pathname, sa, reason:"고아-보존" });
  }

  // Summary
  const keepByName = {};
  for (const t of txKeep) {
    const n = t.leadName || "(meta없음)";
    keepByName[n] = (keepByName[n] || 0) + 1;
  }
  const delByName = {};
  for (const t of txDel) {
    const n = t.leadName || "(meta없음)";
    delByName[n] = (delByName[n] || 0) + 1;
  }
  console.log("\n=== KEEP (transcripts: " + txKeep.length + ") ===");
  for (const [n, c] of Object.entries(keepByName)) console.log(`  ${n}: ${c}건`);
  console.log("=== DELETE (transcripts: " + txDel.length + ") ===");
  for (const [n, c] of Object.entries(delByName)) console.log(`  ${n}: ${c}건`);
  console.log(`audios — keep: ${audioKeep.length} / delete: ${audioDel.length}`);

  if (!APPLY) {
    console.log("\n(dry-run — 삭제 안 함. --apply 로 실제 실행)");
    return;
  }

  const urls = [...txDel.map(x=>x.url), ...audioDel.map(x=>x.url)];
  if (!urls.length) { console.log("\n삭제할 파일 없음"); return; }
  console.log(`\n>>> ${urls.length}개 삭제 중...`);
  const CHUNK = 100;
  for (let i=0; i<urls.length; i+=CHUNK) {
    await del(urls.slice(i, i+CHUNK));
    console.log(`  ...${Math.min(i+CHUNK, urls.length)}/${urls.length}`);
  }
  console.log("✅ 삭제 완료");
}

main().catch(e => { console.error("FAILED:", e); process.exit(1); });
