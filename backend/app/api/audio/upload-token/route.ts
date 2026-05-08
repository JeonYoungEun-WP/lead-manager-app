import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAppToken } from "../../../../lib/auth";

/**
 * POST /api/audio/upload-token
 *
 * 앱이 통화 녹음 audio 파일을 Vercel Blob 에 직접 업로드하기 위한 short-lived
 * 토큰 발급 핸들러. transcript record 와 (startedAt, clientCallId) 로 매칭된다.
 *
 * 흐름:
 *   1) 앱 → 이 엔드포인트로 'generate-client-token' 호출 (인증)
 *   2) 서버가 pathname 검증 후 Blob client 토큰 반환
 *   3) 앱이 받은 토큰으로 Vercel Blob 에 PUT (4.5MB body limit 우회)
 *
 * Pathname 규약 (앱 측이 결정해서 보냄):
 *   audios/YYYY-MM/{startedAt}_{clientCallId}.m4a
 *
 * 인증: X-App-Token (transcripts POST 와 동일 정책)
 *   - generate-client-token 단계는 client SDK 가 별도 헤더 처리해서
 *     실제 호출 시점에 헤더가 사라질 수 있어 토큰 검증은 onBeforeGenerateToken
 *     안에서 다시 한 번 한다 (request 객체 사용 가능).
 *
 * 환경변수: BLOB_READ_WRITE_TOKEN
 */

export const runtime = "nodejs";

const ALLOWED_PATH_RE = /^audios\/\d{4}-\d{2}\/\d+_\d+\.(m4a|amr|3gp|mp4|mp3|wav|flac)$/i;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authErr = requireAppToken(req);
  if (authErr) return authErr;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN 이 서버에 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "JSON 파싱 실패" }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        // 경로 형식 강제 — audios/YYYY-MM/{startedAt}_{clientCallId}.{ext}
        if (!ALLOWED_PATH_RE.test(pathname)) {
          throw new Error(
            `허용되지 않는 path 포맷: ${pathname} (예: audios/2026-05/1234567890_42.m4a)`,
          );
        }
        return {
          allowedContentTypes: [
            "audio/*",
            "audio/mp4",
            "audio/m4a",
            "audio/x-m4a",
            "audio/mpeg",
            "audio/mp3",
            "audio/wav",
            "audio/x-wav",
            "audio/amr",
            "audio/flac",
            "audio/3gpp",
            "video/mp4", // m4a 가 video/mp4 로 올 때
            "application/octet-stream",
          ],
          // 통화 녹음 — 평균 5~30분 m4a, 보수적으로 100MB 상한.
          maximumSizeInBytes: 100 * 1024 * 1024,
          // 같은 (startedAt, clientCallId) 재업로드 시 덮어쓰기 — 멱등.
          addRandomSuffix: false,
          // 같은 path 로 다시 올릴 때 SDK 가 거부하지 않도록.
          allowOverwrite: true,
          tokenPayload: JSON.stringify({ pathname }),
        };
      },
      onUploadCompleted: async () => {
        // (현재) 별도 DB 동기화 없음 — transcript record 와의 매칭은 어드민
        // GET /api/transcripts 가 list("audios/") 결과로 동적 수행.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (e) {
    return NextResponse.json(
      { error: `audio upload-token 발급 실패: ${(e as Error).message}` },
      { status: 400 },
    );
  }
}
