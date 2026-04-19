package kr.wepick.leadapp.data.db

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [Lead::class, CallRecord::class],
    version = 1,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun leadDao(): LeadDao
    abstract fun callRecordDao(): CallRecordDao
}
