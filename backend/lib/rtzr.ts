/**
 * RTZR (Vito) STT OpenAPI 헬퍼.
 *
 * 인증: client_id + client_secret → JWT (6시간 유효)
 * Batch STT: POST /v1/transcribe → id → GET /v1/transcribe/{id} 폴링
 *
 * 환경변수:
 *   RTZR_CLIENT_ID
 *   RTZR_CLIENT_SECRET
 */

export const RTZR_API_BASE = "https://openapi.vito.ai";

type CachedToken = {
  token: string;
  expireAt: number; // Unix seconds
};

// Module-level 캐시. 서버리스 콜드스타트마다 새로 발급되지만 같은 인스턴스 내 재사용.
let cachedToken: CachedToken | null = null;

export function rtzrCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.RTZR_CLIENT_ID;
  const clientSecret = process.env.RTZR_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export async function getRtzrToken(): Promise<string> {
  const creds = rtzrCredentials();
  if (!creds) {
    throw new Error("RTZR_CLIENT_ID / RTZR_CLIENT_SECRET 환경변수가 설정되지 않았습니다.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expireAt - 60 > now) {
    return cachedToken.token;
  }

  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  });

  const res = await fetch(`${RTZR_API_BASE}/v1/authenticate`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RTZR 인증 실패 (${res.status}): ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as { access_token?: string; expire_at?: number };
  if (!json.access_token || !json.expire_at) {
    throw new Error("RTZR 인증 응답 형식 오류");
  }

  cachedToken = { token: json.access_token, expireAt: json.expire_at };
  return json.access_token;
}

export type TranscribeConfig = {
  model_name?: "sommers" | "whisper";
  language?: "ko" | "ja" | "detect" | "multi";
  use_diarization?: boolean;
  diarization?: { spk_count?: number };
  use_itn?: boolean;
  use_disfluency_filter?: boolean;
  use_profanity_filter?: boolean;
  use_paragraph_splitter?: boolean;
  use_word_timestamp?: boolean;
  keywords?: string[];
};

export const DEFAULT_TRANSCRIBE_CONFIG: TranscribeConfig = {
  model_name: "sommers",
  language: "ko",
  use_diarization: true,
  diarization: { spk_count: 0 },
  use_itn: true,
  use_disfluency_filter: true,
  use_paragraph_splitter: true,
};

export async function submitTranscribe(
  audio: Blob,
  filename: string,
  config: TranscribeConfig = DEFAULT_TRANSCRIBE_CONFIG,
): Promise<string> {
  const token = await getRtzrToken();

  const form = new FormData();
  form.append("file", audio, filename);
  form.append("config", JSON.stringify(config));

  const res = await fetch(`${RTZR_API_BASE}/v1/transcribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RTZR transcribe 업로드 실패 (${res.status}): ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error("RTZR transcribe 응답에 id 없음");
  return json.id;
}

export type Utterance = {
  start_at: number; // ms
  duration: number; // ms
  msg: string;
  spk: number;
  lang?: string;
};

export type TranscribeStatus = {
  id: string;
  status: "transcribing" | "completed" | "failed";
  results?: { utterances: Utterance[] };
};

export async function getTranscribeStatus(id: string): Promise<TranscribeStatus> {
  const token = await getRtzrToken();
  const res = await fetch(`${RTZR_API_BASE}/v1/transcribe/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RTZR transcribe 조회 실패 (${res.status}): ${text.slice(0, 300)}`);
  }
  return (await res.json()) as TranscribeStatus;
}

/**
 * utterances를 화자 구분 포함한 전문 텍스트로 변환.
 * 화자 번호가 바뀔 때마다 줄바꿈. start_at은 [MM:SS] 형태로 앞에 붙임.
 */
export function utterancesToTranscript(utterances: Utterance[]): string {
  if (!utterances?.length) return "";
  const lines: string[] = [];
  let lastSpk: number | null = null;
  for (const u of utterances) {
    const ts = formatTs(u.start_at);
    const spkLabel = `화자${u.spk + 1}`;
    if (u.spk !== lastSpk) {
      lines.push(`\n[${ts}] ${spkLabel}: ${u.msg}`);
      lastSpk = u.spk;
    } else {
      lines.push(`[${ts}] ${u.msg}`);
    }
  }
  return lines.join("\n").trim();
}

function formatTs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
