import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/rtzr/summarize
 *
 * 전사 텍스트를 받아서 Gemini 2.5 Flash 로 핵심 요약 생성.
 *
 * 요청: application/json
 *   { transcript: string, leadName?: string, phone?: string }
 *
 * 응답:
 *   { summary: string[], keyPoints: { title: string, detail: string }[] }
 *
 * 환경변수: GOOGLE_GENERATIVE_AI_API_KEY
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "gemini-2.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_GENERATIVE_AI_API_KEY 가 서버에 설정되지 않았습니다." },
      { status: 503 },
    );
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
    return NextResponse.json({ error: "JSON 파싱 실패" }, { status: 400 });
  }

  if (!transcript) {
    return NextResponse.json({ error: "transcript 필드 누락" }, { status: 400 });
  }

  const prompt = `아래 한국어 통화 전사 내용을 분석해서 핵심을 요약해줘.

${leadName || phone ? `통화 상대: ${leadName}${phone ? ` (${phone})` : ""}\n` : ""}
전사:
"""
${transcript.slice(0, 24000)}
"""

작업:
1) summary: 전체 흐름을 5줄로 요약. 각 줄 50자 이내. 구체적인 수치/이름/다음 단계/우려사항 포함.
2) keyPoints: 핵심 쟁점·액션 아이템을 최대 6개. title 은 12자 이내, detail 은 60자 이내.

반드시 아래 JSON 형식으로만 응답:
{
  "summary": ["1줄", "2줄", "3줄", "4줄", "5줄"],
  "keyPoints": [
    {"title": "제목", "detail": "상세"}
  ]
}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.3,
      maxOutputTokens: 2048,
    },
  };

  try {
    const res = await fetch(
      `${API_BASE}/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Gemini API ${res.status}: ${text.slice(0, 500)}` },
        { status: res.status },
      );
    }
    const json = await res.json();
    const textOut: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    let parsed: { summary?: string[]; keyPoints?: { title: string; detail: string }[] };
    try {
      parsed = JSON.parse(textOut);
    } catch {
      return NextResponse.json(
        { error: "Gemini 응답이 JSON 이 아님", raw: textOut.slice(0, 1000) },
        { status: 502 },
      );
    }
    return NextResponse.json({
      summary: parsed.summary ?? [],
      keyPoints: parsed.keyPoints ?? [],
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Gemini 호출 실패: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
