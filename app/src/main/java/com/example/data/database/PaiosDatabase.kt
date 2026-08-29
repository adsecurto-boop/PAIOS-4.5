package com.example.data.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.example.data.dao.*
import com.example.data.model.*

@Database(
    entities = [
        TaskEntity::class,
        ActivityLogEntity::class,
        TimelineEntryEntity::class,
        QuickCaptureEntity::class,
        MorningCheckInEntity::class,
        EveningReviewEntity::class,
        JournalEntryEntity::class,
        StudyCardEntity::class,
        AIMessageEntity::class,
        UserSettingsEntity::class,
        MedicationEntity::class,
        DoseEventEntity::class,
        RefillInventoryEntity::class,
        VitalSignEntity::class,
        DoctorEntity::class,
        AppointmentEntity::class
    ],
    version = 2,
    exportSchema = false
)
abstract class PaiosDatabase : RoomDatabase() {
    abstract fun taskDao(): TaskDao
    abstract fun activityDao(): ActivityDao
    abstract fun timelineDao(): TimelineDao
    abstract fun quickCaptureDao(): QuickCaptureDao
    abstract fun checkInReviewDao(): CheckInReviewDao
    abstract fun journalDao(): JournalDao
    abstract fun studyDao(): StudyDao
    abstract fun aiChatDao(): AiChatDao
    abstract fun settingsDao(): SettingsDao
    abstract fun healthDao(): HealthDao


    companion object {
        @Volatile
        private var INSTANCE: PaiosDatabase? = null

        fun getDatabase(context: Context): PaiosDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    PaiosDatabase::class.java,
                    "paios_database"
                )
                    .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
