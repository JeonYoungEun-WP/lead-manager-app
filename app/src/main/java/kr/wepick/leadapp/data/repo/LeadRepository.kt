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

    suspend fun setCallResult(id: Long, transcript: String, summary: String) =
        callRecordDao.setResult(id, transcript, summary)

    suspend fun markCallFailed(id: Long, error: String) =
        callRecordDao.updateStatus(id, "FAILED", error)

    suspend fun markCallProcessing(id: Long) =
        callRecordDao.updateStatus(id, "PROCESSING")

    suspend fun pendingCalls(): List<CallRecord> = callRecordDao.pendingForProcessing()
}
