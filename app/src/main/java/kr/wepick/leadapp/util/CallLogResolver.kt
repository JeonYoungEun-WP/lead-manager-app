package kr.wepick.leadapp.util

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CallLog
import kotlin.math.abs

/**
 * Android CallLog 로 녹음 파일 타임스탬프 → 전화번호 매핑.
 * 폰 연락처에 저장된 번호든 아니든 CallLog.NUMBER 에는 실제 전화번호가 들어감.
 */
object CallLogResolver {

    private const val WINDOW_MS = 5 * 60 * 1000L

    /**
     * CallLog 한 항목 — callType 분류용.
     * callType: "RECORDED" / "NO_ANSWER" / "MISSED" / "REJECTED"
     */
    data class Entry(
        val phone: String,
        val date: Long,
        val durationSec: Int,
        val callType: String,
    )

    fun hasPermission(ctx: Context): Boolean =
        ctx.checkSelfPermission(Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED

    /**
     * 주어진 시각 근처(±5분) 의 CallLog 엔트리에서 가장 가까운 번호 반환.
     * 권한 없거나 매칭 없으면 null.
     */
    fun findPhoneByTimestamp(ctx: Context, tsMs: Long): String? {
        if (!hasPermission(ctx)) return null
        val cols = arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.DATE)
        val selection = "${CallLog.Calls.DATE} >= ? AND ${CallLog.Calls.DATE} <= ?"
        val args = arrayOf((tsMs - WINDOW_MS).toString(), (tsMs + WINDOW_MS).toString())
        ctx.contentResolver.query(
            CallLog.Calls.CONTENT_URI, cols, selection, args,
            "${CallLog.Calls.DATE} ASC",
        )?.use { c ->
            var best: String? = null
            var bestDiff = Long.MAX_VALUE
            while (c.moveToNext()) {
                val number = c.getString(0) ?: continue
                val date = c.getLong(1)
                val diff = abs(date - tsMs)
                if (diff < bestDiff) {
                    bestDiff = diff
                    best = number
                }
            }
            return best
        }
        return null
    }

    /**
     * 최근 N분 내의 CallLog 항목들을 통화유형 분류와 함께 반환.
     * fromMs 이상의 항목만 가져옴. 정렬: 시간 ASC.
     * 권한 없으면 빈 리스트.
     */
    fun listEntriesSince(ctx: Context, fromMs: Long): List<Entry> {
        if (!hasPermission(ctx)) return emptyList()
        val cols = arrayOf(
            CallLog.Calls.NUMBER,
            CallLog.Calls.DATE,
            CallLog.Calls.DURATION,
            CallLog.Calls.TYPE,
        )
        val selection = "${CallLog.Calls.DATE} >= ?"
        val args = arrayOf(fromMs.toString())
        val out = mutableListOf<Entry>()
        ctx.contentResolver.query(
            CallLog.Calls.CONTENT_URI, cols, selection, args,
            "${CallLog.Calls.DATE} ASC",
        )?.use { c ->
            while (c.moveToNext()) {
                val number = c.getString(0) ?: continue
                val date = c.getLong(1)
                val durSec = c.getInt(2)
                val type = c.getInt(3)
                val callType = classifyCallType(type, durSec)
                out += Entry(number, date, durSec, callType)
            }
        }
        return out
    }

    /** CallLog.Calls.TYPE + duration 으로 우리 시스템의 callType 분류. */
    private fun classifyCallType(callLogType: Int, durationSec: Int): String = when (callLogType) {
        CallLog.Calls.MISSED_TYPE -> "MISSED"
        CallLog.Calls.REJECTED_TYPE -> "REJECTED"
        CallLog.Calls.OUTGOING_TYPE -> if (durationSec <= 0) "NO_ANSWER" else "RECORDED"
        CallLog.Calls.INCOMING_TYPE -> "RECORDED"
        else -> "RECORDED" // VOICEMAIL/BLOCKED 등은 일단 RECORDED 로 묶음 (드뭄)
    }
}
