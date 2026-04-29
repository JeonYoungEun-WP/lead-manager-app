package kr.wepick.leadapp.service

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kr.wepick.leadapp.LeadApp
import java.util.concurrent.Executors

/**
 * 통화 상태(OFFHOOK→IDLE) 전환 감지 → 발신 stub 즉시 검증 트리거.
 *
 * 핵심 시나리오: 사용자가 앱 '전화' 버튼으로 발신 → AWAITING_FILE stub 생성.
 *  - 통화가 즉시 끊기면(상대 미응답/거절) IDLE 진입 즉시 감지 → 3초 후 워커 큐잉
 *    → 60초 보험을 안 기다리고 즉시 NO_ANSWER 로 확정.
 *
 * 권한: READ_PHONE_STATE 가 이미 있으므로 별도 요청 없이 등록 가능 (minSdk 33 + TelephonyCallback API).
 */
class CallStateMonitor(private val ctx: Context) {

    private val executor = Executors.newSingleThreadExecutor()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var callback: TelephonyCallback? = null

    @Volatile private var lastState: Int = TelephonyManager.CALL_STATE_IDLE

    fun start() {
        if (ctx.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) !=
            PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "READ_PHONE_STATE 권한 없음 — 통화 상태 감시 미작동 (60초 보험만 동작)")
            return
        }
        val telephony = ctx.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
        if (telephony == null) {
            Log.w(TAG, "TelephonyManager 가져오기 실패")
            return
        }
        val cb = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
            override fun onCallStateChanged(state: Int) {
                val prev = lastState
                lastState = state
                if (prev == TelephonyManager.CALL_STATE_OFFHOOK &&
                    state == TelephonyManager.CALL_STATE_IDLE) {
                    onCallEnded()
                }
            }
        }
        try {
            telephony.registerTelephonyCallback(executor, cb)
            callback = cb
            Log.i(TAG, "통화 상태 감시 시작")
        } catch (e: SecurityException) {
            Log.w(TAG, "TelephonyCallback 등록 실패: ${e.message}")
        }
    }

    fun stop() {
        val telephony = ctx.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
        callback?.let { telephony?.unregisterTelephonyCallback(it) }
        callback = null
    }

    /**
     * IDLE 진입 — 발신 stub 이 있으면 즉시 검증 트리거.
     * 가장 최근 ±10분 안의 AWAITING_FILE stub 만 처리 (오래된 건 이미 다른 경로로 처리됨).
     */
    private fun onCallEnded() {
        scope.launch {
            runCatching {
                val now = System.currentTimeMillis()
                val stub = LeadApp.instance.leadRepo
                    .findMostRecentAwaitingStub(now - LOOKBACK_MS)
                if (stub != null) {
                    Log.i(TAG, "통화 종료 감지 → callId=${stub.id} 즉시 검증 큐잉")
                    OutgoingCallVerifyWorker.enqueueImmediate(ctx, stub.id)
                }
            }.onFailure { Log.w(TAG, "stub 조회 실패: ${it.message}") }
        }
    }

    companion object {
        private const val TAG = "CallStateMonitor"
        private const val LOOKBACK_MS = 10L * 60 * 1000 // 10분
    }
}
