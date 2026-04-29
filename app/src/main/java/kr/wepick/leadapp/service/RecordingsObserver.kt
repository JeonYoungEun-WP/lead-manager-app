package kr.wepick.leadapp.service

import android.content.Context
import android.database.ContentObserver
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * 사용자가 SAF 로 지정한 녹음 폴더(Tree URI) 의 변화를 ContentObserver 로 감시.
 *
 * 동작:
 * - 폴더 또는 그 자식 파일에 onChange() 가 호출되면 (=새 파일 추가, 파일 변경 등)
 *   `CallFolderScanWorker` 를 디바운스 후 즉시 트리거.
 * - 디바운스: 짧은 시간에 여러 onChange 가 와도 1번만 큐잉 (m4a 파일 쓰기는
 *   여러 번의 write/flush 를 만든다).
 * - 주기 워커(15분) 와 별개로 동작 — 통화가 끝나자마자 거의 실시간 처리.
 *
 * 주의:
 * - SAF Tree URI 에 대한 ContentObserver 는 Android 가 모든 파일시스템 변화를
 *   100% 알려주진 않음 (특히 외부 앱이 파일 추가 시). 그래서 주기 워커를
 *   백업 메커니즘으로 유지.
 * - LeadApp.onCreate() 에서 1회 register, 앱 프로세스 살아있는 동안 동작.
 *   백그라운드에서 OS 가 프로세스를 죽이면 다시 살아날 때 onCreate 가 재실행.
 */
class RecordingsObserver(
    private val ctx: Context,
    private val treeUri: Uri,
) : ContentObserver(Handler(Looper.getMainLooper())) {

    private val handler = Handler(Looper.getMainLooper())
    @Volatile private var pendingTrigger: Runnable? = null

    fun start() {
        runCatching {
            ctx.contentResolver.registerContentObserver(treeUri, true, this)
            Log.i(TAG, "녹음 폴더 감시 시작: $treeUri")
        }.onFailure {
            Log.w(TAG, "ContentObserver 등록 실패: ${it.message}")
        }
    }

    fun stop() {
        runCatching {
            ctx.contentResolver.unregisterContentObserver(this)
        }
    }

    override fun onChange(selfChange: Boolean, uri: Uri?) {
        // 디바운스: 마지막 변화 후 DEBOUNCE_MS 동안 추가 변화가 없으면 워커 트리거.
        pendingTrigger?.let { handler.removeCallbacks(it) }
        val r = Runnable { triggerScan() }
        pendingTrigger = r
        handler.postDelayed(r, DEBOUNCE_MS)
    }

    private fun triggerScan() {
        pendingTrigger = null
        Log.i(TAG, "폴더 변화 감지 → CallFolderScanWorker 즉시 트리거")
        val req = OneTimeWorkRequestBuilder<CallFolderScanWorker>().build()
        WorkManager.getInstance(ctx).enqueueUniqueWork(
            CallFolderScanWorker.SCAN_WORK_NAME + "-immediate",
            ExistingWorkPolicy.KEEP, // 이미 큐된 즉시 스캔이 있으면 그쪽이 처리
            req,
        )
    }

    companion object {
        private const val TAG = "RecordingsObserver"
        /** 녹음 파일 쓰기 완료 + Samsung OS 의 파일명 rename 까지 충분히 기다리는 시간. */
        private val DEBOUNCE_MS = TimeUnit.SECONDS.toMillis(8)
    }
}
