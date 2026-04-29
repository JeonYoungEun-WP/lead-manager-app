package kr.wepick.leadapp.data.db

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [Lead::class, CallRecord::class],
    version = 3,
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
    }
}
