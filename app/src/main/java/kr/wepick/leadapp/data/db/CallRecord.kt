package kr.wepick.leadapp.data.db

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

/** 통화 기록 + STT 전사문 + 요약 */
@Entity(
    tableName = "call_records",
    foreignKeys = [
        ForeignKey(
            entity = Lead::class,
            parentColumns = ["id"],
            childColumns = ["leadId"],
            onDelete = ForeignKey.SET_NULL,
        )
    ],
    indices = [Index("leadId"), Index("phone")],
)
data class CallRecord(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    /** 매칭된 리드 ID (매칭 안 되면 null) */
    val leadId: Long? = null,

    /** 전화번호 (원본 파일명에서 추출) */
    val phone: String,

    /** 녹음 파일 URI (SAF URI, content:// ...) */
    val fileUri: String,

    /** 녹음 시작 시간 (파일 생성 시간) */
    val startedAt: Long,

    /** 녹음 길이 (초, 파악되면) */
    val durationSec: Int? = null,

    /** 통화 방향 - INCOMING / OUTGOING / UNKNOWN */
    val direction: String = "UNKNOWN",

    /** STT 전사문 */
    val transcript: String? = null,

    /** 5줄 요약 */
    val summary: String? = null,

    /** 처리 상태 - PENDING / PROCESSING / DONE / FAILED */
    val status: String = "PENDING",

    /** 마지막 에러 메시지 (상태=FAILED일 때) */
    val errorMessage: String? = null,

    /** 어드민 업로드 상태 - NONE / OK / FAILED */
    val uploadStatus: String = "NONE",

    /** 업로드 실패 사유 (uploadStatus=FAILED) */
    val uploadError: String? = null,

    /**
     * 통화 유형 - RECORDED / NO_ANSWER / MISSED / REJECTED.
     *  - RECORDED:   녹음 + 전사 정상. 기본값.
     *  - NO_ANSWER:  발신했으나 상대 미응답 (CallLog OUTGOING + duration=0).
     *  - MISSED:     수신 부재중 (CallLog MISSED).
     *  - REJECTED:   수신 거절 (CallLog REJECTED).
     * 비-RECORDED 는 transcript/summary 가 없고 status=NO_TRANSCRIPT 로 박힌다.
     */
    val callType: String = "RECORDED",
)
