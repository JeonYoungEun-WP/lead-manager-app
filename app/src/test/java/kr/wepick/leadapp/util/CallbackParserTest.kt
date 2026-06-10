package kr.wepick.leadapp.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

class CallbackParserTest {

    @Test
    fun nullOrBlank_returnsNull() {
        assertNull(CallbackParser.extract(null))
        assertNull(CallbackParser.extract(""))
        assertNull(CallbackParser.extract("   "))
    }

    @Test
    fun noMarker_returnsNull() {
        assertNull(CallbackParser.extract("1. 고객이 가격을 문의함\n2. 다음 주 결정 예정"))
    }

    @Test
    fun markerWithoutTime() {
        val cb = CallbackParser.extract("[#재연락] 바쁘니까 다시 연락 요청")
        assertNotNull(cb)
        assertNull(cb!!.callbackAtIso)
        assertNull(cb.callbackAtMs)
        assertEquals("바쁘니까 다시 연락 요청", cb.note)
    }

    @Test
    fun markerWithTime_convertsKstToUtcMs() {
        val cb = CallbackParser.extract("[#재연락 2026-04-30T15:00] 오후 3시 재연락 약속")
        assertNotNull(cb)
        assertEquals("2026-04-30T15:00", cb!!.callbackAtIso)
        assertEquals("오후 3시 재연락 약속", cb.note)
        // KST 15:00 == UTC 06:00 (KST = UTC+9, 서머타임 없음)
        val expected = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply {
            clear()
            set(2026, Calendar.APRIL, 30, 6, 0, 0)
        }.timeInMillis
        assertEquals(expected, cb.callbackAtMs)
    }

    @Test
    fun leadingListNumber_isStripped() {
        // Claude/Gemini 요약이 "1. " 로 시작해도 마커 인식
        val cb = CallbackParser.extract("1. [#재연락 2026-05-01T09:30] 아침에 통화")
        assertNotNull(cb)
        assertEquals("2026-05-01T09:30", cb!!.callbackAtIso)
    }

    @Test
    fun markerOnSecondLine_isIgnored() {
        // 규약상 마커는 summary 첫 줄에만 유효
        assertNull(CallbackParser.extract("첫 줄 요약\n[#재연락] 둘째 줄 마커"))
    }

    @Test
    fun lenientTime_zeroPadNormalized() {
        // AI 가 0 패딩을 빼먹어도 시각을 정규화해서 인식
        val cb = CallbackParser.extract("[#재연락 2026-4-3T9:00] 메모")
        assertNotNull(cb)
        assertEquals("2026-04-03T09:00", cb!!.callbackAtIso)
        assertEquals("메모", cb.note)
        val expected = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply {
            clear()
            set(2026, Calendar.APRIL, 3, 0, 0, 0) // KST 09:00 == UTC 00:00
        }.timeInMillis
        assertEquals(expected, cb.callbackAtMs)
    }

    @Test
    fun lenientTime_spaceSeparatorAccepted() {
        val cb = CallbackParser.extract("[#재연락 2026-05-01 14:30] 오후 통화")
        assertNotNull(cb)
        assertEquals("2026-05-01T14:30", cb!!.callbackAtIso)
    }

    @Test
    fun unparsableTime_keepsMarkerAsUndated() {
        // 시각을 전혀 해석 못 해도 재연락 자체는 "시각 미정" 으로 등록
        val cb = CallbackParser.extract("[#재연락 내일쯤] 다시 연락 요청")
        assertNotNull(cb)
        assertNull(cb!!.callbackAtIso)
        assertNull(cb.callbackAtMs)
        assertEquals("다시 연락 요청", cb.note)
    }
}
