package kr.wepick.leadapp.data.db

import androidx.room.Entity
import androidx.room.PrimaryKey

/** 잠재고객 */
@Entity(tableName = "leads")
data class Lead(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    /** 이름 */
    val name: String,

    /** 전화번호 (하이픈 없이 숫자만 저장 권장, 검색 시 정규화) */
    val phone: String,

    /** 추가 정보 (채널, 유입 경로, 메모 등) */
    val memo: String? = null,

    /** 태그 (쉼표 구분) */
    val tags: String? = null,

    /** 상태 — 신규 / 상담중 / 완료 / 거절 / 보류 */
    val status: String = "신규",

    /** 등록일 (epoch millis) */
    val createdAt: Long = System.currentTimeMillis(),

    /** 마지막 수정일 */
    val updatedAt: Long = System.currentTimeMillis(),
)
