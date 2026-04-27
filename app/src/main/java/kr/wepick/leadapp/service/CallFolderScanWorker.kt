package kr.wepick.leadapp.service

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.documentfile.provider.DocumentFile
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.flow.first
import kr.wepick.leadapp.LeadApp
import kr.wepick.leadapp.data.db.CallRecord
import kr.wepick.leadapp.ui.screens.KEY_RECORDINGS_URI
import kr.wepick.leadapp.util.CallLogResolver
import kr.wepick.leadapp.util.PhoneUtils
import kr.wepick.leadapp.util.appPreferences

/**
 * 주기적으로 지정된 녹음 폴더를 스캔하여 새 파일을 DB에 등록.
 * 리드 DB에 번호가 매칭되는 파일만 CallRecord 로 등록한다.
 * 매칭 안 되는 파일(가족 통화 등)은 건드리지 않는다.
 */
class CallFolderScanWorker(
    ctx: Context,
    params: WorkerParameters,
) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val repo = LeadApp.instance.leadRepo

        // 좀비 복구: 이전 SttWorker 가 마무리하지 못하고 죽으면서 PROCESSING 으로 박힌
        // 레코드를 PENDING 으로 되돌린다. 이 단계가 없으면 PROCESSING 좀비는 영원히
        // 재처리되지 않는다 (pendingCalls() 가 PENDING/FAILED 만 보기 때문).
        val recovered = repo.resetStaleProcessing()
        if (recovered > 0) {
            Log.w(TAG, "좀비 PROCESSING 레코드 ${recovered}건을 PENDING 으로 복구했습니다.")
        }

        val prefs = applicationContext.appPreferences.data.first()
        val uriStr = prefs[KEY_RECORDINGS_URI]
        val folder = uriStr?.let {
            DocumentFile.fromTreeUri(applicationContext, Uri.parse(it))
        }

        var added = 0
        if (folder != null) {
            val files = folder.listFiles().filter {
                it.isFile && (it.name?.endsWith(".m4a", true) == true ||
                              it.name?.endsWith(".amr", true) == true ||
                              it.name?.endsWith(".3gp", true) == true)
            }

            for (file in files) {
                val name = file.name ?: continue
                val fileTs = PhoneUtils.extractTimestampFromFilename(name) ?: file.lastModified()

                // 이미 이 파일이 붙은 기록이 있으면 스킵 (재스캔 중복 방지)
                if (repo.hasCallForFileUri(file.uri.toString())) continue

                // 0) 앱에서 발신한 통화 스텁 매칭 (leadId 이미 알고 있음 — 가장 정확)
                val stub = repo.findAwaitingFileNear(fileTs)
                if (stub != null) {
                    repo.attachFileToStub(stub.id, file.uri.toString())
                    added++
                    continue
                }

                // 1) 파일명에서 번호 직접 추출 (연락처 미저장 번호)
                // 2) 없으면 CallLog 로 타임스탬프 → 번호 매핑 (앱 외부에서 건 전화)
                val phoneRaw = PhoneUtils.extractFromFilename(name)
                    ?: CallLogResolver.findPhoneByTimestamp(applicationContext, fileTs)
                        ?.let { PhoneUtils.normalize(it) }
                    ?: continue

                val lead = repo.findLeadByPhone(phoneRaw) ?: continue

                val record = CallRecord(
                    leadId = lead.id,
                    phone = phoneRaw,
                    fileUri = file.uri.toString(),
                    startedAt = fileTs,
                    direction = "UNKNOWN",
                    status = "PENDING",
                )
                val id = repo.saveCallIfNew(record)
                if (id != null) added++
            }
        }

        // 새로 추가됐거나, 기존 PENDING/FAILED (방금 좀비에서 복구된 것 포함) 가 있으면 STT 트리거
        if (added > 0 || repo.pendingCalls().isNotEmpty()) {
            val sttWork = OneTimeWorkRequestBuilder<SttWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .build()
            WorkManager.getInstance(applicationContext).enqueueUniqueWork(
                STT_WORK_NAME,
                ExistingWorkPolicy.APPEND_OR_REPLACE,
                sttWork,
            )
        }
        return Result.success()
    }

    companion object {
        const val SCAN_WORK_NAME = "call-folder-scan"
        const val STT_WORK_NAME = "stt-process"
        private const val TAG = "CallFolderScanWorker"
    }
}
