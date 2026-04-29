package kr.wepick.leadapp.service

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import kr.wepick.leadapp.LeadApp
import kr.wepick.leadapp.util.CallLogResolver
import kr.wepick.leadapp.util.PhoneUtils
import java.util.concurrent.TimeUnit

/**
 * 발신 직후 만들어진 AWAITING_FILE 스텁을 빠르게 검증하는 워커.
 *
 * 흐름:
 *  1. LeadDetailScreen 에서 사용자가 "전화" 탭 → repo.startOutgoingCall() 로 stub 생성
 *  2. 동시에 이 워커가 INITIAL_DELAY 후 큐잉
 *  3. 워커가 CallLog 에서 stub.startedAt 근처 OUTGOING 항목 찾음:
 *     - duration > 0 → RECORDED 로 유지 (CallFolderScanWorker 가 녹음 파일 처리)
 *     - duration = 0 → 미응답 — stub 을 callType=NO_ANSWER, status=NO_TRANSCRIPT
 *       로 변환 + 즉시 업로드 큐잉
 *     - CallLog 미발견 → 아직 통화 중일 수 있으니 RETRY_DELAY 후 다시 시도 (최대 2회)
 *
 * 이게 없으면 stub 이 녹음대기 상태로 영원히 남고, 한참 뒤 별개의 CallLog 스캔이
 * 중복 NO_ANSWER record 를 만들어 같은 통화가 두 번 표시됨.
 */
class OutgoingCallVerifyWorker(
    ctx: Context,
    params: WorkerParameters,
) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val callId = inputData.getLong(KEY_CALL_ID, -1L)
        val attempt = inputData.getInt(KEY_ATTEMPT, 1)
        if (callId < 0) return Result.success()

        val repo = LeadApp.instance.leadRepo
        val call = repo.getCall(callId) ?: return Result.success()

        // 이미 다른 경로에서 처리됐으면 (녹음 파일 attach 됨, 또는 NO_ANSWER 변환됨) 스킵.
        if (call.status != "AWAITING_FILE") {
            Log.i(TAG, "callId=$callId 이미 처리됨 (status=${call.status}) — 스킵")
            return Result.success()
        }

        if (!CallLogResolver.hasPermission(applicationContext)) {
            Log.w(TAG, "READ_CALL_LOG 권한 없음 — 검증 불가")
            return Result.success()
        }

        // CallLog 에서 stub.startedAt 근처 ±LOOKUP_WINDOW_MS 항목 조회.
        val sinceMs = call.startedAt - LOOKUP_WINDOW_MS
        val phoneNorm = PhoneUtils.normalize(call.phone)
        val match = CallLogResolver.listEntriesSince(applicationContext, sinceMs)
            .filter { e ->
                // 같은 번호 + stub.startedAt 근처 + OUTGOING (NO_ANSWER 또는 RECORDED)
                val sameNumber = PhoneUtils.normalize(e.phone) == phoneNorm
                val nearTime = kotlin.math.abs(e.date - call.startedAt) <= LOOKUP_WINDOW_MS
                sameNumber && nearTime &&
                    (e.callType == "NO_ANSWER" || e.callType == "RECORDED")
            }
            // 가장 가까운 시각의 항목 우선
            .minByOrNull { kotlin.math.abs(it.date - call.startedAt) }

        if (match == null) {
            // 아직 CallLog 에 안 떴거나, 통화 중. 재시도.
            if (attempt < MAX_ATTEMPTS) {
                val next = OneTimeWorkRequestBuilder<OutgoingCallVerifyWorker>()
                    .setInitialDelay(RETRY_DELAY_SEC, TimeUnit.SECONDS)
                    .setInputData(workDataOf(KEY_CALL_ID to callId, KEY_ATTEMPT to attempt + 1))
                    .build()
                WorkManager.getInstance(applicationContext).enqueue(next)
                Log.i(TAG, "callId=$callId CallLog 미발견 — ${RETRY_DELAY_SEC}s 후 재시도 (attempt=${attempt + 1})")
            } else {
                Log.w(TAG, "callId=$callId 최대 재시도 도달 — 다음 주기 스캔으로 위임")
            }
            return Result.success()
        }

        if (match.callType == "NO_ANSWER") {
            // 미응답 — stub 을 NO_ANSWER 로 변환 + 즉시 업로드 큐잉.
            val sentinel = "calllog:${match.date}"
            repo.convertStubToNoAnswer(
                id = callId,
                fileUri = sentinel,
                durationSec = 0,
            )
            UploadRetryWorker.enqueueImmediate(applicationContext, callId)
            Log.i(TAG, "callId=$callId 발신 미응답 확정 — NO_ANSWER 로 변환 + 업로드 큐잉")
        } else {
            // RECORDED — 통화 연결됨. 녹음 파일은 CallFolderScanWorker 가 처리.
            // stub 의 durationSec 는 갱신해두면 detail 화면 길이 표시에 도움.
            if (match.durationSec > 0) {
                repo.updateStubDuration(callId, match.durationSec)
            }
            Log.i(TAG, "callId=$callId 통화 연결됨 (${match.durationSec}s) — 녹음 파일 대기")
        }
        return Result.success()
    }

    companion object {
        private const val TAG = "OutgoingCallVerifyWorker"
        const val KEY_CALL_ID = "callId"
        const val KEY_ATTEMPT = "attempt"

        /** stub 시각 ± 이 창 안의 CallLog 항목만 같은 통화로 간주. */
        private const val LOOKUP_WINDOW_MS = 5L * 60 * 1000

        /** 첫 검증까지 대기 — 벨 울리는 시간 + Samsung CallLog 기록 지연 마진. */
        private const val INITIAL_DELAY_SEC = 60L

        /** 첫 검증 때 CallLog 미발견 시 재시도 간격. */
        private const val RETRY_DELAY_SEC = 60L

        /** 최대 시도. 1차+재시도 1회 = 총 2분 대기 후 포기. */
        private const val MAX_ATTEMPTS = 2

        /** 발신 직후 호출 — 60초 후 첫 검증. */
        fun enqueue(ctx: Context, callId: Long) {
            val req = OneTimeWorkRequestBuilder<OutgoingCallVerifyWorker>()
                .setInitialDelay(INITIAL_DELAY_SEC, TimeUnit.SECONDS)
                .setInputData(workDataOf(KEY_CALL_ID to callId, KEY_ATTEMPT to 1))
                .build()
            WorkManager.getInstance(ctx).enqueue(req)
        }
    }
}
