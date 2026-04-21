import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/blob/upload
 *
 * 클라이언트 직접 업로드(Vercel Blob) 용 short-lived 토큰 발급 핸들러.
 * - 브라우저 → `upload()` 헬퍼가 이 엔드포인트를 두 번 호출:
 *   1) generate-client-token: 업로드할 pathname을 제시, 서버가 권한 검증 후 토큰 반환
 *   2) upload-completed: 업로드 완료 후 콜백(옵션)
 * - 파일 데이터는 이 라우트를 통과하지 않음 → Vercel body limit(4.5MB) 우회.
 *
 * 환경변수: BLOB_READ_WRITE_TOKEN (Vercel Blob store 연결 시 자동 세팅됨)
 */

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN 이 서버에 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        // 어드민 SSO 게이트 뒤에 있어 기본 신뢰.
        // 필요 시 req.cookies / headers 로 추가 인증 가능.
        return {
          allowedContentTypes: [
            "audio/*",
            "audio/mp4",
            "audio/m4a",
            "audio/x-m4a",
            "audio/mpeg",
            "audio/wav",
            "audio/x-wav",
            "audio/amr",
            "audio/flac",
            "audio/3gpp",
            "video/mp4", // m4a 가 video/mp4 로 올 때가 있음
            "application/octet-stream",
          ],
          // 업로드 가능한 파일 크기: 기본 500MB (충분)
          maximumSizeInBytes: 500 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ pathname }),
        };
      },
      onUploadCompleted: async () => {
        // 업로드 완료 로그 (DB 저장 등이 필요하면 여기서)
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (e) {
    return NextResponse.json(
      { error: `blob upload handler 실패: ${(e as Error).message}` },
      { status: 400 },
    );
  }
}
