package kr.wepick.leadapp.data.db

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [Lead::class, CallRecord::class],
    version = 2,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun leadDao(): LeadDao
    abstract fun callRecordDao(): CallRecordDao

    companion object {
        /**
         * v1 → v2: call_records 에 uploadStatus / uploadError 컬럼 추가.
         * - 기존 행은 uploadStatus='NONE', uploadError=NULL 로 채움.
         * - leads / call_records 데이터는 그대로 보존.
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
    }
}
