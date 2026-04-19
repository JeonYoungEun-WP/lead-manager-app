import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    keyPresent: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    service: "booster-lead-app-backend",
    version: "0.1.0",
  });
}
