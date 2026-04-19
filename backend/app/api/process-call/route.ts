import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/process-call
 *
 * 클라이언트(Android 앱) 가 녹음된 오디오 파일을 업로드하면
 * Gemini 2.5 Flash 멀티모달로 전사 + 5줄 요약을 한 번에 받아서 반환한다.
 *
 * 요청:
 *   multipart/form-data
 *     - audio: File (m4a / amr / 3gp / mp3 / wav)
 *     - phone (optional): string - 매칭된 번호 (로그용)
 *     - leadName (optional): string - 상대 이름 (요약 컨텍스트)
 *
 * 응답:
 *   { transcript: string, summary: string[] }
 *
 * 환경변수:
 *   GOOGLE_GENERATIVE_AI_API_KEY
 */

export const runtime = "nodejs";
export const maxDuration = 300; // 최대 5분 (Vercel Pro 이상)

const MODEL = "gemini-2.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_GENERATIVE_AI_API_KEY not set on server" },
      { status: 503 },
    );
  }

  let audioBlob: Blob;
  let leadName = "";
  let phone = "";

  try {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: "audio file missing" }, { status: 400 });
    }
    audioBlob = audio;
    leadName = String(form.get("leadName") ?? "");
    phone = String(form.get("phone") ?? "");
  } catch (e) {
    return NextResponse.json({ error: `form parse failed: ${(e as Error).message}` }, { status: 400 });
  }

  const mimeType = audioBlob.type || "audio/mp4";
  const bytes = await audioBlob.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");

  const prompt = `한국어 통화 녹음을 분석해줘.

${leadName || phone ? `통화 상대: ${leadName}${phone ? ` (${phone})` : ""}\n` : ""}
작업:
1) 전체 통화 내용을 화자 구분 없이 자연스럽게 풀어서 전사할 것 (줄바꿈 자유).
2) 핵심 내용 5줄로 요약. 각 줄 40자 이내, 구체적인 수치·이름·다음 단계·우려사항 포함.

반드시 아래 JSON 형식으로만 응답:
{
  "transcript": "전체 전사문",
  "summary": ["1줄 요약", "2줄 요약", "3줄 요약", "4줄 요약", "5줄 요약"]
}`;

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64 } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.3,
      maxOutputTokens: 8192,
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
    let parsed: { transcript?: string; summary?: string[] };
    try {
      parsed = JSON.parse(textOut);
    } catch {
      return NextResponse.json(
        { error: "Gemini returned non-JSON", raw: textOut.slice(0, 1000) },
        { status: 502 },
      );
    }
    return NextResponse.json({
      transcript: parsed.transcript ?? "",
      summary: parsed.summary ?? [],
      phone,
      leadName,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Gemini call failed: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
