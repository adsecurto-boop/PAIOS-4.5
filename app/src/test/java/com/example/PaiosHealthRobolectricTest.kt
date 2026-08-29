package com.example

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.example.data.database.PaiosDatabase
import com.example.data.model.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class PaiosHealthRobolectricTest {

    private lateinit var db: PaiosDatabase

    @Before
    fun createDb() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, PaiosDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun closeDb() {
        db.close()
    }

    @Test
    fun testMedicationCrud() = runBlocking {
        val healthDao = db.healthDao()

        val med = MedicationEntity(
            genericName = "Sertraline HCl",
            brandName = "Zoloft",
            dosageStrength = 50.0,
            dosageUnit = "mg",
            form = "tablet",
            instructions = "Take 1 in morning with food",
            scheduleTimes = "08:00",
            prescribingDoctor = "Dr Devendra Ratnani"
        )

        val id = healthDao.insertMedication(med)
        assertTrue(id > 0)

        val list = healthDao.getAllMedications().first()
        assertEquals(1, list.size)
        assertEquals("Sertraline HCl", list[0].genericName)
        assertEquals("Zoloft", list[0].brandName)

        healthDao.deleteMedicationById(id)
        val afterDelete = healthDao.getAllMedications().first()
        assertTrue(afterDelete.isEmpty())
    }

    @Test
    fun testDoseEventStatusUpdate() = runBlocking {
        val healthDao = db.healthDao()

        val dose = DoseEventEntity(
            medicationName = "Propranolol HCl SR",
            dosage = "40 mg",
            scheduledTime = "08:00",
            scheduledDateString = "2026-08-29",
            status = "SCHEDULED"
        )

        val id = healthDao.insertDoseEvent(dose)
        val inserted = healthDao.getAllDoseEvents().first()[0]
        assertEquals("SCHEDULED", inserted.status)

        // Mark as TAKEN
        val updated = inserted.copy(status = "TAKEN", actualTakenTimeMillis = System.currentTimeMillis())
        healthDao.updateDoseEvent(updated)

        val list = healthDao.getTodayDoseEvents("2026-08-29").first()
        assertEquals(1, list.size)
        assertEquals("TAKEN", list[0].status)
        assertNotNull(list[0].actualTakenTimeMillis)
    }

    @Test
    fun testRefillStockTracking() = runBlocking {
        val healthDao = db.healthDao()

        val refill = RefillInventoryEntity(
            medicationName = "Clomipramine HCl 25 mg",
            quantityRemaining = 30,
            unit = "capsules",
            dailyBurnRate = 1,
            minimumThresholdDays = 7,
            pharmacyName = "CVS Pharmacy"
        )

        val id = healthDao.insertRefill(refill)
        val list = healthDao.getAllRefills().first()
        assertEquals(1, list.size)
        assertEquals(30, list[0].quantityRemaining)

        // Decrement by 1 dose
        healthDao.updateRefill(list[0].copy(quantityRemaining = 29))
        val updatedList = healthDao.getAllRefills().first()
        assertEquals(29, updatedList[0].quantityRemaining)
    }

    @Test
    fun testVitalSignsLogging() = runBlocking {
        val healthDao = db.healthDao()

        val vital = VitalSignEntity(
            systolicBp = 118,
            diastolicBp = 76,
            restingHeartRate = 68,
            weightKg = 72.0f,
            symptoms = "None",
            note = "Morning routine check"
        )

        val id = healthDao.insertVital(vital)
        val list = healthDao.getAllVitals().first()
        assertEquals(1, list.size)
        assertEquals(118, list[0].systolicBp)
        assertEquals(76, list[0].diastolicBp)
        assertEquals(68, list[0].restingHeartRate)
    }
}
