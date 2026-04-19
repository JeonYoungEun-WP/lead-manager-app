package kr.wepick.leadapp.data.db

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface LeadDao {

    @Query("SELECT * FROM leads ORDER BY updatedAt DESC")
    fun observeAll(): Flow<List<Lead>>

    @Query("SELECT * FROM leads WHERE id = :id")
    suspend fun findById(id: Long): Lead?

    @Query("SELECT * FROM leads WHERE phone = :phone LIMIT 1")
    suspend fun findByPhone(phone: String): Lead?

    @Query("""
        SELECT * FROM leads
        WHERE name LIKE '%' || :query || '%'
           OR phone LIKE '%' || :query || '%'
           OR memo LIKE '%' || :query || '%'
        ORDER BY updatedAt DESC
    """)
    fun search(query: String): Flow<List<Lead>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(lead: Lead): Long

    @Update
    suspend fun update(lead: Lead)

    @Delete
    suspend fun delete(lead: Lead)
}
