package kr.wepick.leadapp.util

import java.util.TimeZone

/**
 * 통화 요약 텍스트에서 재연락 마커 추출.
 *
 * 마커 포맷: `[#재연락]` 또는 `[#재연락 YYYY-MM-DDTHH:MM]`
 * (시각은 KST 기준 wall time 으로 가정 — 백엔드 lib/alerts.ts 와 동일 규약).
 *
 * 백엔드 alerts/route.ts 의 extractCallback() 과 1:1 호환.
 * 어드민에서도, 폰에서도 같은 마커를 파싱해 동일한 callbackAtMs 를 얻는다.
 */
object CallbackParser {

    data class Callback(
        val callbackAtIso: String?, // "YYYY-MM-DDTHH:MM" (KST wall time) 또는 null
        val callbackAtMs: Long?,    // UTC epoch ms 또는 null
        val note: String,
    )

    // 마커는 시각 형식과 무관하게 인식 — 시각이 깨져도 재연락 자체는 등록돼야 한다.
    // ([^\]]+ 로 ] 전까지 통째로 캡처한 뒤 시각은 별도 정규화)
    private val CALLBACK_RE =
        Regex("""\[#재연락(?:\s+([^\]]+))?]\s*(.*)""")

    /** AI 출력의 자릿수 편차 허용: 2026-4-3T9:00 / 'T' 대신 공백도 인정. */
    private val LENIENT_TIME_RE =
        Regex("""^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})$""")

    /** "1. " 같은 leading 번호 제거 후 첫 줄을 매치. */
    private val LEADING_NUMBER_RE = Regex("""^\s*\d+\.\s*""")

    fun extract(summary: String?): Callback? {
        if (summary.isNullOrBlank()) return null
        val firstLine = summary.lineSequence().firstOrNull()
            ?.replaceFirst(LEADING_NUMBER_RE, "")
            ?.trim()
            ?: return null
        val m = CALLBACK_RE.find(firstLine) ?: return null
        val rawTime = m.groupValues.getOrNull(1)?.trim()?.takeIf { it.isNotBlank() }
        // 시각 정규화 실패 시에도 마커는 유효 — "시각 미정" 재연락으로 등록
        val iso = rawTime?.let { normalizeIso(it) }
        val note = m.groupValues.getOrNull(2)?.trim().orEmpty()
        return Callback(
            callbackAtIso = iso,
            callbackAtMs = iso?.let { kstIsoToMs(it) },
            note = note,
        )
    }

    /** 자릿수 편차를 zero-pad 해 'YYYY-MM-DDTHH:MM' 으로 정규화. 해석 불가면 null. */
    private fun normalizeIso(raw: String): String? {
        val m = LENIENT_TIME_RE.matchEntire(raw) ?: return null
        val (y, mo, d, h, mi) = m.destructured
        return "%s-%02d-%02dT%02d:%s".format(y, mo.toInt(), d.toInt(), h.toInt(), mi)
    }

    /** "YYYY-MM-DDTHH:MM" (KST 가정) → UTC epoch ms */
    private fun kstIsoToMs(iso: String): Long? = runCatching {
        // SimpleDateFormat 로 KST 해석.
        val fmt = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm", java.util.Locale.US)
        fmt.timeZone = TimeZone.getTimeZone("Asia/Seoul")
        fmt.parse(iso)?.time
    }.getOrNull()
}
