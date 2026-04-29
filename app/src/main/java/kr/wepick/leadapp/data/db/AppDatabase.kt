package kr.wepick.leadapp.data.db

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [Lead::class, CallRecord::class],
    version = 4,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun leadDao(): LeadDao
    abstract fun callRecordDao(): CallRecordDao

    companion object {
        /**
         * v1 → v2: call_records 에 uploadStatus / uploadError 컬럼 추가.
         * - 기존 행은 uploadStatus='NONE', uploadError=NULL 로 채움.
         */
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "ALTER TABLE call_records ADD COLUMN uploadStatus TEXT NOT NULL DEFAULT 'NONE'"
                )
                db.execSQL(
                    "ALTER TABLE call_records ADD COLUMN uploadError TEXT"
                )
            }
        }

        /**
         * v2 → v3: call_records 에 callType 컬럼 추가.
         * - 기존 행은 callType='RECORDED' 로 채움 (모두 정상 녹음 통화였음).
         */
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "ALTER TABLE call_records ADD COLUMN callType TEXT NOT NULL DEFAULT 'RECORDED'"
                )
            }
        }

        /**
         * v3 → v4: call_records 에 재연락 알림 관련 컬럼 추가.
         * - callbackAt: 재연락 약속 시각 (ms, nullable)
         * - tags: 콤마 구분 태그 (nullable)
         * - notifyScheduled: 로컬 알림 예약 플래그 (중복 방지용)
         */
        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE call_records ADD COLUMN callbackAt INTEGER")
                db.execSQL("ALTER TABLE call_records ADD COLUMN tags TEXT")
                db.execSQL(
                    "ALTER TABLE call_records ADD COLUMN notifyScheduled INTEGER NOT NULL DEFAULT 0"
                )
            }
        }
    }
}
