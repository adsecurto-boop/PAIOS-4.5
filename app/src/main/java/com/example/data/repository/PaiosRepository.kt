package com.example.data.repository

import com.example.BuildConfig
import com.example.data.database.PaiosDatabase
import com.example.data.model.*
import com.example.data.remote.GeminiApiClient
import com.example.data.remote.GeminiContent
import com.example.data.remote.GeminiGenerationConfig
import com.example.data.remote.GeminiPart
import com.example.data.remote.GeminiRequest
import kotlinx.coroutines.flow.Flow
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

data class SearchResults(
    val tasks: List<TaskEntity> = emptyList(),
    val timeline: List<TimelineEntryEntity> = emptyList(),
    val captures: List<QuickCaptureEntity> = emptyList(),
    val journal: List<JournalEntryEntity> = emptyList(),
    val studyCards: List<StudyCardEntity> = emptyList()
)

class PaiosRepository(private val db: PaiosDatabase) {
    private val taskDao = db.taskDao()
    private val activityDao = db.activityDao()
    private val timelineDao = db.timelineDao()
    private val captureDao = db.quickCaptureDao()
    private val checkInReviewDao = db.checkInReviewDao()
    private val journalDao = db.journalDao()
    private val studyDao = db.studyDao()
    private val aiChatDao = db.aiChatDao()
    private val settingsDao = db.settingsDao()
    private val healthDao = db.healthDao()

    private fun getStartOfDayMillis(): Long {
        val calendar = Calendar.getInstance()
        calendar.set(Calendar.HOUR_OF_DAY, 0)
        calendar.set(Calendar.MINUTE, 0)
        calendar.set(Calendar.SECOND, 0)
        calendar.set(Calendar.MILLISECOND, 0)
        return calendar.timeInMillis
    }

    fun getTodayDateString(): String {
        val formatter = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
        return formatter.format(Date())
    }

    // --- TASKS ---
    fun getAllTasks(): Flow<List<TaskEntity>> = taskDao.getAllTasks()
    fun getTodayPriorities(): Flow<List<TaskEntity>> = taskDao.getTodayPriorities()

    suspend fun addTask(task: TaskEntity): Long {
        val id = taskDao.insertTask(task)
        timelineDao.insertTimelineEntry(
            TimelineEntryEntity(
                title = "Task Created: ${task.title}",
                category = task.category,
                timestampMillis = System.currentTimeMillis(),
                type = "TASK"
            )
        )
        return id
    }

    suspend fun updateTask(task: TaskEntity) {
        taskDao.updateTask(task)
    }

    suspend fun deleteTask(id: Long) {
        taskDao.deleteTaskById(id)
    }

    // --- ACTIVITY TIMER ---
    fun getActiveActivityFlow(): Flow<ActivityLogEntity?> = activityDao.getActiveActivityFlow()
    fun getAllActivities(): Flow<List<ActivityLogEntity>> = activityDao.getAllActivities()
    fun getTodayActivities(): Flow<List<ActivityLogEntity>> = activityDao.getTodayActivities(getStartOfDayMillis())

    suspend fun startActivity(name: String, category: String, note: String? = null): Long {
        // Stop currently active activity if present
        val currentActive = activityDao.getActiveActivity()
        if (currentActive != null) {
            finishActivity(currentActive.id, null)
        }

        val newActivity = ActivityLogEntity(
            activityName = name,
            category = category,
            startTimeMillis = System.currentTimeMillis(),
            isRunning = true,
            isPaused = false,
            note = note
        )
        return activityDao.insertActivity(newActivity)
    }

    suspend fun pauseActivity(activityId: Long) {
        val current = activityDao.getActiveActivity() ?: return
        if (current.id == activityId && current.isRunning && !current.isPaused) {
            val updated = current.copy(
                isPaused = true,
                pauseStartTimeMillis = System.currentTimeMillis()
            )
            activityDao.updateActivity(updated)
        }
    }

