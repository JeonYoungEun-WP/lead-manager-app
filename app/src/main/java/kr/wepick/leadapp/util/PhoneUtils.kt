package kr.wepick.leadapp.util

/**
 * 전화번호 정규화 및 추출 유틸.
 * Samsung 녹음 파일명에서 번호 추출, 사용자 입력 번호 포맷 통일.
 */
object PhoneUtils {

    private val PHONE_REGEX = Regex("""(?:\+?82[-. ]?)?0?1[016789][-. ]?\d{3,4}[-. ]?\d{4}""")

    /** 하이픈/공백 제거하고 숫자만 남김 */
    fun normalize(raw: String): String = raw.replace(Regex("[^0-9]"), "")

    /** "01012345678" → "010-1234-5678" 형태로 포맷 (길이 기반) */
    fun format(phone: String): String {
        val digits = normalize(phone)
        return when (digits.length) {
            10 -> "${digits.substring(0, 3)}-${digits.substring(3, 6)}-${digits.substring(6)}"
            11 -> "${digits.substring(0, 3)}-${digits.substring(3, 7)}-${digits.substring(7)}"
            else -> phone
        }
    }

    /** Samsung 녹음 파일명에서 전화번호 추출. 못 찾으면 null. */
    fun extractFromFilename(filename: String): String? {
        val match = PHONE_REGEX.find(filename) ?: return null
        return normalize(match.value)
    }

    /** 두 번호가 동일인지 비교 (국가코드 차이·포맷 차이 무시) */
    fun sameNumber(a: String, b: String): Boolean {
        val na = normalize(a).removePrefix("82").let { if (it.startsWith("1")) "0$it" else it }
        val nb = normalize(b).removePrefix("82").let { if (it.startsWith("1")) "0$it" else it }
        return na == nb
    }
}
