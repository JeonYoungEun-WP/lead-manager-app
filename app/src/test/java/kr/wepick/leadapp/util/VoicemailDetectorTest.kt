package kr.wepick.leadapp.util

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VoicemailDetectorTest {

    @Test
    fun carrierGreetings_detected() {
        assertTrue(
            VoicemailDetector.isVoicemail(
                "고객이 전화를 받지 않아 음성사서함으로 연결되며 삐 소리 후 통화료가 부과됩니다"
            )
        )
        assertTrue(VoicemailDetector.isVoicemail("연결이 되지 않아 소리샘으로 연결됩니다"))
        assertTrue(VoicemailDetector.isVoicemail("전원이 꺼져 있어 음성 사서함으로 연결됩니다"))
        assertTrue(VoicemailDetector.isVoicemail("지금은 통화 중이오니 잠시 후 다시 걸어 주시기 바랍니다"))
    }

    @Test
    fun sttSpacingVariants_detected() {
        // STT 가 띄어쓰기를 다르게 뱉어도 공백 제거 비교로 잡혀야 함
        assertTrue(VoicemailDetector.isVoicemail("음 성 사 서 함 으로 연결 됩니다"))
        assertTrue(VoicemailDetector.isVoicemail("삐 소리 후 녹음하세요"))
    }

    @Test
    fun normalConversation_notDetected() {
        assertFalse(
            VoicemailDetector.isVoicemail(
                "안녕하세요 고객님, 영어 수업 관련해서 연락드렸습니다. 가격은 월 30만원입니다."
            )
        )
    }

    @Test
    fun blank_notDetected() {
        assertFalse(VoicemailDetector.isVoicemail(""))
        assertFalse(VoicemailDetector.isVoicemail("   "))
    }

    @Test
    fun markerBeyondHead_ignored() {
        // 안내멘트는 녹음 초반에만 나옴 — 앞 300자 밖의 키워드는 무시
        val long = "가".repeat(310) + " 음성사서함"
        assertFalse(VoicemailDetector.isVoicemail(long))
    }

    @Test
    fun mentionInLaterConversation_notFalsePositive() {
        // 실제 대화 후반에 "음성사서함" 이 언급돼도 오탐하지 않음
        val talk = "오늘 상담 내용 정리해서 보내드릴게요. ".repeat(20) + "음성사서함에 남겨주세요"
        assertFalse(VoicemailDetector.isVoicemail(talk))
    }
}
