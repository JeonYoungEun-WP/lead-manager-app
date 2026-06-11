package kr.wepick.leadapp.service

import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.util.Log
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

    private companion object {
        const val TAG = "SttWorker"
    }

    override suspend fun doWork(): Result {
        val repo = LeadApp.instance.leadRepo

        // 좀비 복구: 이전 워커가 죽으면서 PROCESSING 으로 박힌 레코드를 PENDING 으로 되돌린다.
        // UNIQUE work (APPEND_OR_REPLACE) 정책상 SttWorker 동시 실행은 없으므로 안전.
        // backendUrl 미설정 등 어떤 이유로 조기 return 해도 복구는 먼저 보장되어야 한다.
        val recovered = repo.resetStaleProcessing()
        if (recovered > 0) {
            Log.w(TAG, "좀비 PROCESSING 레코드 ${recovered}건을 PENDING 으로 복구했습니다.")
        }

        val prefs = applicationContext.appPreferences.data.first()
        val backendUrl = kr.wepick.leadapp.util.effectiveBackendUrl(prefs[KEY_BACKEND_URL])
        val agentName = prefs[KEY_AGENT_NAME]?.trim().orEmpty()

        val http = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(90, TimeUnit.SECONDS)
            .writeTimeout(10, TimeUnit.MINUTES)
            .build()
        val rtzr = RtzrClient(http, backendUrl)

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

                // 음성사서함 후판정 1차 (키워드) — 상대가 안 받아 소리샘으로 넘어간
                // 통화는 OS가 정상 녹음으로 기록하지만 실제로는 미응답이다.
                if (kr.wepick.leadapp.util.VoicemailDetector.isVoicemail(transcript)) {
                    Log.i(TAG, "callId=${call.id} 음성사서함 감지(키워드) → NO_ANSWER 전환")
                    repo.convertToVoicemailNoAnswer(call.id)
                    UploadRetryWorker.enqueueImmediate(applicationContext, call.id)
                    continue
                }

                val summaryResult = runCatching {
                    withContext(Dispatchers.IO) {
                        fetchSummary(http, backendUrl, transcript, call.phone)
                    }
                }.getOrDefault(SummaryResult("", voicemail = false))

                // 음성사서함 후판정 2차 (Claude) — 키워드에 안 걸린 변형 안내멘트 보강.
                if (summaryResult.voicemail) {
                    Log.i(TAG, "callId=${call.id} 음성사서함 감지(Claude) → NO_ANSWER 전환")
                    repo.convertToVoicemailNoAnswer(call.id)
                    UploadRetryWorker.enqueueImmediate(applicationContext, call.id)
                    continue
                }
                val summary = summaryResult.text

                repo.setCallResult(call.id, transcript, summary)

                // 재연락 마커 추출 → DB 저장 + 폰 로컬 알림 예약 (Phase 1+2)
                val callback = kr.wepick.leadapp.util.CallbackParser.extract(summary)
                if (callback?.callbackAtMs != null) {
                    repo.setCallbackInfo(call.id, callback.callbackAtMs, "재연락")
                    val leadNameForAlarm = call.leadId?.let { repo.getLead(it)?.name }.orEmpty()
                    CallbackNotifier.scheduleFor(
                        applicationContext,
                        call.id,
                        callback.callbackAtMs,
                        leadNameForAlarm,
                        call.phone,
                    )
                    repo.markCallbackScheduled(call.id)
                }

                // 어드민 업로드 (실패해도 로컬 저장은 유지, 실패 사유는 uploadError 에 기록)
                val durationSec = call.durationSec
                    ?: extractDurationSec(applicationContext, Uri.parse(call.fileUri))
                val uploadResult = runCatching {
                    withContext(Dispatchers.IO) {
                        val leadName = call.leadId?.let { repo.getLead(it)?.name }.orEmpty()
                        uploadTranscript(
                            http, backendUrl, agentName, leadName, call.phone,
                            call.startedAt, transcript, summary, call.id, durationSec,
                            callback?.callbackAtMs,
                            outcome = summaryResult.outcome,
                            reservationAt = summaryResult.reservationAt,
                        )
                    }
                }
                uploadResult.fold(
                    onSuccess = { repo.markUploadOk(call.id) },
                    onFailure = { e ->
                        repo.markUploadFailed(call.id, e.message?.take(500) ?: "unknown")
                        // 자동 재시도 — 1분 뒤 attempt=1 시작. 실패 시 5분/30분/24시간 백오프.
                        UploadRetryWorker.enqueueAuto(applicationContext, call.id)
                    },
                )
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
        durationSec: Int?,
        callbackAtMs: Long?,
        outcome: String? = null,
        reservationAt: String? = null,
    ) {
        val body = JSONObject()
            .put("agentName", agentName.ifBlank { "unknown" })
            .put("leadName", leadName)
            .put("leadPhone", leadPhone)
            .put("startedAt", startedAt)
            .put("transcript", transcript)
            .put("summary", summary)
            .put("clientCallId", clientCallId)
            .put("callType", "RECORDED")
            .apply {
                if (durationSec != null && durationSec > 0) put("durationSec", durationSec)
                if (callbackAtMs != null) put("callbackAt", callbackAtMs)
                // ✨ 자동 상태 제안 입력값 — 백엔드가 suggestStatus 계산에 사용
                if (outcome != null) put("outcome", outcome)
                if (reservationAt != null) put("reservationAt", reservationAt)
            }
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

    /**
     * 오디오 파일에서 통화 길이(초) 추출. 실패하면 null.
     * MediaMetadataRetriever 는 SAF content URI 도 지원.
     */
    private fun extractDurationSec(ctx: Context, fileUri: Uri): Int? {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(ctx, fileUri)
            val ms = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
                ?.toLongOrNull() ?: return null
            (ms / 1000).toInt().takeIf { it > 0 }
        } catch (e: Exception) {
            Log.w(TAG, "duration 추출 실패: ${e.message}")
            null
        } finally {
            runCatching { retriever.release() }
        }
    }

    /** 요약 텍스트 + 백엔드(Claude)의 판정들 (음성사서함 / 통화 결과 분류). */
    data class SummaryResult(
        val text: String,
        val voicemail: Boolean,
        /** 예약확정/재연락/거절의사/기타 — 자동 상태 제안용. 구버전 응답이면 null. */
        val outcome: String? = null,
        /** outcome=예약확정 시 KST "YYYY-MM-DDTHH:MM". */
        val reservationAt: String? = null,
    )

    private fun fetchSummary(
        http: OkHttpClient,
        backendUrl: String,
        transcript: String,
        phone: String,
    ): SummaryResult {
        val empty = SummaryResult("", voicemail = false)
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
            if (!res.isSuccessful) return empty
            val lastLine = text.trim().lines().lastOrNull { it.isNotBlank() } ?: return empty
            val json = JSONObject(lastLine)
            if (!json.has("summary")) return empty
            val voicemail = json.optBoolean("voicemail", false)
            val outcome = json.optString("outcome").takeIf { it.isNotBlank() }
            val reservationAt = json.optString("reservationAt").takeIf { it.isNotBlank() }
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
            return SummaryResult(sb.toString().trim(), voicemail, outcome, reservationAt)
        }
    }
}
