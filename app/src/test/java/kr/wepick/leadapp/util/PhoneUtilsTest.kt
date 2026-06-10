package kr.wepick.leadapp.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

class PhoneUtilsTest {

    // ── normalize ─────────────────────────────────────────

    @Test
    fun normalize_removesHyphensAndSpaces() {
        assertEquals("01012345678", PhoneUtils.normalize("010-1234-5678"))
        assertEquals("01012345678", PhoneUtils.normalize("010 1234 5678"))
    }

    @Test
    fun normalize_keepsCountryCodeDigits() {
        assertEquals("821012345678", PhoneUtils.normalize("+82 10-1234-5678"))
    }

    @Test
    fun normalize_emptyAndGarbage() {
        assertEquals("", PhoneUtils.normalize(""))
        assertEquals("", PhoneUtils.normalize("abc-def"))
    }

    // ── format ────────────────────────────────────────────

    @Test
    fun format_elevenDigits() {
        assertEquals("010-1234-5678", PhoneUtils.format("01012345678"))
    }

    @Test
    fun format_tenDigits() {
        assertEquals("031-609-9799", PhoneUtils.format("0316099799"))
    }

    @Test
    fun format_otherLengthReturnsOriginalInput() {
        assertEquals("12345", PhoneUtils.format("12345"))
        // 국가번호 포함 12자리 — 포맷 불가 시 원본 유지
        assertEquals("+82 10-1234-5678", PhoneUtils.format("+82 10-1234-5678"))
    }

    // ── extractFromFilename ───────────────────────────────

    @Test
    fun extract_fromSamsungFilename() {
        assertEquals(
            "01012345678",
            PhoneUtils.extractFromFilename("통화 녹음 010-1234-5678_240419_213045.m4a"),
        )
    }

    @Test
    fun extract_withCountryCode() {
        assertEquals(
            "821012345678",
            PhoneUtils.extractFromFilename("통화 녹음 +82-10-1234-5678_240419_213045.m4a"),
        )
    }

    @Test
    fun extract_nameOnlyFilenameReturnsNull() {
        // 연락처에 저장된 상대는 파일명에 이름만 들어감 — 타임스탬프 숫자를 번호로 오인하면 안 됨
        assertNull(PhoneUtils.extractFromFilename("통화 녹음 김하준_240419_213045.m4a"))
    }

    @Test
    fun extract_noNumberReturnsNull() {
        assertNull(PhoneUtils.extractFromFilename("memo.txt"))
    }

    // ── extractTimestampFromFilename ──────────────────────

    @Test
    fun timestamp_parsesYYMMDD_HHMMSS() {
        val ms = PhoneUtils.extractTimestampFromFilename("통화 녹음 김하준_240419_213045.m4a")
        val expected = Calendar.getInstance(TimeZone.getDefault()).apply {
            clear()
            set(2024, Calendar.APRIL, 19, 21, 30, 45)
        }.timeInMillis
        assertEquals(expected, ms)
    }

    @Test
    fun timestamp_missingReturnsNull() {
        assertNull(PhoneUtils.extractTimestampFromFilename("통화 녹음 김하준.m4a"))
    }

    // ── sameNumber ────────────────────────────────────────

    @Test
    fun sameNumber_countryCodeAndFormatIgnored() {
        assertTrue(PhoneUtils.sameNumber("+82 10-1234-5678", "01012345678"))
        assertTrue(PhoneUtils.sameNumber("010 1234 5678", "010-1234-5678"))
    }

    @Test
    fun sameNumber_differentNumbers() {
        assertFalse(PhoneUtils.sameNumber("01012345678", "01087654321"))
    }
}
