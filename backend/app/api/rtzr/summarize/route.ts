import { NextRequest } from "next/server";
import { google } from "@ai-sdk/google";
import { streamObject } from "ai";
import { z } from "zod";

/**
 * POST /api/rtzr/summarize
 *
 * 전사 텍스트를 받아서 Gemini 2.5 Flash 로 핵심 요약을 "스트리밍" 생성.
 *
 * 요청: application/json
 *   { transcript: string, leadName?: string, phone?: string }
 *
 * 응답: application/x-ndjson (한 줄당 JSON, 부분 객체 누적)
 *   {"summary": [...], "keyPoints": [...]}\n
 *   ...
 *   // 마지막 줄이 최종 결과
 *
 * 에러 시: {"error": "..."}\n
 *
 * 환경변수: GOOGLE_GENERATIVE_AI_API_KEY
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "gemini-2.5-flash";

const summarySchema = z.object({
  summary: z.array(z.string()).describe("전체 흐름을 5줄로 요약. 각 줄 50자 이내."),
  keyPoints: z
    .array(
      z.object({
        title: z.string().describe("핵심 쟁점 제목 (12자 이내)"),
        detail: z.string().describe("상세 설명 (60자 이내)"),
      }),
    )
    .describe("핵심 쟁점·액션 아이템 (최대 6개)"),
});

export async function POST(req: NextRequest) {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return ndjsonError("GOOGLE_GENERATIVE_AI_API_KEY 가 서버에 설정되지 않았습니다.", 503);
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

  const prompt = `아래 한국어 통화 전사 내용을 분석해서 핵심을 요약해줘.

${leadName || phone ? `통화 상대: ${leadName}${phone ? ` (${phone})` : ""}\n` : ""}
전사:
"""
${transcript.slice(0, 24000)}
"""

작업:
1) summary: 전체 흐름을 5줄로 요약. 각 줄 50자 이내. 구체적인 수치/이름/다음 단계/우려사항 포함.
2) keyPoints: 핵심 쟁점·액션 아이템을 최대 6개. title 은 12자 이내, detail 은 60자 이내.`;

  const result = streamObject({
    model: google(MODEL),
    schema: summarySchema,
    prompt,
    temperature: 0.3,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const partial of result.partialObjectStream) {
          controller.enqueue(encoder.encode(JSON.stringify(partial) + "\n"));
        }
        controller.close();
      } catch (e) {
        controller.enqueue(
          encoder.encode(JSON.stringify({ error: (e as Error).message }) + "\n"),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

function ndjsonError(message: string, status: number): Response {
  const line = JSON.stringify({ error: message }) + "\n";
  return new Response(line, {
    status,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