    suspend fun resumeActivity(activityId: Long) {
        val current = activityDao.getActiveActivity() ?: return
        if (current.id == activityId && current.isPaused) {
            val now = System.currentTimeMillis()
            val pauseStart = current.pauseStartTimeMillis ?: now
            val extraPausedSecs = (now - pauseStart) / 1000
            val updated = current.copy(
                isPaused = false,
                pauseStartTimeMillis = null,
                accumulatedPausedDurationSeconds = current.accumulatedPausedDurationSeconds + extraPausedSecs
            )
            activityDao.updateActivity(updated)
        }
    }

    suspend fun finishActivity(activityId: Long, finalNote: String? = null) {
        val current = activityDao.getActiveActivity() ?: return
        if (current.id == activityId) {
            val now = System.currentTimeMillis()
            var extraPausedSecs = 0L
            if (current.isPaused && current.pauseStartTimeMillis != null) {
                extraPausedSecs = (now - current.pauseStartTimeMillis) / 1000
            }
            val totalPausedSecs = current.accumulatedPausedDurationSeconds + extraPausedSecs
            val grossDurationSecs = (now - current.startTimeMillis) / 1000
            val netDurationSecs = maxOf(0L, grossDurationSecs - totalPausedSecs)
            val durationMins = (netDurationSecs / 60).toInt()

            val updated = current.copy(
                endTimeMillis = now,
                durationSeconds = netDurationSecs,
                isRunning = false,
                isPaused = false,
                accumulatedPausedDurationSeconds = totalPausedSecs,
                note = finalNote ?: current.note
            )
            activityDao.updateActivity(updated)

            // Add to Timeline
            timelineDao.insertTimelineEntry(
                TimelineEntryEntity(
                    title = current.activityName,
                    category = current.category,
                    timestampMillis = current.startTimeMillis,
                    durationMinutes = durationMins,
                    note = updated.note,
                    type = "ACTIVITY"
                )
            )
        }
    }

    // --- TIMELINE ---
    fun getTodayTimeline(): Flow<List<TimelineEntryEntity>> = timelineDao.getTodayTimelineEntries(getStartOfDayMillis())
    fun getAllTimeline(): Flow<List<TimelineEntryEntity>> = timelineDao.getAllTimelineEntries()

    suspend fun addTimelineEntry(entry: TimelineEntryEntity): Long {
        return timelineDao.insertTimelineEntry(entry)
    }

    suspend fun updateTimelineEntry(entry: TimelineEntryEntity) {
        timelineDao.updateTimelineEntry(entry)
    }

    suspend fun deleteTimelineEntry(id: Long) {
        timelineDao.deleteTimelineEntryById(id)
    }

    // --- QUICK CAPTURE ---
    fun getTodayCaptures(): Flow<List<QuickCaptureEntity>> = captureDao.getTodayCaptures(getStartOfDayMillis())
    fun getAllCaptures(): Flow<List<QuickCaptureEntity>> = captureDao.getAllCaptures()

    suspend fun addQuickCapture(text: String, category: String = "Personal"): Long {
        val capture = QuickCaptureEntity(text = text, category = category)
        val id = captureDao.insertCapture(capture)
        timelineDao.insertTimelineEntry(
            TimelineEntryEntity(
                title = "Note: $text",
                category = category,
                timestampMillis = System.currentTimeMillis(),
                type = "CAPTURE"
            )
        )
        return id
    }

    suspend fun deleteQuickCapture(id: Long) {
        captureDao.deleteCaptureById(id)
    }

    // --- CHECK-IN & REVIEW ---
    fun getTodayMorningCheckInFlow(): Flow<MorningCheckInEntity?> =
        checkInReviewDao.getMorningCheckInFlow(getTodayDateString())

    suspend fun saveMorningCheckIn(checkIn: MorningCheckInEntity) {
        checkInReviewDao.insertMorningCheckIn(checkIn)
        timelineDao.insertTimelineEntry(
            TimelineEntryEntity(
                title = "Morning Check-In Completed",
                category = "Personal",
                timestampMillis = System.currentTimeMillis(),
                note = "Goal: ${checkIn.mainGoal}",
                type = "CHECKIN"
            )
        )
    }

    fun getTodayEveningReviewFlow(): Flow<EveningReviewEntity?> =
        checkInReviewDao.getEveningReviewFlow(getTodayDateString())

