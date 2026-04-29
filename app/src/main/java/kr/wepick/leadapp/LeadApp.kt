package kr.wepick.leadapp

import android.app.Application
import android.net.Uri
import android.util.Log
import androidx.room.Room
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit
import kr.wepick.leadapp.data.db.AppDatabase
import kr.wepick.leadapp.data.repo.LeadRepository
import kr.wepick.leadapp.service.CallFolderScanWorker
import kr.wepick.leadapp.service.CallbackNotifier
import kr.wepick.leadapp.service.RecordingsObserver
import kr.wepick.leadapp.ui.screens.KEY_RECORDINGS_URI
import kr.wepick.leadapp.util.appPreferences

class LeadApp : Application() {

    lateinit var database: AppDatabase
        private set

    lateinit var leadRepo: LeadRepository
        private set

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var observer: RecordingsObserver? = null

    override fun onCreate() {
        super.onCreate()
        instance = this

        database = Room.databaseBuilder(
            applicationContext,
            AppDatabase::class.java,
            "lead-app.db"
        )
            // 명시적 마이그레이션 우선 — 기존 사용자의 리드/통화기록 보존.
            .addMigrations(
                AppDatabase.MIGRATION_1_2,
                AppDatabase.MIGRATION_2_3,
                AppDatabase.MIGRATION_3_4,
            )
            // 미리 정의되지 않은 다운그레이드/스키마 불일치 안전망 (베타 단계).
            .fallbackToDestructiveMigration(true)
            .build()

        leadRepo = LeadRepository(database.leadDao(), database.callRecordDao())

        schedulePeriodicScan()
        bindRecordingsObserver()
        CallbackNotifier.ensureChannel(this)
        rescheduleFutureCallbacks()
    }

    /**
     * 부팅/앱 재시작 시점에 미래 callbackAt 이 있는 레코드 중 알림 예약 안 된 것을 일괄 재예약.
     * AlarmManager 는 부팅 시 모든 알람을 잃기 때문에 매 앱 시작에서 채워준다.
     */
    private fun rescheduleFutureCallbacks() {
        appScope.launch {
            runCatching {
                val pending = leadRepo.unscheduledFutureCallbacks()
                for (c in pending) {
                    val cb = c.callbackAt ?: continue
                    val leadName = c.leadId?.let { leadRepo.getLead(it)?.name }.orEmpty()
                    CallbackNotifier.scheduleFor(applicationContext, c.id, cb, leadName, c.phone)
                    leadRepo.markCallbackScheduled(c.id)
                }
            }.onFailure { Log.w("LeadApp", "콜백 재예약 실패: ${it.message}") }
        }
    }

    private fun schedulePeriodicScan() {
        val req = PeriodicWorkRequestBuilder<CallFolderScanWorker>(15, TimeUnit.MINUTES).build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            CallFolderScanWorker.SCAN_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            req,
        )
    }

    /**
     * DataStore 의 KEY_RECORDINGS_URI 변화를 구독해 RecordingsObserver 를 자동
     * (재)등록한다. 사용자가 폴더를 처음 선택하거나 다시 선택하면 즉시 반영.
     * 이 옵저버 덕에 통화 종료 후 ~10초 내 자동 처리 — 15분 주기 대기 불필요.
     */
    private fun bindRecordingsObserver() {
        appScope.launch {
            applicationContext.appPreferences.data
                .map { it[KEY_RECORDINGS_URI] }
                .distinctUntilChanged()
                .collect { uriStr ->
                    observer?.stop()
                    observer = null
                    if (!uriStr.isNullOrBlank()) {
                        runCatching { Uri.parse(uriStr) }
                            .onSuccess { uri ->
                                val obs = RecordingsObserver(applicationContext, uri)
                                obs.start()
                                observer = obs
                            }
                            .onFailure { Log.w("LeadApp", "녹음 폴더 URI 파싱 실패: ${it.message}") }
                    }
                }
        }
    }

    companion object {
        @Volatile
        lateinit var instance: LeadApp
            private set
    }
}
