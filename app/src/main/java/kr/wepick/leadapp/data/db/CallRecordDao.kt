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

    @Query(
        "SELECT * FROM call_records WHERE status = 'AWAITING_FILE' " +
        "AND startedAt BETWEEN :lo AND :hi " +
        "ORDER BY ABS(startedAt - :ts) ASC LIMIT 1"
    )
    suspend fun findAwaitingFileNear(ts: Long, lo: Long, hi: Long): CallRecord?

    @Query("UPDATE call_records SET fileUri = :fileUri, status = 'PENDING' WHERE id = :id")
    suspend fun attachFile(id: Long, fileUri: String)
}
