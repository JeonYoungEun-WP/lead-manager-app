package kr.wepick.leadapp.service

import android.content.Context
import android.net.Uri
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import kr.wepick.leadapp.BuildConfig
import kr.wepick.leadapp.LeadApp
import kr.wepick.leadapp.ui.screens.KEY_AGENT_NAME
import kr.wepick.leadapp.ui.screens.KEY_BACKEND_URL
import kr.wepick.leadapp.util.appPreferences
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * PENDING/FAILED 상태의 CallRecord 를 RTZR 로 전사 + 백엔드 Gemini 로 요약.
 * 오디오 파일은 앱이 직접 RTZR 에 전송. 오디오는 백엔드를 거치지 않음.
 */
class SttWorker(
    ctx: Context,
    params: WorkerParameters,
) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val prefs = applicationContext.appPreferences.data.first()
        val backendUrl = prefs[KEY_BACKEND_URL]?.trim()?.trimEnd('/').orEmpty()
        if (backendUrl.isBlank()) return Result.success()
        val agentName = prefs[KEY_AGENT_NAME]?.trim().orEmpty()

        val http = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(90, TimeUnit.SECONDS)
            .writeTimeout(10, TimeUnit.MINUTES)
            .build()
        val rtzr = RtzrClient(http, backendUrl)
        val repo = LeadApp.instance.leadRepo

        val pending = repo.pendingCalls()
        for (call in pending) {
            try {
                repo.markCallProcessing(call.id)

                val bytes = withContext(Dispatchers.IO) {
                    applicationContext.contentResolver
                        .openInputStream(Uri.parse(call.fileUri))
                        ?.use { it.readBytes() }
                } ?: throw IOException("파일 읽기 실패: ${call.fileUri}")

                val filename = extractFilename(call.fileUri) ?: "audio_${call.id}.m4a"
                val rtzrId = rtzr.submit(bytes, filename)

                val transcript = pollUntilDone(rtzr, rtzrId)
                    ?: throw IOException("RTZR 전사 타임아웃")

                val summary = runCatching {
                    withContext(Dispatchers.IO) {
                        fetchSummary(http, backendUrl, transcript, call.phone)
                    }
                }.getOrDefault("")

                repo.setCallResult(call.id, transcript, summary)

                // 어드민 업로드 (실패해도 로컬 저장은 유지)
                runCatching {
                    withContext(Dispatchers.IO) {
                        val leadName = call.leadId?.let { repo.getLead(it)?.name }.orEmpty()
                        uploadTranscript(
                            http, backendUrl, agentName, leadName, call.phone,
                            call.startedAt, transcript, summary, call.id,
                        )
                    }
                }
            } catch (e: Exception) {
                repo.markCallFailed(call.id, e.message ?: "unknown")
            }
        }
        return Result.success()
    }

    private fun uploadTranscript(
        http: OkHttpClient,
        backendUrl: String,
        agentName: String,
        leadName: String,
        leadPhone: String,
        startedAt: Long,
        transcript: String,
        summary: String,
        clientCallId: Long,
    ) {
        val body = JSONObject()
            .put("agentName", agentName.ifBlank { "unknown" })
            .put("leadName", leadName)
            .put("leadPhone", leadPhone)
            .put("startedAt", startedAt)
            .put("transcript", transcript)
            .put("summary", summary)
            .put("clientCallId", clientCallId)
            .toString()
        val req = Request.Builder()
            .url("$backendUrl/api/transcripts")
            .header("X-App-Token", BuildConfig.APP_TOKEN)
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()
        http.newCall(req).execute().use { res ->
            if (!res.isSuccessful) {
                throw IOException("업로드 실패 (${res.code}): ${res.body?.string()?.take(200)}")
            }
        }
    }

    private suspend fun pollUntilDone(rtzr: RtzrClient, id: String): String? {
        val maxAttempts = 180 // 180 * 5s = 15분
        repeat(maxAttempts) {
            delay(5_000)
            val res = rtzr.status(id)
            when (res.status) {
                "completed" -> return res.transcript.orEmpty()
                "failed" -> throw IOException("RTZR 전사 실패")
            }
        }
        return null
    }

    private fun extractFilename(uri: String): String? {
        val segment = Uri.parse(uri).lastPathSegment ?: return null
        return segment.substringAfterLast('/').ifBlank { null }
    }

    private fun fetchSummary(
        http: OkHttpClient,
        backendUrl: String,
        transcript: String,
        phone: String,
    ): String {
        val body = JSONObject()
            .put("transcript", transcript)
            .put("phone", phone)
            .toString()
        val req = Request.Builder()
            .url("$backendUrl/api/rtzr/summarize")
            .header("X-App-Token", BuildConfig.APP_TOKEN)
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()
        http.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            if (!res.isSuccessful) return ""
            val lastLine = text.trim().lines().lastOrNull { it.isNotBlank() } ?: return ""
            val json = JSONObject(lastLine)
            if (!json.has("summary")) return ""
            val summary = json.getJSONArray("summary")
            val sb = StringBuilder()
            for (i in 0 until summary.length()) {
                sb.append(i + 1).append(". ").append(summary.getString(i)).append('\n')
            }
            if (json.has("keyPoints")) {
                val kp = json.getJSONArray("keyPoints")
                if (kp.length() > 0) {
                    sb.append("\n## 핵심 포인트\n")
                    for (i in 0 until kp.length()) {
                        val o = kp.getJSONObject(i)
                        sb.append("- [")
                            .append(o.optString("title"))
                            .append("] ")
                            .append(o.optString("detail"))
                            .append('\n')
                    }
                }
            }
            return sb.toString().trim()
        }
    }
}
