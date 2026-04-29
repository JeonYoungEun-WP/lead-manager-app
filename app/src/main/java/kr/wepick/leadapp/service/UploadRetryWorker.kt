package kr.wepick.leadapp.service

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import kotlinx.coroutines.Dispatchers
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
 * 어드민 업로드 단건 재시도 워커.
 *
 * - 백오프 정책 (SttWorker 자동 트리거 기준):
 *     - attempt 1 (1분 뒤): SttWorker 가 실패 직후 enqueueAuto() 로 큐잉
 *     - attempt 2 (5분 뒤)
 *     - attempt 3 (30분 뒤)
 *     - attempt 4 (24시간 뒤) — 마지막 시도, 실패 시 영구 FAILED
 * - 수동 재시도 버튼: enqueueImmediate() 사용 — attempt=1, no delay 로 즉시 한 번 더 시도.
 * - 멱등성: 백엔드 POST /api/transcripts 가 (startedAt, clientCallId, agentName) 조합으로
 *   중복 검출 → 이미 업로드된 통화는 기존 URL 반환받고 markUploadOk.
 *
 * input data:
 *   - "callId": Long (필수)
 *   - "attempt": Int (기본 1)
 */
class UploadRetryWorker(
    ctx: Context,
    params: WorkerParameters,
) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val callId = inputData.getLong(KEY_CALL_ID, -1L)
        val attempt = inputData.getInt(KEY_ATTEMPT, 1)
        if (callId < 0) {
            Log.w(TAG, "callId 미지정 — 스킵")
            return Result.success()
        }

        val repo = LeadApp.instance.leadRepo
        val call = repo.getCall(callId)
        if (call == null) {
            Log.w(TAG, "callId=$callId 조회 실패 — 스킵 (이미 삭제됨?)")
            return Result.success()
        }
        if (call.uploadStatus == "OK") {
            Log.i(TAG, "callId=$callId 이미 업로드 완료 — 스킵")
            return Result.success()
        }
        // RECORDED 만 transcript 필수. NO_ANSWER / MISSED / REJECTED 는 transcript 없이 업로드 가능.
        if (call.callType == "RECORDED" && call.transcript.isNullOrBlank()) {
            Log.w(TAG, "callId=$callId RECORDED 인데 transcript 비어있음 — STT 미완료 상태")
            repo.markUploadFailed(callId, "transcript 없음 — STT 미완료 상태 재시도 불가")
            return Result.success()
        }

        val prefs = applicationContext.appPreferences.data.first()
        val backendUrl = prefs[KEY_BACKEND_URL]?.trim()?.trimEnd('/').orEmpty()
        if (backendUrl.isBlank()) {
            repo.markUploadFailed(callId, "백엔드 URL 미설정")
            return Result.success()
        }
        val agentName = prefs[KEY_AGENT_NAME]?.trim().orEmpty()
        val leadName = call.leadId?.let { repo.getLead(it)?.name }.orEmpty()

        val http = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(2, TimeUnit.MINUTES)
            .build()

        val outcome = runCatching {
            withContext(Dispatchers.IO) {
                postTranscript(
                    http, backendUrl,
                    agentName = agentName.ifBlank { "unknown" },
                    leadName = leadName,
                    leadPhone = call.phone,
                    startedAt = call.startedAt,
                    transcript = call.transcript.orEmpty(),
                    summary = call.summary.orEmpty(),
                    clientCallId = call.id,
                    durationSec = call.durationSec,
                    callType = call.callType,
                )
            }
        }
        return outcome.fold(
            onSuccess = {
                repo.markUploadOk(callId)
                Log.i(TAG, "callId=$callId 업로드 성공 (attempt=$attempt)")
                Result.success()
            },
            onFailure = { e ->
                val msg = "재시도 ${attempt}회 실패: ${e.message?.take(300) ?: "unknown"}"
                repo.markUploadFailed(callId, msg)
                Log.w(TAG, "callId=$callId $msg")
                scheduleNextAttemptIfAny(callId, attempt)
                Result.success() // 자체 retry() 안 씀 — 정확한 백오프는 직접 reschedule
            },
        )
    }

    private fun scheduleNextAttemptIfAny(callId: Long, currentAttempt: Int) {
        val nextDelayMin: Long? = when (currentAttempt) {
            1 -> 5L                  // attempt 1 실패 → attempt 2 (5분 뒤)
            2 -> 30L                 // → 30분 뒤
            3 -> 60L * 24            // → 24시간 뒤
            else -> null             // attempt 4 실패 — 영구 FAILED, 재시도 중단
        }
        if (nextDelayMin == null) {
            Log.w(TAG, "callId=$callId 최대 재시도 도달 — 영구 FAILED")
            return
        }
        val req = OneTimeWorkRequestBuilder<UploadRetryWorker>()
            .setInitialDelay(nextDelayMin, TimeUnit.MINUTES)
            .setInputData(workDataOf(KEY_CALL_ID to callId, KEY_ATTEMPT to currentAttempt + 1))
            .build()
        WorkManager.getInstance(applicationContext).enqueue(req)
    }

    private fun postTranscript(
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
        callType: String,
    ) {
        val body = JSONObject()
            .put("agentName", agentName)
            .put("leadName", leadName)
            .put("leadPhone", leadPhone)
            .put("startedAt", startedAt)
            .put("clientCallId", clientCallId)
            .put("callType", callType)
            .apply {
                if (transcript.isNotBlank()) put("transcript", transcript)
                if (summary.isNotBlank()) put("summary", summary)
                if (durationSec != null && durationSec > 0) put("durationSec", durationSec)
            }
            .toString()
        val req = Request.Builder()
            .url("$backendUrl/api/transcripts")
            .header("X-App-Token", BuildConfig.APP_TOKEN)
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()
        http.newCall(req).execute().use { res ->
            if (!res.isSuccessful) {
                throw IOException("HTTP ${res.code}: ${res.body?.string()?.take(200)}")
            }
        }
    }

    companion object {
        private const val TAG = "UploadRetryWorker"
        const val KEY_CALL_ID = "callId"
        const val KEY_ATTEMPT = "attempt"

        /**
         * 수동 재시도 (UI 의 "재업로드" 버튼). attempt=1, no delay → 즉시 시도.
         * 실패 시 5분/30분/24시간 후 자동 재시도 체인 진입.
         */
        fun enqueueImmediate(ctx: Context, callId: Long) {
            val req = OneTimeWorkRequestBuilder<UploadRetryWorker>()
                .setInputData(workDataOf(KEY_CALL_ID to callId, KEY_ATTEMPT to 1))
                .build()
            WorkManager.getInstance(ctx).enqueue(req)
        }

        /**
         * SttWorker 자동 트리거. attempt=1 을 1분 뒤 첫 시도로 큐잉.
         * (SttWorker 가 직전 시도를 막 실패한 직후라 즉시 재시도는 무의미 — 1분 뒤 시작)
         */
        fun enqueueAuto(ctx: Context, callId: Long) {
            val req = OneTimeWorkRequestBuilder<UploadRetryWorker>()
                .setInitialDelay(1, TimeUnit.MINUTES)
                .setInputData(workDataOf(KEY_CALL_ID to callId, KEY_ATTEMPT to 1))
                .build()
            WorkManager.getInstance(ctx).enqueue(req)
        }
    }
}
