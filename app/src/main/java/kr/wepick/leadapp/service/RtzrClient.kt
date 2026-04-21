package kr.wepick.leadapp.service

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException

/**
 * RTZR (Vito) STT API 를 앱에서 직접 호출.
 * 토큰은 백엔드 /api/rtzr/token 에서 받아서 메모리 캐시.
 */
class RtzrClient(
    private val http: OkHttpClient,
    private val backendBaseUrl: String,
) {
    private data class TokenCache(val token: String, val expireAt: Long)

    @Volatile
    private var cached: TokenCache? = null

    private suspend fun getToken(): String = withContext(Dispatchers.IO) {
        val nowSec = System.currentTimeMillis() / 1000
        cached?.let { if (it.expireAt - 60 > nowSec) return@withContext it.token }

        val req = Request.Builder()
            .url("$backendBaseUrl/api/rtzr/token")
            .post(ByteArray(0).toRequestBody(null))
            .build()
        http.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            if (!res.isSuccessful) throw IOException("토큰 발급 실패 (${res.code}): ${text.take(200)}")
            val json = JSONObject(text)
            val token = json.getString("token")
            val expireAt = json.getLong("expireAt")
            cached = TokenCache(token, expireAt)
            token
        }
    }

    suspend fun submit(audio: ByteArray, filename: String): String = withContext(Dispatchers.IO) {
        val token = getToken()
        val config = JSONObject().apply {
            put("model_name", "sommers")
            put("language", "ko")
            put("use_diarization", true)
            put("diarization", JSONObject().put("spk_count", 0))
            put("use_itn", true)
            put("use_disfluency_filter", true)
            put("use_paragraph_splitter", true)
        }
        val body = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("file", filename, audio.toRequestBody("audio/*".toMediaType()))
            .addFormDataPart("config", config.toString())
            .build()
        val req = Request.Builder()
            .url("$RTZR_API_BASE/v1/transcribe")
            .header("Authorization", "Bearer $token")
            .post(body)
            .build()
        http.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            if (!res.isSuccessful) throw IOException("RTZR 제출 실패 (${res.code}): ${text.take(300)}")
            JSONObject(text).getString("id")
        }
    }

    data class StatusResult(val status: String, val transcript: String?)

    suspend fun status(id: String): StatusResult = withContext(Dispatchers.IO) {
        val token = getToken()
        val req = Request.Builder()
            .url("$RTZR_API_BASE/v1/transcribe/$id")
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        http.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            if (!res.isSuccessful) throw IOException("RTZR 조회 실패 (${res.code}): ${text.take(200)}")
            val json = JSONObject(text)
            val status = json.getString("status")
            val transcript: String? = if (status == "completed" && json.has("results")) {
                val arr = json.getJSONObject("results").getJSONArray("utterances")
                utterancesToTranscript(arr)
            } else null
            StatusResult(status, transcript)
        }
    }

    private fun utterancesToTranscript(arr: JSONArray): String {
        if (arr.length() == 0) return ""
        val lines = mutableListOf<String>()
        var lastSpk = -1
        for (i in 0 until arr.length()) {
            val u = arr.getJSONObject(i)
            val ts = formatTs(u.getLong("start_at"))
            val msg = u.getString("msg")
            val spk = u.getInt("spk")
            if (spk != lastSpk) {
                lines.add("\n[$ts] 화자${spk + 1}: $msg")
                lastSpk = spk
            } else {
                lines.add("[$ts] $msg")
            }
        }
        return lines.joinToString("\n").trim()
    }

    private fun formatTs(ms: Long): String {
        val total = ms / 1000
        return "%02d:%02d".format(total / 60, total % 60)
    }

    companion object {
        private const val RTZR_API_BASE = "https://openapi.vito.ai"
    }
}
