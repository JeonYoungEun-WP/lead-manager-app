package kr.wepick.leadapp.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface CallRecordDao {

    @Query("SELECT * FROM call_records ORDER BY startedAt DESC")
    fun observeAll(): Flow<List<CallRecord>>

    @Query("SELECT * FROM call_records WHERE leadId = :leadId ORDER BY startedAt DESC")
    fun observeByLead(leadId: Long): Flow<List<CallRecord>>

    @Query("SELECT * FROM call_records WHERE id = :id")
    suspend fun findById(id: Long): CallRecord?

    @Query("SELECT * FROM call_records WHERE fileUri = :fileUri LIMIT 1")
    suspend fun findByFileUri(fileUri: String): CallRecord?

    @Query("SELECT * FROM call_records WHERE status = 'PENDING' OR status = 'FAILED' ORDER BY startedAt DESC LIMIT :limit")
    suspend fun pendingForProcessing(limit: Int = 5): List<CallRecord>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(record: CallRecord): Long

    @Update
    suspend fun update(record: CallRecord)

    @Query("UPDATE call_records SET status = :status, errorMessage = :err WHERE id = :id")
    suspend fun updateStatus(id: Long, status: String, err: String? = null)

    /**
     * 이전 워커가 마무리하지 못하고 죽은 PROCESSING 레코드를 PENDING 으로 되돌린다.
     * SttWorker 가 UNIQUE work (APPEND_OR_REPLACE) 로 등록되므로 동시 실행은 없고,
     * 새 워커 시작 시점에 PROCESSING 이 남아있다면 이전 워커가 죽은 것이다.
     * @return 리셋된 행 수
     */
    @Query("UPDATE call_records SET status = 'PENDING' WHERE status = 'PROCESSING'")
    suspend fun resetProcessingToPending(): Int

    @Query("UPDATE call_records SET transcript = :transcript, summary = :summary, status = 'DONE' WHERE id = :id")
    suspend fun setResult(id: Long, transcript: String, summary: String)

    @Query("UPDATE call_records SET uploadStatus = :status, uploadError = :err WHERE id = :id")
    suspend fun updateUploadState(id: Long, status: String, err: String? = null)

    @Query(
        "SELECT * FROM call_records WHERE status = 'AWAITING_FILE' " +
        "AND startedAt BETWEEN :lo AND :hi " +
        "ORDER BY ABS(startedAt - :ts) ASC LIMIT 1"
    )
    suspend fun findAwaitingFileNear(ts: Long, lo: Long, hi: Long): CallRecord?

    @Query("UPDATE call_records SET fileUri = :fileUri, status = 'PENDING' WHERE id = :id")
    suspend fun attachFile(id: Long, fileUri: String)

    /**
     * 발신 stub (AWAITING_FILE/RECORDED) 을 미응답으로 확정 변환.
     * OutgoingCallVerifyWorker 가 발신 후 60초 검증으로 호출.
     */
    @Query(
        "UPDATE call_records SET fileUri = :fileUri, status = 'NO_TRANSCRIPT', " +
        "callType = 'NO_ANSWER', direction = 'OUTGOING', durationSec = :durationSec " +
        "WHERE id = :id"
    )
    suspend fun convertStubToNoAnswer(id: Long, fileUri: String, durationSec: Int)

    @Query("UPDATE call_records SET durationSec = :durationSec WHERE id = :id")
    suspend fun updateDuration(id: Long, durationSec: Int)

    /**
     * 가장 최근 AWAITING_FILE 스텁 — 통화 종료 직후 검증 워커가 사용.
     * since 이후 만들어진 stub 만 봄 (오래된 것은 이미 다른 경로로 처리됨).
     */
    @Query(
        "SELECT * FROM call_records WHERE status = 'AWAITING_FILE' AND startedAt >= :since " +
        "ORDER BY startedAt DESC LIMIT 1"
    )
    suspend fun findMostRecentAwaitingStub(since: Long): CallRecord?

    /** 재연락 약속 시각 + 태그 업데이트 (Phase 1). */
    @Query("UPDATE call_records SET callbackAt = :callbackAt, tags = :tags WHERE id = :id")
    suspend fun setCallbackInfo(id: Long, callbackAt: Long?, tags: String?)

    /** 로컬 알림 예약 플래그 갱신 (중복 알림 방지용). */
    @Query("UPDATE call_records SET notifyScheduled = :scheduled WHERE id = :id")
    suspend fun setNotifyScheduled(id: Long, scheduled: Boolean)

    /**
     * 미래 시점 callbackAt 이 있고 아직 알림 예약 안 된 레코드 — 부팅 직후 / 마이그레이션 직후
     * 일괄 재스케줄링용.
     */
    @Query(
        "SELECT * FROM call_records WHERE callbackAt IS NOT NULL " +
        "AND callbackAt > :now AND notifyScheduled = 0"
    )
    suspend fun unscheduledFutureCallbacks(now: Long): List<CallRecord>
}
