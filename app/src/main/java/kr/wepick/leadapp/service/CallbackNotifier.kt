package kr.wepick.leadapp.service

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import kr.wepick.leadapp.LeadApp
import kr.wepick.leadapp.MainActivity
import kr.wepick.leadapp.R
import kr.wepick.leadapp.util.PhoneUtils

/**
 * 재연락 약속 시각에 폰 로컬 알림을 띄우는 시스템.
 *
 * 흐름:
 *  1. SttWorker / Phase 1 로직이 callbackAt 을 DB 에 저장 + scheduleFor() 호출
 *  2. AlarmManager 가 정확한 시각에 CallbackAlarmReceiver 호출
 *  3. Receiver 가 NotificationManager 로 알림 발행
 *  4. 알림 클릭 → MainActivity 가 deep link extra "callId" 처리
 *
 * Doze 모드 회피: setExactAndAllowWhileIdle 사용 + 배터리 최적화 예외 권장.
 */
object CallbackNotifier {

    private const val TAG = "CallbackNotifier"
    const val CHANNEL_ID = "callback_reminders"
    const val CHANNEL_NAME = "재연락 알림"
    const val CHANNEL_DESC = "약속한 재연락 시각이 되면 알림으로 알려줍니다."

    /** 알림 PendingIntent 의 request code 는 callId 그대로 사용 (충돌 방지). */
    private fun reqCode(callId: Long): Int = (callId and 0x7FFFFFFFL).toInt()

    /** 채널 등록 (앱 시작 시 1회). */
    fun ensureChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = ctx.getSystemService(NotificationManager::class.java)
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                val ch = NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH,
                ).apply { description = CHANNEL_DESC }
                nm.createNotificationChannel(ch)
            }
        }
    }

    /** callbackAt 시각에 알림이 뜨도록 AlarmManager 예약. 과거 시각이면 즉시 띄우지 않고 무시. */
    fun scheduleFor(ctx: Context, callId: Long, callbackAtMs: Long, leadName: String, leadPhone: String) {
        val now = System.currentTimeMillis()
        if (callbackAtMs <= now) {
            Log.i(TAG, "callId=$callId 과거 시각 ($callbackAtMs) — 알림 스킵")
            return
        }
        ensureChannel(ctx)
        val intent = Intent(ctx, CallbackAlarmReceiver::class.java).apply {
            action = ACTION_FIRE
            putExtra(EXTRA_CALL_ID, callId)
            putExtra(EXTRA_LEAD_NAME, leadName)
            putExtra(EXTRA_LEAD_PHONE, leadPhone)
        }
        val pi = PendingIntent.getBroadcast(
            ctx, reqCode(callId), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        try {
            // setExactAndAllowWhileIdle: Doze 무시. SCHEDULE_EXACT_ALARM 권한 불필요 (정확 알람용 일반).
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, callbackAtMs, pi)
            Log.i(TAG, "callId=$callId 알림 예약: ${java.util.Date(callbackAtMs)}")
        } catch (e: SecurityException) {
            // Android 12+ 에서 SCHEDULE_EXACT_ALARM 거부된 경우 inexact 로 폴백
            am.set(AlarmManager.RTC_WAKEUP, callbackAtMs, pi)
            Log.w(TAG, "exact 알람 거부 — inexact 로 폴백: ${e.message}")
        }
    }

    /** 같은 callId 의 기존 예약을 취소 (예: callback 시각 변경 또는 처리 완료 시). */
    fun cancel(ctx: Context, callId: Long) {
        val intent = Intent(ctx, CallbackAlarmReceiver::class.java).apply { action = ACTION_FIRE }
        val pi = PendingIntent.getBroadcast(
            ctx, reqCode(callId), intent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
        )
        if (pi != null) {
            (ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pi)
            pi.cancel()
        }
    }

    /** Receiver 가 호출 — 실제 notification 발행. */
    fun fireNotification(ctx: Context, callId: Long, leadName: String, leadPhone: String) {
        ensureChannel(ctx)
        val tapIntent = Intent(ctx, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_CALL_ID, callId)
        }
        val tapPi = PendingIntent.getActivity(
            ctx, reqCode(callId), tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val displayName = leadName.ifBlank { "(이름 없음)" }
        val displayPhone = if (leadPhone.isBlank()) "" else " · ${PhoneUtils.format(leadPhone)}"
        val n = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("재연락 약속 시간입니다")
            .setContentText("$displayName$displayPhone")
            .setStyle(NotificationCompat.BigTextStyle().bigText("$displayName$displayPhone — 약속한 재연락 시각이 되었습니다."))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(tapPi)
            .build()
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(reqCode(callId), n)
    }

    const val ACTION_FIRE = "kr.wepick.leadapp.action.FIRE_CALLBACK_NOTIF"
    const val EXTRA_CALL_ID = "callId"
    const val EXTRA_LEAD_NAME = "leadName"
    const val EXTRA_LEAD_PHONE = "leadPhone"
}

/** AlarmManager 가 호출하는 Receiver — 실제 알림을 띄움. */
class CallbackAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != CallbackNotifier.ACTION_FIRE) return
        val callId = intent.getLongExtra(CallbackNotifier.EXTRA_CALL_ID, -1L)
        val leadName = intent.getStringExtra(CallbackNotifier.EXTRA_LEAD_NAME).orEmpty()
        val leadPhone = intent.getStringExtra(CallbackNotifier.EXTRA_LEAD_PHONE).orEmpty()
        if (callId < 0) return
        CallbackNotifier.fireNotification(ctx, callId, leadName, leadPhone)
        // notifyScheduled 플래그 정리 (이미 fire 됐으니 더 이상 예약 상태 아님)
        @OptIn(kotlinx.coroutines.DelicateCoroutinesApi::class)
        GlobalScope.launch(Dispatchers.IO) {
            runCatching { LeadApp.instance.leadRepo.markCallbackFired(callId) }
        }
    }
}