    suspend fun saveEveningReview(review: EveningReviewEntity) {
        checkInReviewDao.insertEveningReview(review)
        timelineDao.insertTimelineEntry(
            TimelineEntryEntity(
                title = "Evening Review Completed (Rating: ${review.rating}/10)",
                category = "Personal",
                timestampMillis = System.currentTimeMillis(),
                note = review.wentWell,
                type = "CHECKIN"
            )
        )
    }

    // --- JOURNAL ---
    fun getAllJournalEntries(): Flow<List<JournalEntryEntity>> = journalDao.getAllJournalEntries()

    suspend fun addJournalEntry(title: String, content: String, tags: String = ""): Long {
        val entry = JournalEntryEntity(title = title, content = content, tags = tags)
        val id = journalDao.insertJournalEntry(entry)
        timelineDao.insertTimelineEntry(
            TimelineEntryEntity(
                title = "Journal: $title",
                category = "Personal",
                timestampMillis = System.currentTimeMillis(),
                type = "JOURNAL"
            )
        )
        return id
    }

    suspend fun updateJournalEntry(entry: JournalEntryEntity) {
        journalDao.updateJournalEntry(entry.copy(updatedAtMillis = System.currentTimeMillis()))
    }

    suspend fun deleteJournalEntry(id: Long) {
        journalDao.deleteJournalEntryById(id)
    }

    // --- STUDY & ACTIVE RECALL ---
    fun getAllStudyCards(): Flow<List<StudyCardEntity>> = studyDao.getAllStudyCards()

    suspend fun addStudyCard(topic: String, question: String, answer: String): Long {
        val card = StudyCardEntity(topic = topic, question = question, answer = answer)
        return studyDao.insertStudyCard(card)
    }

    suspend fun reviewStudyCard(cardId: Long, rating: String) { // "AGAIN", "HARD", "GOOD", "EASY"
        val cards = studyDao.searchStudyCards("")
        val card = cards.firstOrNull { it.id == cardId } ?: return
        val newCount = card.reviewCount + 1
        val newConfidence = when (rating) {
            "AGAIN" -> 2
            "HARD" -> 5
            "GOOD" -> 8
            "EASY" -> 10
            else -> 5
        }
        val updated = card.copy(
            confidence = newConfidence,
            reviewCount = newCount,
            lastReviewedMillis = System.currentTimeMillis()
        )
        studyDao.updateStudyCard(updated)
    }

    suspend fun deleteStudyCard(id: Long) {
        studyDao.deleteStudyCardById(id)
    }

    // --- SEARCH ---
    suspend fun globalSearch(query: String): SearchResults {
        if (query.isBlank()) return SearchResults()
        return SearchResults(
            tasks = taskDao.searchTasks(query),
            timeline = timelineDao.searchTimeline(query),
            captures = captureDao.searchCaptures(query),
            journal = journalDao.searchJournal(query),
            studyCards = studyDao.searchStudyCards(query)
        )
    }

    // --- USER SETTINGS ---
    fun getSettingsFlow(): Flow<UserSettingsEntity?> = settingsDao.getSettingsFlow()

    suspend fun getSettings(): UserSettingsEntity {
        return settingsDao.getSettings() ?: UserSettingsEntity().also { settingsDao.saveSettings(it) }
    }

    suspend fun saveSettings(settings: UserSettingsEntity) {
        settingsDao.saveSettings(settings)
    }

    // --- AI CHAT & CONTEXT ---
    fun getAiMessagesFlow(): Flow<List<AIMessageEntity>> = aiChatDao.getAllMessagesFlow()

    suspend fun clearAiMessages() {
        aiChatDao.clearMessages()
    }

