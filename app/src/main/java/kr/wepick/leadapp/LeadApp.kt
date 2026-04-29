package kr.wepick.leadapp

import android.app.Application
import androidx.room.Room
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit
import kr.wepick.leadapp.data.db.AppDatabase
import kr.wepick.leadapp.data.repo.LeadRepository
import kr.wepick.leadapp.service.CallFolderScanWorker

class LeadApp : Application() {

    lateinit var database: AppDatabase
        private set

    lateinit var leadRepo: LeadRepository
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this

        database = Room.databaseBuilder(
            applicationContext,
            AppDatabase::class.java,
            "lead-app.db"
        )
            // 명시적 마이그레이션 우선 — 기존 사용자의 리드/통화기록 보존.
            .addMigrations(AppDatabase.MIGRATION_1_2, AppDatabase.MIGRATION_2_3)
            // 미리 정의되지 않은 다운그레이드/스키마 불일치 안전망 (베타 단계).
            .fallbackToDestructiveMigration(true)
            .build()

        leadRepo = LeadRepository(database.leadDao(), database.callRecordDao())

        schedulePeriodicScan()
    }

    private fun schedulePeriodicScan() {
        val req = PeriodicWorkRequestBuilder<CallFolderScanWorker>(15, TimeUnit.MINUTES).build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            CallFolderScanWorker.SCAN_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            req,
        )
    }

    companion object {
        @Volatile
        lateinit var instance: LeadApp
            private set
    }
}
