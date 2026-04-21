import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import {
  DEFAULT_TRANSCRIBE_CONFIG,
  rtzrCredentials,
  submitTranscribe,
  TranscribeConfig,
} from "../../../../lib/rtzr";

/**
 * POST /api/rtzr/transcribe-from-url
 *
 * 이미 Vercel Blob 에 업로드된 파일의 URL 을 받아, 서버에서 해당 파일을 fetch 하여
 * RTZR Batch STT 에 전달한다. 큰 파일(>4.5MB)도 Vercel 함수 body 제한을 우회.
 *
 * 요청: application/json
 *   {
 *     "url": string,          // Blob public URL
 *     "filename"?: string,    // RTZR 에 전달할 파일명 (확장자 중요)
 *     "deleteAfter"?: boolean, // 기본 true - 업로드 제출 성공 후 blob 삭제
 *     "config"?: TranscribeConfig
 *   }
 *
 * 응답: { id: string }  // RTZR transcribe id
 */

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!rtzrCredentials()) {
    return NextResponse.json(
      { error: "RTZR_CLIENT_ID / RTZR_CLIENT_SECRET 가 서버에 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  let url = "";
  let filename = "audio.m4a";
  let deleteAfter = true;
  let config: TranscribeConfig = DEFAULT_TRANSCRIBE_CONFIG;
  try {
    const body = await req.json();
    url = String(body?.url ?? "").trim();
    if (body?.filename) filename = String(body.filename);
    if (typeof body?.deleteAfter === "boolean") deleteAfter = body.deleteAfter;
    if (body?.config && typeof body.config === "object") {
      config = { ...DEFAULT_TRANSCRIBE_CONFIG, ...body.config };
    }
  } catch {
    return NextResponse.json({ error: "JSON 파싱 실패" }, { status: 400 });
  }

  if (!url) {
    return NextResponse.json({ error: "url 필드 누락" }, { status: 400 });
  }

  // Blob URL 검증: 같은 Vercel Blob 도메인만 허용 (SSRF 방지)
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith(".public.blob.vercel-storage.com")) {
      return NextResponse.json(
        { error: "허용되지 않은 url host: Vercel Blob 만 허용" },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json({ error: "잘못된 url 형식" }, { status: 400 });
  }

  // Blob 에서 파일 다운로드 (서버-서버, body 제한 없음)
  let audioBlob: Blob;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json(
        { error: `Blob fetch 실패 (${res.status})` },
        { status: 502 },
      );
    }
    audioBlob = await res.blob();
  } catch (e) {
    return NextResponse.json(
      { error: `Blob fetch 예외: ${(e as Error).message}` },
      { status: 502 },
    );
  }

  // RTZR 제출
  let transcribeId: string;
  try {
    transcribeId = await submitTranscribe(audioBlob, filename, config);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  // Blob 삭제 (전송 끝났으니 스토리지 절약)
  if (deleteAfter) {
    try {
      await del(url);
    } catch {
      // 삭제 실패는 치명적이지 않음 — 로그만
    }
  }

  return NextResponse.json({ id: transcribeId });
}