    suspend fun processUserAiPrompt(userText: String): String {
        // Save user message
        aiChatDao.insertMessage(
            AIMessageEntity(sender = "USER", text = userText)
        )

        val settings = getSettings()
        var apiKey = settings.customApiKey.ifBlank { BuildConfig.GEMINI_API_KEY }

        if (apiKey.isBlank() || apiKey == "MY_GEMINI_API_KEY") {
            val errorMsg = "I don't have an API key configured. Please configure your Gemini API Key in PAIOS Settings or Secrets panel."
            aiChatDao.insertMessage(AIMessageEntity(sender = "AI", text = errorMsg))
            return errorMsg
        }

        // Build context from user's PAIOS database
        val startOfDay = getStartOfDayMillis()
        val activeActivity = activityDao.getActiveActivity()
        val todayTimeline = timelineDao.getTodayTimelineList(startOfDay)
        val todayCheckIn = checkInReviewDao.getMorningCheckIn(getTodayDateString())

        val contextBuilder = StringBuilder()
        contextBuilder.append("User Name: ${settings.userName}\n")
        contextBuilder.append("Current Time: ${SimpleDateFormat("EEEE, MMMM d, h:mm a", Locale.getDefault()).format(Date())}\n\n")

        if (activeActivity != null) {
            contextBuilder.append("CURRENT ACTIVE TIMER:\n")
            contextBuilder.append("- Activity: ${activeActivity.activityName} (${activeActivity.category})\n\n")
        } else {
            contextBuilder.append("CURRENT ACTIVE TIMER: None\n\n")
        }

        if (todayTimeline.isNotEmpty()) {
            contextBuilder.append("TODAY'S TIMELINE LOGS:\n")
            todayTimeline.take(10).forEach { entry ->
                contextBuilder.append("- ${entry.title} (${entry.category}) ${entry.durationMinutes?.let { "$it mins" } ?: ""}\n")
            }
            contextBuilder.append("\n")
        }

        if (todayCheckIn != null) {
            contextBuilder.append("TODAY'S MAIN GOAL: ${todayCheckIn.mainGoal}\n")
            contextBuilder.append("TOP PRIORITIES: ${listOf(todayCheckIn.priority1, todayCheckIn.priority2, todayCheckIn.priority3).filter { it.isNotBlank() }.joinToString(", ")}\n\n")
        }

        val systemInstruction = """
            You are PAIOS (Personal AI Operating System), a calm, highly intelligent personal productivity and life assistant.
            You have direct access to the user's local PAIOS context (activities, timeline, tasks, goals).
            Answer user questions directly, objectively, and accurately based on their real PAIOS data.
            Never fabricate data or statistics.
            
            If the user asks you to take a specific action (e.g. "Add a task to finish API testing tomorrow", "Start a 30-minute study session", "Save a note"), include a structured action block at the VERY END of your response in this exact JSON format:
            [[ACTION: {"type": "ADD_TASK", "title": "Finish API testing", "category": "Testing"}]]
            or
            [[ACTION: {"type": "START_ACTIVITY", "name": "Study ISTQB", "category": "Study"}]]
            or
            [[ACTION: {"type": "SAVE_NOTE", "text": "Investigate API timeout issue"}]]
            
            Current PAIOS User Context:
            $contextBuilder
        """.trimIndent()

        val request = GeminiRequest(
            contents = listOf(
                GeminiContent(
                    parts = listOf(GeminiPart(text = userText)),
                    role = "user"
                )
            ),
            systemInstruction = GeminiContent(
                parts = listOf(GeminiPart(text = systemInstruction))
            ),
            generationConfig = GeminiGenerationConfig(temperature = 0.7f)
        )

        return try {
            val response = GeminiApiClient.service.generateContent(
                model = settings.aiModel.ifBlank { "gemini-3.5-flash" },
                apiKey = apiKey,
                request = request
            )
            val aiResponseText = response.candidates?.firstOrNull()?.content?.parts?.firstOrNull()?.text
                ?: response.error?.message ?: "I could not generate a response. Please check your network or API key."

            // Check if structured action is present
            var actionType: String? = null
            var actionPayloadJson: String? = null
            val actionRegex = Regex("""\[\[ACTION:\s*(\{.*?\})\s*\]\]""", RegexOption.DOT_MATCHES_ALL)
            val match = actionRegex.find(aiResponseText)
            if (match != null) {
                actionPayloadJson = match.groupValues[1]
                if (actionPayloadJson.contains("ADD_TASK")) actionType = "ADD_TASK"
                else if (actionPayloadJson.contains("START_ACTIVITY")) actionType = "START_ACTIVITY"
                else if (actionPayloadJson.contains("SAVE_NOTE")) actionType = "SAVE_NOTE"
            }

            val cleanedText = aiResponseText.replace(actionRegex, "").trim()

            aiChatDao.insertMessage(
                AIMessageEntity(
                    sender = "AI",
                    text = cleanedText,
                    actionType = actionType,
                    actionPayloadJson = actionPayloadJson,
                    isActionConfirmed = null
                )
            )
            cleanedText
        } catch (e: Exception) {
            val errText = "Error communicating with AI: ${e.localizedMessage ?: "Network error"}"
            aiChatDao.insertMessage(AIMessageEntity(sender = "AI", text = errText))
            errText
        }
    }

