package kr.wepick.leadapp

import android.app.Application
import androidx.room.Room
import kr.wepick.leadapp.data.db.AppDatabase
import kr.wepick.leadapp.data.repo.LeadRepository

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
            .fallbackToDestructiveMigration(true)
            .build()

        leadRepo = LeadRepository(database.leadDao(), database.callRecordDao())
    }

    companion object {
        @Volatile
        lateinit var instance: LeadApp
            private set
    }
}
