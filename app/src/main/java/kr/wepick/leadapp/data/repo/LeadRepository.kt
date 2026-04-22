package kr.wepick.leadapp.data.repo

import kotlinx.coroutines.flow.Flow
import kr.wepick.leadapp.data.db.CallRecord
import kr.wepick.leadapp.data.db.CallRecordDao
import kr.wepick.leadapp.data.db.Lead
import kr.wepick.leadapp.data.db.LeadDao
import kr.wepick.leadapp.util.PhoneUtils

class LeadRepository(
    private val leadDao: LeadDao,
    private val callRecordDao: CallRecordDao,
) {

    fun observeLeads(): Flow<List<Lead>> = leadDao.observeAll()
    fun searchLeads(query: String): Flow<List<Lead>> = leadDao.search(query)
    suspend fun getLead(id: Long): Lead? = leadDao.findById(id)
    suspend fun findLeadByPhone(phone: String): Lead? =
        leadDao.findByPhone(PhoneUtils.normalize(phone))

    suspend fun saveLead(lead: Lead): Long {
        val normalized = lead.copy(
            phone = PhoneUtils.normalize(lead.phone),
            updatedAt = System.currentTimeMillis(),
        )
        return if (normalized.id == 0L) leadDao.insert(normalized)
        else { leadDao.update(normalized); normalized.id }
    }

    suspend fun deleteLead(lead: Lead) = leadDao.delete(lead)

    fun observeCalls(): Flow<List<CallRecord>> = callRecordDao.observeAll()
    fun observeCallsByLead(leadId: Long): Flow<List<CallRecord>> =
        callRecordDao.observeByLead(leadId)

    suspend fun getCall(id: Long): CallRecord? = callRecordDao.findById(id)

    /** 파일명에서 추출한 번호로 기존 레코드 확인 후 저장 (중복 방지) */
    suspend fun saveCallIfNew(record: CallRecord): Long? {
        if (callRecordDao.findByFileUri(record.fileUri) != null) return null
        return callRecordDao.insert(record)
    }

    suspend fun hasCallForFileUri(fileUri: String): Boolean =
        callRecordDao.findByFileUri(fileUri) != null

    suspend fun setCallResult(id: Long, transcript: String, summary: String) =
        callRecordDao.setResult(id, transcript, summary)

    suspend fun markCallFailed(id: Long, error: String) =
        callRecordDao.updateStatus(id, "FAILED", error)

    suspend fun markCallProcessing(id: Long) =
        callRecordDao.updateStatus(id, "PROCESSING")

    suspend fun markUploadOk(id: Long) =
        callRecordDao.updateUploadState(id, "OK", null)

    suspend fun markUploadFailed(id: Long, err: String) =
        callRecordDao.updateUploadState(id, "FAILED", err)

    suspend fun pendingCalls(): List<CallRecord> = callRecordDao.pendingForProcessing()

    /** 앱에서 리드에게 발신 시 호출. 나중에 녹음 파일이 생기면 이 스텁에 붙는다. */
    suspend fun startOutgoingCall(leadId: Long, phone: String): Long {
        val stub = CallRecord(
            leadId = leadId,
            phone = PhoneUtils.normalize(phone),
            fileUri = "intent:${java.util.UUID.randomUUID()}",
            startedAt = System.currentTimeMillis(),
            direction = "OUTGOING",
            status = "AWAITING_FILE",
        )
        return callRecordDao.insert(stub)
    }

    /** 스캐너가 녹음 파일을 스텁에 첨부 (status: AWAITING_FILE → PENDING). */
    suspend fun attachFileToStub(id: Long, fileUri: String) =
        callRecordDao.attachFile(id, fileUri)

    /** 파일 타임스탬프 근처의 AWAITING_FILE 스텁 찾기. 기본 창 ±30분. */
    suspend fun findAwaitingFileNear(
        fileTs: Long,
        pastWindowMs: Long = 60 * 60_000L,
        futureBufferMs: Long = 60_000L,
    ): CallRecord? = callRecordDao.findAwaitingFileNear(
        fileTs, fileTs - pastWindowMs, fileTs + futureBufferMs,
    )
}
