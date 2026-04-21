import { NextRequest, NextResponse } from "next/server";
import { rtzrCredentials, submitTranscribe, DEFAULT_TRANSCRIBE_CONFIG, TranscribeConfig } from "../../../../lib/rtzr";

/**
 * POST /api/rtzr/transcribe
 *
 * 오디오 파일을 RTZR STT 에 업로드해 전사 작업을 시작한다.
 * 완료까지 기다리지 않고 transcribe id 만 반환 — 클라이언트가 /api/rtzr/transcribe/[id] 로 폴링.
 *
 * 요청: multipart/form-data
 *   - audio: File (mp4 / m4a / mp3 / amr / flac / wav, 최대 2GB / 4시간)
 *   - config (optional): JSON 문자열. RTZR TranscribeConfig.
 *
 * 응답: { id: string }
 */

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!rtzrCredentials()) {
    return NextResponse.json(
      { error: "RTZR_CLIENT_ID / RTZR_CLIENT_SECRET 가 서버에 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  let audioBlob: Blob;
  let filename = "audio.m4a";
  let config: TranscribeConfig = DEFAULT_TRANSCRIBE_CONFIG;

  try {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: "audio 필드 누락" }, { status: 400 });
    }
    audioBlob = audio;
    if (audio instanceof File && audio.name) filename = audio.name;

    const configRaw = form.get("config");
    if (typeof configRaw === "string" && configRaw.trim()) {
      try {
        config = { ...DEFAULT_TRANSCRIBE_CONFIG, ...JSON.parse(configRaw) };
      } catch {
        return NextResponse.json({ error: "config JSON 파싱 실패" }, { status: 400 });
      }
    }
  } catch (e) {
    return NextResponse.json(
      { error: `요청 파싱 실패: ${(e as Error).message}` },
      { status: 400 },
    );
  }

  try {
    const id = await submitTranscribe(audioBlob, filename, config);
    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
