import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAppToken } from "../../../../lib/auth";

/**
 * POST /api/rtzr/summarize
 *
 * 전사 텍스트를 받아서 Claude 로 핵심 요약을 생성.
 *
 * 요청: application/json
 *   { transcript: string, leadName?: string, phone?: string }
 *
 * 응답: application/x-ndjson — 최종 JSON 한 줄 (앱은 마지막 줄만 파싱)
 *   {"summary": [...], "keyPoints": [...]}\n
 *
 * 에러 시: {"error": "..."}\n + 4xx/5xx
 *
 * 환경변수: ANTHROPIC_API_KEY
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-opus-4-8";

/** 구조화 출력 스키마 — 앱(SttWorker.fetchSummary)이 기대하는 응답 형태와 1:1. */
const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "array",
      items: { type: "string" },
      description:
        "전체 흐름을 5~6줄로 요약. 각 줄 50자 이내. 재연락 요청이 감지되면 첫 줄을 정확히 '[#재연락 YYYY-MM-DDTHH:MM]' (KST, 시각 모르면 '[#재연락]') 형태로 시작하고 그 뒤에 메모를 적는다.",
    },
    keyPoints: {
      type: "array",
      description: "핵심 쟁점·액션 아이템 (최대 6개)",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "핵심 쟁점 제목 (12자 이내)" },
          detail: { type: "string", description: "상세 설명 (60자 이내)" },
        },
        required: ["title", "detail"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "keyPoints"],
  additionalProperties: false,
} as const;

/** 한국 표준시(KST) 기준 ISO 'YYYY-MM-DDTHH:MM' 반환. */
function nowKstIso(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 16);
}

export async function POST(req: NextRequest) {
  const authErr = requireAppToken(req);
  if (authErr) {
    return ndjsonError("인증 실패", 401);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return ndjsonError("ANTHROPIC_API_KEY 가 서버에 설정되지 않았습니다.", 503);
  }

  let transcript = "";
  let leadName = "";
  let phone = "";
  try {
    const body = await req.json();
    transcript = String(body?.transcript ?? "").trim();
    leadName = String(body?.leadName ?? "");
    phone = String(body?.phone ?? "");
  } catch {
    return ndjsonError("JSON 파싱 실패", 400);
  }

  if (!transcript) {
    return ndjsonError("transcript 필드 누락", 400);
  }

  const nowKst = nowKstIso();

  const prompt = `아래 한국어 통화 전사 내용을 분석해서 핵심을 요약해줘.

현재 시각 (한국 표준시, KST): ${nowKst}
${leadName || phone ? `통화 상대: ${leadName}${phone ? ` (${phone})` : ""}\n` : ""}
전사:
"""
${transcript.slice(0, 24000)}
"""

작업:
1) summary: 전체 흐름을 5줄로 요약. 각 줄 50자 이내. 구체적인 수치/이름/다음 단계/우려사항 포함.
2) keyPoints: 핵심 쟁점·액션 아이템을 최대 6개. title 은 12자 이내, detail 은 60자 이내.

추가 규칙 — 재연락 감지:
- 통화 상대가 "나중에 다시 전화 주세요", "내일 오후 3시에", "한 시간 후에", "바쁘니까 다시" 등 재연락을 요청한 경우:
  - 시각이 명시적이면 KST 절대 시각으로 변환해서 'summary' 배열의 첫 요소를 정확히 '[#재연락 YYYY-MM-DDTHH:MM]' 으로 시작 (그 뒤 공백 후 메모 가능)
    예: "[#재연락 2026-04-30T15:00] 오후 3시 재연락 약속"
  - 시각이 모호하거나 없는 경우 '[#재연락]' 으로만 시작
    예: "[#재연락] 바쁘니까 다시 연락 요청"
  - 상대 시간(한 시간 후 등)은 위의 '현재 시각' 기준으로 계산해서 절대 시각 출력
- 재연락 요청이 없으면 마커 없이 일반 요약만 출력
- 마커는 반드시 'summary' 배열의 **첫 번째 요소** 안에서 첫 글자부터 시작해야 한다.`;

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: MODEL,
      // 출력이 짧게 제약된 요약 (5~6줄 + 핵심 포인트 6개) — 4096 이면 충분.
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      messages: [{ role: "user", content: prompt }],
      output_config: {
        format: { type: "json_schema", schema: SUMMARY_SCHEMA },
      },
    });

    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      return ndjsonError(`요약 생성 실패 (stop_reason: ${response.stop_reason})`, 502);
    }

    // output_config.format 보장: 첫 text 블록이 스키마에 맞는 JSON.
    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    if (!text) {
      return ndjsonError("요약 응답에 text 블록 없음", 502);
    }

    return new Response(text.trim() + "\n", {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (e) {
    let msg: string;
    if (e instanceof Anthropic.APIError) {
      msg = `Claude API ${e.status}: ${e.message}`;
    } else {
      msg = (e as Error).message || "unknown";
    }
    console.error("[summarize] 생성 실패:", msg);
    return ndjsonError(`요약 생성 실패: ${msg}`, 502);
  }
}

function ndjsonError(message: string, status: number): Response {
  const line = JSON.stringify({ error: message }) + "\n";
  return new Response(line, {
    status,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