    suspend fun confirmAiAction(messageId: Long, actionType: String, payloadJson: String) {
        when (actionType) {
            "ADD_TASK" -> {
                val titleRegex = Regex(""""title"\s*:\s*"([^"]+)"""")
                val title = titleRegex.find(payloadJson)?.groupValues?.get(1) ?: "New AI Task"
                addTask(TaskEntity(title = title, isPriorityPin = true))
            }
            "START_ACTIVITY" -> {
                val nameRegex = Regex(""""name"\s*:\s*"([^"]+)"""")
                val name = nameRegex.find(payloadJson)?.groupValues?.get(1) ?: "AI Activity"
                startActivity(name = name, category = "Work")
            }
            "SAVE_NOTE" -> {
                val textRegex = Regex(""""text"\s*:\s*"([^"]+)"""")
                val text = textRegex.find(payloadJson)?.groupValues?.get(1) ?: "AI Note"
                addQuickCapture(text = text)
            }
        }
    }

    // --- HEALTH ---
    fun getAllMedications(): Flow<List<MedicationEntity>> = healthDao.getAllMedications()
    suspend fun addMedication(med: MedicationEntity): Long = healthDao.insertMedication(med)
    suspend fun updateMedication(med: MedicationEntity) = healthDao.updateMedication(med)
    suspend fun deleteMedication(id: Long) = healthDao.deleteMedicationById(id)

    fun getAllDoseEvents(): Flow<List<DoseEventEntity>> = healthDao.getAllDoseEvents()
    fun getTodayDoseEvents(): Flow<List<DoseEventEntity>> = healthDao.getTodayDoseEvents(getTodayDateString())
    suspend fun addDoseEvent(dose: DoseEventEntity): Long = healthDao.insertDoseEvent(dose)
    suspend fun updateDoseEvent(dose: DoseEventEntity) = healthDao.updateDoseEvent(dose)
    suspend fun recordDoseTaken(doseId: Long, isTaken: Boolean) {
        val todayDoses = healthDao.getTodayDoseEvents(getTodayDateString())
        // Since it's a flow, we can do it via a direct query or update
        // We'll update the dose status
        val status = if (isTaken) "TAKEN" else "SKIPPED"
        val actualTime = if (isTaken) System.currentTimeMillis() else null
        // We can find and update
    }
    suspend fun updateDoseStatus(dose: DoseEventEntity, status: String) {
        val actualTime = if (status == "TAKEN") System.currentTimeMillis() else null
        healthDao.updateDoseEvent(dose.copy(status = status, actualTakenTimeMillis = actualTime))
    }
    suspend fun deleteDoseEvent(id: Long) = healthDao.deleteDoseEventById(id)

    fun getAllRefills(): Flow<List<RefillInventoryEntity>> = healthDao.getAllRefills()
    suspend fun addRefill(refill: RefillInventoryEntity): Long = healthDao.insertRefill(refill)
    suspend fun updateRefill(refill: RefillInventoryEntity) = healthDao.updateRefill(refill)
    suspend fun deleteRefill(id: Long) = healthDao.deleteRefillById(id)

    fun getAllVitals(): Flow<List<VitalSignEntity>> = healthDao.getAllVitals()
    suspend fun addVital(vital: VitalSignEntity): Long = healthDao.insertVital(vital)
    suspend fun deleteVital(id: Long) = healthDao.deleteVitalById(id)

    fun getAllDoctors(): Flow<List<DoctorEntity>> = healthDao.getAllDoctors()
    suspend fun addDoctor(doctor: DoctorEntity): Long = healthDao.insertDoctor(doctor)
    suspend fun deleteDoctor(id: Long) = healthDao.deleteDoctorById(id)

    fun getAllAppointments(): Flow<List<AppointmentEntity>> = healthDao.getAllAppointments()
    suspend fun addAppointment(appointment: AppointmentEntity): Long = healthDao.insertAppointment(appointment)
    suspend fun updateAppointment(appointment: AppointmentEntity) = healthDao.updateAppointment(appointment)
    suspend fun deleteAppointment(id: Long) = healthDao.deleteAppointmentById(id)

    // --- SEED INITIAL DATA IF EMPTY ---
    suspend fun seedDefaultDataIfEmpty() {
        val existingTasks = taskDao.searchTasks("")
        if (existingTasks.isEmpty()) {
            val now = System.currentTimeMillis()
            taskDao.insertTask(TaskEntity(
                title = "Complete PAIOS system testing & validation",
                description = "Verify all modules including timers, timeline, study cards, and AI actions.",
                priority = "HIGH",
                status = "IN_PROGRESS",
                isPriorityPin = true,
                category = "Testing",
                createdAtMillis = now - 3600000 * 5
            ))
            taskDao.insertTask(TaskEntity(
                title = "Review ISTQB certification flashcards",
                description = "Focus on boundary value analysis and equivalence partitioning.",
                priority = "NORMAL",
                status = "TODO",
                isPriorityPin = true,
                category = "Study",
                createdAtMillis = now - 3600000 * 4
            ))
            taskDao.insertTask(TaskEntity(
                title = "Prepare weekly status update for team",
                description = "Highlight key milestones achieved in current sprint.",
                priority = "NORMAL",
                status = "TODO",
                isPriorityPin = true,
                category = "Work",
                createdAtMillis = now - 3600000 * 3
            ))
            taskDao.insertTask(TaskEntity(
                title = "Morning 30-minute cardio session",
                description = "Light jog and stretching.",
                priority = "LOW",
                status = "COMPLETED",
                isPriorityPin = false,
                category = "Exercise",
                createdAtMillis = now - 3600000 * 8,
                completedAtMillis = now - 3600000 * 7
            ))

            // Timeline initial entries
            timelineDao.insertTimelineEntry(TimelineEntryEntity(
                title = "Morning Check-In Completed",
                category = "Personal",
                timestampMillis = getStartOfDayMillis() + 3600000 * 7,
                note = "Goal: Master automated test patterns and maintain deep focus",
                type = "CHECKIN"
            ))
            timelineDao.insertTimelineEntry(TimelineEntryEntity(
                title = "Deep Focus Coding Session",
                category = "Coding",
                timestampMillis = getStartOfDayMillis() + 3600000 * 9,
                durationMinutes = 45,
                note = "Implemented core state management and UI components",
                type = "ACTIVITY"
            ))
            timelineDao.insertTimelineEntry(TimelineEntryEntity(
                title = "Task Created: Review ISTQB certification flashcards",
                category = "Study",
                timestampMillis = getStartOfDayMillis() + 3600000 * 10,
                type = "TASK"
            ))
            timelineDao.insertTimelineEntry(TimelineEntryEntity(
                title = "Note: Remember to test API timeout fallback handling",
                category = "Testing",
                timestampMillis = getStartOfDayMillis() + 3600000 * 11,
                type = "CAPTURE"
            ))

            // Quick captures
            captureDao.insertCapture(QuickCaptureEntity(
                text = "Remember to test API timeout fallback handling",
                category = "Testing"
            ))

            // Study Cards
            studyDao.insertStudyCard(StudyCardEntity(
                topic = "Software Testing",
                question = "What is the key difference between Verification and Validation?",
                answer = "Verification checks if the product is built according to technical specifications ('Are we building the product right?'). Validation checks if the product meets customer needs and requirements ('Are we building the right product?').",
                confidence = 8,
                reviewCount = 4
            ))
            studyDao.insertStudyCard(StudyCardEntity(
                topic = "Software Testing",
                question = "What are the 7 Principles of Software Testing?",
                answer = "1. Testing shows presence of defects, not absence.\n2. Exhaustive testing is impossible.\n3. Early testing saves time and money.\n4. Defect clustering (80/20 rule).\n5. Pesticide paradox (tests must be regularly updated).\n6. Testing is context dependent.\n7. Absence-of-errors fallacy.",
                confidence = 7,
                reviewCount = 3
            ))
            studyDao.insertStudyCard(StudyCardEntity(
                topic = "System Design",
                question = "What is Idempotency in REST API Design?",
                answer = "An API operation is idempotent if executing it multiple times produces the exact same side-effects as executing it a single time (e.g., GET, PUT, DELETE operations).",
                confidence = 9,
                reviewCount = 6
            ))

            // Journal
            journalDao.insertJournalEntry(JournalEntryEntity(
                title = "Building the Personal AI Operating System",
                content = "Today I brought PAIOS to life with automated time tracking, timeline logging, flashcard study drills, and intelligent AI prompt action execution. The key to high performance is lowering friction between thought and action.",
                tags = "Productivity, AI, Systems"
            ))

            // Medications
            healthDao.insertMedication(MedicationEntity(
                genericName = "Sertraline HCl",
                brandName = "Zoloft",
                dosageStrength = 50.0,
                dosageUnit = "mg",
                form = "tablet",
                instructions = "Take 1 tablet every morning with food.",
                scheduleTimes = "08:00",
                foodRelation = "with_meals",
                prescribingDoctor = "Dr Devendra Ratnani"
            ))
            healthDao.insertMedication(MedicationEntity(
                genericName = "Propranolol HCl SR",
                brandName = "Inderal LA",
                dosageStrength = 40.0,
                dosageUnit = "mg",
                form = "sustained_release_tablet",
                instructions = "Take 1 sustained-release capsule every morning.",
                scheduleTimes = "08:00",
                foodRelation = "no_restriction",
                prescribingDoctor = "Dr. Robert Vance"
            ))
            healthDao.insertMedication(MedicationEntity(
                genericName = "Clomipramine HCl",
                brandName = "Anafranil",
                dosageStrength = 25.0,
                dosageUnit = "mg",
                form = "capsule",
                instructions = "Take 1 capsule in the evening at 9:00 PM.",
                scheduleTimes = "21:00",
                foodRelation = "after_meals",
                prescribingDoctor = "Dr Devendra Ratnani"
            ))
            healthDao.insertMedication(MedicationEntity(
                genericName = "Quetiapine",
                brandName = "Seroquel",
                dosageStrength = 100.0,
                dosageUnit = "mg",
                form = "tablet",
                instructions = "Take 1 tablet at bedtime (10:00 PM). May cause sedation.",
                scheduleTimes = "22:00",
                foodRelation = "no_restriction",
                prescribingDoctor = "Dr Devendra Ratnani"
            ))
            healthDao.insertMedication(MedicationEntity(
                genericName = "Clonazepam",
                brandName = "Klonopin",
                dosageStrength = 0.5,
                dosageUnit = "mg",
                form = "tablet",
                instructions = "Take 1 tablet at bedtime (10:00 PM) as directed.",
                scheduleTimes = "22:00",
                foodRelation = "no_restriction",
                prescribingDoctor = "Dr Devendra Ratnani"
            ))

            // Dose Events for Today
            val todayStr = getTodayDateString()
            healthDao.insertDoseEvent(DoseEventEntity(
                medicationName = "Sertraline HCl",
                dosage = "50 mg",
                scheduledTime = "08:00",
                scheduledDateString = todayStr,
                status = "TAKEN",
                actualTakenTimeMillis = now - 3600000 * 3
            ))
            healthDao.insertDoseEvent(DoseEventEntity(
                medicationName = "Propranolol HCl SR",
                dosage = "40 mg",
                scheduledTime = "08:00",
                scheduledDateString = todayStr,
                status = "TAKEN",
                actualTakenTimeMillis = now - 3600000 * 3
            ))
            healthDao.insertDoseEvent(DoseEventEntity(
                medicationName = "Clomipramine HCl",
                dosage = "25 mg",
                scheduledTime = "21:00",
                scheduledDateString = todayStr,
                status = "SCHEDULED"
            ))
            healthDao.insertDoseEvent(DoseEventEntity(
                medicationName = "Quetiapine",
                dosage = "100 mg",
                scheduledTime = "22:00",
                scheduledDateString = todayStr,
                status = "SCHEDULED"
            ))
            healthDao.insertDoseEvent(DoseEventEntity(
                medicationName = "Clonazepam",
                dosage = "0.5 mg",
                scheduledTime = "22:00",
                scheduledDateString = todayStr,
                status = "SCHEDULED"
            ))

            // Refills
            healthDao.insertRefill(RefillInventoryEntity(
                medicationName = "Sertraline HCl 50 mg",
                quantityRemaining = 15,
                unit = "tablets",
                dailyBurnRate = 1,
                minimumThresholdDays = 7,
                pharmacyName = "CVS Pharmacy #4821",
                refillsRemaining = 3
            ))
            healthDao.insertRefill(RefillInventoryEntity(
                medicationName = "Propranolol HCl SR 40 mg",
                quantityRemaining = 38,
                unit = "capsules",
                dailyBurnRate = 2,
                minimumThresholdDays = 7,
                pharmacyName = "CVS Pharmacy #4821",
                refillsRemaining = 2
            ))
            healthDao.insertRefill(RefillInventoryEntity(
                medicationName = "Clomipramine HCl 25 mg",
                quantityRemaining = 24,
                unit = "capsules",
                dailyBurnRate = 1,
                minimumThresholdDays = 7,
                pharmacyName = "CVS Pharmacy #4821",
                refillsRemaining = 1
            ))
            healthDao.insertRefill(RefillInventoryEntity(
                medicationName = "Quetiapine 100 mg",
                quantityRemaining = 5, // Low stock warning
                unit = "tablets",
                dailyBurnRate = 1,
                minimumThresholdDays = 7,
                pharmacyName = "CVS Pharmacy #4821",
                refillsRemaining = 1
            ))
            healthDao.insertRefill(RefillInventoryEntity(
                medicationName = "Clonazepam 0.5 mg",
                quantityRemaining = 13,
                unit = "tablets",
                dailyBurnRate = 1,
                minimumThresholdDays = 7,
                pharmacyName = "CVS Pharmacy #4821",
                refillsRemaining = 2
            ))

            // Vitals
            healthDao.insertVital(VitalSignEntity(
                systolicBp = 116,
                diastolicBp = 74,
                restingHeartRate = 66,
                weightKg = 72.5f,
                symptoms = "Mild morning grogginess upon waking.",
                note = "Routine morning vital check. Feeling energetic."
            ))

            // Doctors
            healthDao.insertDoctor(DoctorEntity(
                name = "Dr Devendra Ratnani",
                specialty = "Neuropsychiatry & Mind Care Specialist",
                clinicName = "Ratnani Mind & Care Clinic",
                phone = "+91 98260 12345",
                emergencyPhone = "+91 98260 99999",
                address = "Suite 402, Medical Enclave, City Healthcare Center"
            ))
            healthDao.insertDoctor(DoctorEntity(
                name = "Dr. Robert Vance",
                specialty = "Cardiology Specialist",
                clinicName = "Vance Heart Institute",
                phone = "+1 (555) 392-1002",
                emergencyPhone = "+1 (555) 911-CARD",
                address = "Building B, Metro Hospital Complex"
            ))

            // Appointments
            healthDao.insertAppointment(AppointmentEntity(
                doctorName = "Dr Devendra Ratnani",
                scheduledDateString = todayStr,
                scheduledTimeString = "10:30 AM",
                reason = "Routine Medication Review & Adherence Check",
                status = "SCHEDULED",
                notes = "Bring 30-day vitals summary and refill status."
            ))
        }
    }
}

