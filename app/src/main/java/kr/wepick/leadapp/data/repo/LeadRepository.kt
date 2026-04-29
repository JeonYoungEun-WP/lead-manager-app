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

    /**
     * 사용자(또는 SttWorker) 가 호출하는 단일 callId 업로드 재시도 진입점.
     * UploadRetryWorker 가 attempt 횟수 추적 + 백오프 자동 처리.
     */
    fun retryUpload(ctx: android.content.Context, callId: Long) {
        kr.wepick.leadapp.service.UploadRetryWorker.enqueueImmediate(ctx, callId)
    }

    suspend fun pendingCalls(): List<CallRecord> = callRecordDao.pendingForProcessing()

    /** 죽은 워커가 남긴 PROCESSING 좀비 레코드를 PENDING 으로 복구. */
    suspend fun resetStaleProcessing(): Int = callRecordDao.resetProcessingToPending()

    /** 재연락 정보 저장 (callbackAt 시각, tags). 알림 예약은 별도 호출. */
    suspend fun setCallbackInfo(id: Long, callbackAtMs: Long?, tags: String?) =
        callRecordDao.setCallbackInfo(id, callbackAtMs, tags)

    /** 알림 예약 플래그 ON (스케줄 시 호출). */
    suspend fun markCallbackScheduled(id: Long) =
        callRecordDao.setNotifyScheduled(id, true)

    /** 알림 발행 후 / 처리 완료 시 OFF — 같은 시각 중복 알림 방지 해제. */
    suspend fun markCallbackFired(id: Long) =
        callRecordDao.setNotifyScheduled(id, false)

    /** 부팅 후 일괄 재예약용 — 미래 시각이고 아직 알림 등록 안 된 콜백들. */
    suspend fun unscheduledFutureCallbacks(now: Long = System.currentTimeMillis()) =
        callRecordDao.unscheduledFutureCallbacks(now)

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

    /** 발신 stub 을 NO_ANSWER 로 확정 변환 (OutgoingCallVerifyWorker 가 호출). */
    suspend fun convertStubToNoAnswer(id: Long, fileUri: String, durationSec: Int) =
        callRecordDao.convertStubToNoAnswer(id, fileUri, durationSec)

    /** stub 의 durationSec 만 갱신 (통화 연결됐을 때 길이 정보 미리 채움용). */
    suspend fun updateStubDuration(id: Long, durationSec: Int) =
        callRecordDao.updateDuration(id, durationSec)

    /** 파일 타임스탬프 근처의 AWAITING_FILE 스텁 찾기. 기본 창 ±30분. */
    suspend fun findAwaitingFileNear(
        fileTs: Long,
        pastWindowMs: Long = 60 * 60_000L,
        futureBufferMs: Long = 60_000L,
    ): CallRecord? = callRecordDao.findAwaitingFileNear(
        fileTs, fileTs - pastWindowMs, fileTs + futureBufferMs,
    )
}
