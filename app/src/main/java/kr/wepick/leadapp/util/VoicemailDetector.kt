package kr.wepick.leadapp.util

/**
 * 통화 녹음 전사문이 실제 대화가 아니라 통신사 음성사서함/자동응답 안내인지 감지.
 *
 * 상대가 받지 않아 소리샘으로 넘어간 발신도 OS는 정상 통화(duration>0)로 기록하고
 * 녹음 파일을 만들기 때문에 통화 시점에는 미응답과 구분이 불가능하다.
 * → STT 전사문이 나온 뒤 안내멘트 키워드로 후판정한다 (SttWorker 호출).
 */
object VoicemailDetector {

    /**
     * 통신사(SKT/KT/LGU+) 안내멘트 마커.
     * 공백 제거 후 비교 — STT 의 띄어쓰기 편차를 흡수하기 위함.
     */
    private val MARKERS = listOf(
        "음성사서함",
        "소리샘",
        "삐소리",
        "통화료가부과",
        "전원이꺼져",
        "전화를받을수없",
        "연결이되지않아",
        "다시걸어주시",
        "잠시후다시걸",
        "통화중이오니",
    )

    /** 안내멘트는 항상 녹음 초반에 나옴 — 앞부분만 검사해서 실제 대화 중 우연 언급 오탐 방지. */
    private const val HEAD_LENGTH = 300

    fun isVoicemail(transcript: String): Boolean {
        if (transcript.isBlank()) return false
        val head = transcript.take(HEAD_LENGTH).replace(" ", "")
        return MARKERS.any { head.contains(it) }
    }
}
