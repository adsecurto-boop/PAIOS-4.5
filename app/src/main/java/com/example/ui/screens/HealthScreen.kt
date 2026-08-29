package com.example.ui.screens

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.model.*
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

enum class HealthSubTab(val title: String) {
    SCHEDULE("Schedule"),
    REGIMEN("Regimen & Refills"),
    DOCTORS("Clinicians"),
    VITALS("Vitals"),
    BRIEFING("Briefing")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HealthScreen(
    medications: List<MedicationEntity>,
    doseEvents: List<DoseEventEntity>,
    refills: List<RefillInventoryEntity>,
    vitals: List<VitalSignEntity>,
    doctors: List<DoctorEntity>,
    appointments: List<AppointmentEntity>,
    onUpdateDoseStatus: (DoseEventEntity, String) -> Unit,
    onAddMedication: (String, String, Double, String, String, String, String, String) -> Unit,
    onDeleteMedication: (Long) -> Unit,
    onAddRefill: (String, Int, String, Int, Int, String) -> Unit,
    onUpdateRefillStock: (RefillInventoryEntity, Int) -> Unit,
    onDeleteRefill: (Long) -> Unit,
    onAddVital: (Int?, Int?, Int?, Float?, String, String) -> Unit,
    onDeleteVital: (Long) -> Unit,
    onAddDoctor: (String, String, String, String) -> Unit,
    onDeleteDoctor: (Long) -> Unit,
    onAddAppointment: (String, String, String, String, String) -> Unit,
    onDeleteAppointment: (Long) -> Unit,
    modifier: Modifier = Modifier
) {
    var activeSubTab by remember { mutableStateOf(HealthSubTab.SCHEDULE) }
    var showAddMedDialog by remember { mutableStateOf(false) }
    var showAddRefillDialog by remember { mutableStateOf(false) }
    var showLogVitalDialog by remember { mutableStateOf(false) }
    var showAddDoctorDialog by remember { mutableStateOf(false) }
    var showBookAppointmentDialog by remember { mutableStateOf(false) }

    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current

    Scaffold(
        modifier = modifier.fillMaxSize(),
        floatingActionButton = {
            when (activeSubTab) {
                HealthSubTab.REGIMEN -> {
                    FloatingActionButton(
                        onClick = { showAddMedDialog = true },
                        modifier = Modifier.testTag("fab_add_medication"),
                        containerColor = MaterialTheme.colorScheme.primary
                    ) {
                        Icon(Icons.Default.Add, contentDescription = "Add Medication")
                    }
                }
                HealthSubTab.DOCTORS -> {
                    FloatingActionButton(
                        onClick = { showAddDoctorDialog = true },
                        modifier = Modifier.testTag("fab_add_doctor"),
                        containerColor = MaterialTheme.colorScheme.primary
                    ) {
                        Icon(Icons.Default.PersonAdd, contentDescription = "Add Doctor")
                    }
                }
                HealthSubTab.VITALS -> {
                    FloatingActionButton(
                        onClick = { showLogVitalDialog = true },
                        modifier = Modifier.testTag("fab_log_vital"),
                        containerColor = MaterialTheme.colorScheme.primary
                    ) {
                        Icon(Icons.Default.Favorite, contentDescription = "Log Vitals")
                    }
                }
                else -> {}
            }
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            // Screen Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Clinical Health & Regimen",
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Text(
                        text = "Adherence, Refills, Clinicians & Vitals",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                FilledTonalButton(
                    onClick = {
                        val emerDoctors = doctors.filter { it.emergencyPhone.isNotBlank() }
                        val msg = if (emerDoctors.isNotEmpty()) {
                            "Emergency Contacts: " + emerDoctors.joinToString { "${it.name}: ${it.emergencyPhone}" }
                        } else {
                            "Emergency Hotline: 911 (or local emergency line)"
                        }
                        Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
                    },
                    colors = ButtonDefaults.filledTonalButtonColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                        contentColor = MaterialTheme.colorScheme.onErrorContainer
                    ),
                    modifier = Modifier.testTag("health_emergency_button")
                ) {
                    Icon(Icons.Default.Warning, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Emergency", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }

            // Sub-tabs scrollable chip row
            ScrollableTabRow(
                selectedTabIndex = activeSubTab.ordinal,
                edgePadding = 16.dp,
                divider = {},
                indicator = {}
            ) {
                HealthSubTab.values().forEach { tab ->
                    val isSelected = activeSubTab == tab
                    FilterChip(
                        selected = isSelected,
                        onClick = { activeSubTab = tab },
                        label = { Text(tab.title, fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal) },
                        modifier = Modifier
                            .padding(end = 8.dp)
                            .testTag("health_tab_${tab.name.lowercase()}"),
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                            selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    )
                }
            }

            Spacer(Modifier.height(8.dp))

            // Sub Tab Content
            when (activeSubTab) {
                HealthSubTab.SCHEDULE -> {
                    DoseScheduleTab(
                        doses = doseEvents,
                        onUpdateStatus = onUpdateDoseStatus
                    )
                }
                HealthSubTab.REGIMEN -> {
                    RegimenTab(
                        medications = medications,
                        refills = refills,
                        onAddMedicationClick = { showAddMedDialog = true },
                        onAddRefillClick = { showAddRefillDialog = true },
                        onDeleteMedication = onDeleteMedication,
                        onUpdateRefillStock = onUpdateRefillStock,
                        onDeleteRefill = onDeleteRefill
                    )
                }
                HealthSubTab.DOCTORS -> {
                    DoctorsTab(
                        doctors = doctors,
                        appointments = appointments,
                        onAddDoctorClick = { showAddDoctorDialog = true },
                        onBookAppointmentClick = { showBookAppointmentDialog = true },
                        onDeleteDoctor = onDeleteDoctor,
                        onDeleteAppointment = onDeleteAppointment
                    )
                }
                HealthSubTab.VITALS -> {
                    VitalsTab(
                        vitals = vitals,
                        onLogVitalClick = { showLogVitalDialog = true },
                        onDeleteVital = onDeleteVital
                    )
                }
                HealthSubTab.BRIEFING -> {
                    BriefingTab(
                        medications = medications,
                        doses = doseEvents,
                        vitals = vitals,
                        doctors = doctors,
                        onCopyBriefing = { text ->
                            clipboardManager.setText(AnnotatedString(text))
                            Toast.makeText(context, "Clinical Briefing copied to clipboard!", Toast.LENGTH_SHORT).show()
                        }
                    )
                }
            }
        }
    }

    // Dialogs
    if (showAddMedDialog) {
        AddMedicationDialog(
            doctors = doctors,
            onDismiss = { showAddMedDialog = false },
            onConfirm = { name, brand, strength, unit, form, instructions, schedule, doc ->
                onAddMedication(name, brand, strength, unit, form, instructions, schedule, doc)
                showAddMedDialog = false
            }
        )
    }

    if (showAddRefillDialog) {
        AddRefillDialog(
            medications = medications,
            onDismiss = { showAddRefillDialog = false },
            onConfirm = { medName, qty, unit, burnRate, threshold, pharmacy ->
                onAddRefill(medName, qty, unit, burnRate, threshold, pharmacy)
                showAddRefillDialog = false
            }
        )
    }

    if (showLogVitalDialog) {
        LogVitalDialog(
            onDismiss = { showLogVitalDialog = false },
            onConfirm = { sys, dia, hr, wt, symptoms, note ->
                onAddVital(sys, dia, hr, wt, symptoms, note)
                showLogVitalDialog = false
            }
        )
    }

    if (showAddDoctorDialog) {
        AddDoctorDialog(
            onDismiss = { showAddDoctorDialog = false },
            onConfirm = { name, specialty, clinic, phone ->
                onAddDoctor(name, specialty, clinic, phone)
                showAddDoctorDialog = false
            }
        )
    }

    if (showBookAppointmentDialog) {
        BookAppointmentDialog(
            doctors = doctors,
            onDismiss = { showBookAppointmentDialog = false },
            onConfirm = { docName, date, time, reason, notes ->
                onAddAppointment(docName, date, time, reason, notes)
                showBookAppointmentDialog = false
            }
        )
    }
}

// -------------------------------------------------------------
// 1. DOSE SCHEDULE TAB
// -------------------------------------------------------------
@Composable
fun DoseScheduleTab(
    doses: List<DoseEventEntity>,
    onUpdateStatus: (DoseEventEntity, String) -> Unit,
    modifier: Modifier = Modifier
) {
    val takenCount = doses.count { it.status == "TAKEN" }
    val totalCount = doses.size
    val adherencePercent = if (totalCount > 0) (takenCount * 100) / totalCount else 100

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            // Adherence summary card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
                ),
                shape = RoundedCornerShape(16.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(18.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "Today's Adherence",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                        Text(
                            text = "$takenCount / $totalCount Doses Taken",
                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                        Text(
                            text = "Target: 100% On-Time Protocol",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f)
                        )
                    }

                    Box(
                        modifier = Modifier
                            .size(56.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.primary),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "$adherencePercent%",
                            color = MaterialTheme.colorScheme.onPrimary,
                            fontWeight = FontWeight.Black,
                            fontSize = 16.sp
                        )
                    }
                }
            }
        }

        item {
            Text(
                text = "Today's Prescribed Protocol",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onBackground
            )
        }

        if (doses.isEmpty()) {
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(24.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "No scheduled doses found for today.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        } else {
            items(doses, key = { it.id }) { dose ->
                val isTaken = dose.status == "TAKEN"
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("dose_card_${dose.id}"),
                    colors = CardDefaults.cardColors(
                        containerColor = if (isTaken) {
                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
                        } else {
                            MaterialTheme.colorScheme.surface
                        }
                    ),
                    elevation = CardDefaults.cardElevation(defaultElevation = if (isTaken) 0.dp else 2.dp),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(14.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(42.dp)
                                    .clip(CircleShape)
                                    .background(
                                        if (isTaken) MaterialTheme.colorScheme.primaryContainer
                                        else MaterialTheme.colorScheme.surfaceVariant
                                    ),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    if (isTaken) Icons.Default.CheckCircle else Icons.Default.Schedule,
                                    contentDescription = null,
                                    tint = if (isTaken) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(22.dp)
                                )
                            }

                            Column {
                                Text(
                                    text = dose.medicationName,
                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = "${dose.dosage} • Prescribed time: ${dose.scheduledTime}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                if (dose.actualTakenTimeMillis != null) {
                                    val timeStr = SimpleDateFormat("h:mm a", Locale.getDefault()).format(Date(dose.actualTakenTimeMillis))
                                    Text(
                                        text = "Taken at $timeStr",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                }
                            }
                        }

                        // Action Buttons
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            if (!isTaken) {
                                Button(
                                    onClick = { onUpdateStatus(dose, "TAKEN") },
                                    modifier = Modifier.testTag("take_dose_button_${dose.id}"),
                                    shape = RoundedCornerShape(10.dp),
                                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                                ) {
                                    Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("Take", fontSize = 13.sp)
                                }
                            } else {
                                OutlinedButton(
                                    onClick = { onUpdateStatus(dose, "SCHEDULED") },
                                    modifier = Modifier.testTag("undo_dose_button_${dose.id}"),
                                    shape = RoundedCornerShape(10.dp),
                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)
                                ) {
                                    Text("Undo", fontSize = 12.sp)
                                }
                            }
                        }
                    }
                }
            }
        }

        item { Spacer(Modifier.height(80.dp)) }
    }
}

// -------------------------------------------------------------
// 2. REGIMEN & REFILLS TAB
// -------------------------------------------------------------
@Composable
fun RegimenTab(
    medications: List<MedicationEntity>,
    refills: List<RefillInventoryEntity>,
    onAddMedicationClick: () -> Unit,
    onAddRefillClick: () -> Unit,
    onDeleteMedication: (Long) -> Unit,
    onUpdateRefillStock: (RefillInventoryEntity, Int) -> Unit,
    onDeleteRefill: (Long) -> Unit,
    modifier: Modifier = Modifier
) {
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Refills Section Header
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Refill Stock & Inventory",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onBackground
                )
                TextButton(
                    onClick = onAddRefillClick,
                    modifier = Modifier.testTag("add_refill_button")
                ) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Add Refill Item", fontSize = 13.sp)
                }
            }
        }

        if (refills.isEmpty()) {
            item {
                Text(
                    text = "No refill items configured.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            items(refills, key = { it.id }) { refill ->
                val daysRemaining = if (refill.dailyBurnRate > 0) refill.quantityRemaining / refill.dailyBurnRate else 0
                val isLowStock = daysRemaining <= refill.minimumThresholdDays

                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("refill_card_${refill.id}"),
                    colors = CardDefaults.cardColors(
                        containerColor = if (isLowStock) MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.35f)
                        else MaterialTheme.colorScheme.surfaceVariant
                    ),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(
                                    text = refill.medicationName,
                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = "Pharmacy: ${refill.pharmacyName}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }

                            if (isLowStock) {
                                Surface(
                                    color = MaterialTheme.colorScheme.error,
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Text(
                                        text = "LOW STOCK",
                                        color = MaterialTheme.colorScheme.onError,
                                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                    )
                                }
                            }
                        }

                        Spacer(Modifier.height(12.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(
                                    text = "${refill.quantityRemaining} ${refill.unit} left",
                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black),
                                    color = if (isLowStock) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                                )
                                Text(
                                    text = "~$daysRemaining days remaining (Burn: ${refill.dailyBurnRate}/day)",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }

                            // Stepper buttons
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                IconButton(
                                    onClick = {
                                        if (refill.quantityRemaining > 0) {
                                            onUpdateRefillStock(refill, refill.quantityRemaining - 1)
                                        }
                                    },
                                    modifier = Modifier
                                        .size(36.dp)
                                        .clip(CircleShape)
                                        .background(MaterialTheme.colorScheme.surface)
                                        .testTag("refill_minus_${refill.id}")
                                ) {
                                    Icon(Icons.Default.Remove, contentDescription = "Decrease", modifier = Modifier.size(16.dp))
                                }

                                Spacer(Modifier.width(8.dp))

                                IconButton(
                                    onClick = {
                                        onUpdateRefillStock(refill, refill.quantityRemaining + 1)
                                    },
                                    modifier = Modifier
                                        .size(36.dp)
                                        .clip(CircleShape)
                                        .background(MaterialTheme.colorScheme.surface)
                                        .testTag("refill_plus_${refill.id}")
                                ) {
                                    Icon(Icons.Default.Add, contentDescription = "Increase", modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                    }
                }
            }
        }

        // Active Regimen Section Header
        item {
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Active Prescribed Regimen",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onBackground
                )
                TextButton(
                    onClick = onAddMedicationClick,
                    modifier = Modifier.testTag("add_medication_text_button")
                ) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Add Medication", fontSize = 13.sp)
                }
            }
        }

        if (medications.isEmpty()) {
            item {
                Text(
                    text = "No medications in current regimen.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            items(medications, key = { it.id }) { med ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("medication_card_${med.id}"),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(
                                    text = med.genericName,
                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                if (med.brandName.isNotBlank()) {
                                    Text(
                                        text = "Brand: ${med.brandName} • ${med.dosageStrength} ${med.dosageUnit}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                }
                            }

                            IconButton(
                                onClick = { onDeleteMedication(med.id) },
                                modifier = Modifier.testTag("delete_med_${med.id}")
                            ) {
                                Icon(
                                    Icons.Default.DeleteOutline,
                                    contentDescription = "Delete",
                                    tint = MaterialTheme.colorScheme.error,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }

                        if (med.instructions.isNotBlank()) {
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = med.instructions,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }

                        Spacer(Modifier.height(8.dp))
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Surface(
                                color = MaterialTheme.colorScheme.surfaceVariant,
                                shape = RoundedCornerShape(6.dp)
                            ) {
                                Text(
                                    text = "Form: ${med.form}",
                                    style = MaterialTheme.typography.labelSmall,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }

                            if (med.prescribingDoctor.isNotBlank()) {
                                Surface(
                                    color = MaterialTheme.colorScheme.surfaceVariant,
                                    shape = RoundedCornerShape(6.dp)
                                ) {
                                    Text(
                                        text = "Dr: ${med.prescribingDoctor}",
                                        style = MaterialTheme.typography.labelSmall,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        item { Spacer(Modifier.height(80.dp)) }
    }
}

// -------------------------------------------------------------
// 3. CLINICIANS & APPOINTMENTS TAB
// -------------------------------------------------------------
@Composable
fun DoctorsTab(
    doctors: List<DoctorEntity>,
    appointments: List<AppointmentEntity>,
    onAddDoctorClick: () -> Unit,
    onBookAppointmentClick: () -> Unit,
    onDeleteDoctor: (Long) -> Unit,
    onDeleteAppointment: (Long) -> Unit,
    modifier: Modifier = Modifier
) {
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Appointments section
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Scheduled Consultations",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onBackground
                )
                TextButton(
                    onClick = onBookAppointmentClick,
                    modifier = Modifier.testTag("book_appointment_button")
                ) {
                    Icon(Icons.Default.Event, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Book", fontSize = 13.sp)
                }
            }
        }

        if (appointments.isEmpty()) {
            item {
                Text(
                    text = "No upcoming doctor appointments scheduled.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            items(appointments, key = { it.id }) { apt ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("appointment_card_${apt.id}"),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f)),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = apt.doctorName,
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                            Text(
                                text = "${apt.scheduledDateString} at ${apt.scheduledTimeString}",
                                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                                color = MaterialTheme.colorScheme.primary
                            )
                            if (apt.reason.isNotBlank()) {
                                Text(
                                    text = "Reason: ${apt.reason}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f)
                                )
                            }
                        }

                        IconButton(
                            onClick = { onDeleteAppointment(apt.id) },
                            modifier = Modifier.testTag("delete_apt_${apt.id}")
                        ) {
                            Icon(
                                Icons.Default.DeleteOutline,
                                contentDescription = "Delete",
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                }
            }
        }

        // Doctors Directory section
        item {
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Clinicians Directory",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onBackground
                )
                TextButton(
                    onClick = onAddDoctorClick,
                    modifier = Modifier.testTag("add_doctor_text_button")
                ) {
                    Icon(Icons.Default.PersonAdd, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Add Clinician", fontSize = 13.sp)
                }
            }
        }

        if (doctors.isEmpty()) {
            item {
                Text(
                    text = "No clinicians in directory.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            items(doctors, key = { it.id }) { doc ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("doctor_card_${doc.id}"),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(
                                    text = doc.name,
                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = doc.specialty,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.primary
                                )
                                if (doc.clinicName.isNotBlank()) {
                                    Text(
                                        text = doc.clinicName,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }

                            IconButton(
                                onClick = { onDeleteDoctor(doc.id) },
                                modifier = Modifier.testTag("delete_doc_${doc.id}")
                            ) {
                                Icon(
                                    Icons.Default.DeleteOutline,
                                    contentDescription = "Delete",
                                    tint = MaterialTheme.colorScheme.error,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }

                        if (doc.phone.isNotBlank() || doc.emergencyPhone.isNotBlank()) {
                            Spacer(Modifier.height(8.dp))
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(16.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                if (doc.phone.isNotBlank()) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Default.Phone, contentDescription = null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                                        Spacer(Modifier.width(4.dp))
                                        Text(doc.phone, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                                if (doc.emergencyPhone.isNotBlank()) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Default.Warning, contentDescription = null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.error)
                                        Spacer(Modifier.width(4.dp))
                                        Text("Emerg: ${doc.emergencyPhone}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        item { Spacer(Modifier.height(80.dp)) }
    }
}

// -------------------------------------------------------------
// 4. VITALS TAB
// -------------------------------------------------------------
@Composable
fun VitalsTab(
    vitals: List<VitalSignEntity>,
    onLogVitalClick: () -> Unit,
    onDeleteVital: (Long) -> Unit,
    modifier: Modifier = Modifier
) {
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Vitals & Physiological Metrics",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onBackground
                )
                Button(
                    onClick = onLogVitalClick,
                    modifier = Modifier.testTag("log_vital_button")
                ) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Log Vitals", fontSize = 13.sp)
                }
            }
        }

        if (vitals.isEmpty()) {
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(24.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "No vitals logged yet. Tap 'Log Vitals' to record blood pressure, heart rate, and symptoms.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        } else {
            items(vitals, key = { it.id }) { vital ->
                val dateStr = SimpleDateFormat("MMM d, yyyy • h:mm a", Locale.getDefault()).format(Date(vital.timestampMillis))
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("vital_card_${vital.id}"),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = dateStr,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            IconButton(
                                onClick = { onDeleteVital(vital.id) },
                                modifier = Modifier
                                    .size(24.dp)
                                    .testTag("delete_vital_${vital.id}")
                            ) {
                                Icon(
                                    Icons.Default.DeleteOutline,
                                    contentDescription = "Delete",
                                    tint = MaterialTheme.colorScheme.error,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }

                        Spacer(Modifier.height(10.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            if (vital.systolicBp != null && vital.diastolicBp != null) {
                                Column {
                                    Text("Blood Pressure", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(
                                        text = "${vital.systolicBp}/${vital.diastolicBp} mmHg",
                                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                }
                            }

                            if (vital.restingHeartRate != null) {
                                Column {
                                    Text("Heart Rate", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(
                                        text = "${vital.restingHeartRate} bpm",
                                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                        color = MaterialTheme.colorScheme.secondary
                                    )
                                }
                            }

                            if (vital.weightKg != null) {
                                Column {
                                    Text("Weight", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(
                                        text = "${vital.weightKg} kg",
                                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                        color = MaterialTheme.colorScheme.tertiary
                                    )
                                }
                            }
                        }

                        if (vital.symptoms.isNotBlank()) {
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = "Symptoms: ${vital.symptoms}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }

                        if (vital.note.isNotBlank()) {
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = "Note: ${vital.note}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }

        item { Spacer(Modifier.height(80.dp)) }
    }
}

// -------------------------------------------------------------
// 5. BRIEFING TAB (CONSULTATION SUMMARY)
// -------------------------------------------------------------
@Composable
fun BriefingTab(
    medications: List<MedicationEntity>,
    doses: List<DoseEventEntity>,
    vitals: List<VitalSignEntity>,
    doctors: List<DoctorEntity>,
    onCopyBriefing: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val dateStr = SimpleDateFormat("MMMM d, yyyy", Locale.getDefault()).format(Date())
    val takenDoses = doses.count { it.status == "TAKEN" }
    val totalDoses = doses.size
    val adherence = if (totalDoses > 0) (takenDoses * 100) / totalDoses else 100

    val briefingText = buildString {
        appendLine("=== CLINICAL HEALTH BRIEFING ===")
        appendLine("Date: $dateStr")
        appendLine("Platform: PAIOS Clinical Module")
        appendLine("Adherence Rate: $adherence% ($takenDoses/$totalDoses doses logged today)")
        appendLine()
        appendLine("ACTIVE REGIMEN:")
        if (medications.isEmpty()) {
            appendLine("- No active medications listed.")
        } else {
            medications.forEach { med ->
                appendLine("- ${med.genericName} (${med.brandName}) ${med.dosageStrength} ${med.dosageUnit} [${med.form}]")
                appendLine("  Schedule: ${med.scheduleTimes} | Instructions: ${med.instructions}")
            }
        }
        appendLine()
        appendLine("RECENT VITALS:")
        if (vitals.isEmpty()) {
            appendLine("- No vitals recorded.")
        } else {
            vitals.take(3).forEach { v ->
                val vDate = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()).format(Date(v.timestampMillis))
                appendLine("- $vDate: BP: ${v.systolicBp}/${v.diastolicBp} mmHg | HR: ${v.restingHeartRate} bpm | Weight: ${v.weightKg} kg")
                if (v.symptoms.isNotBlank()) appendLine("  Symptoms: ${v.symptoms}")
            }
        }
        appendLine()
        appendLine("CARE TEAM:")
        if (doctors.isEmpty()) {
            appendLine("- No doctors on file.")
        } else {
            doctors.forEach { doc ->
                appendLine("- ${doc.name} (${doc.specialty}) - Phone: ${doc.phone}")
            }
        }
    }

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                shape = RoundedCornerShape(16.dp)
            ) {
                Column(modifier = Modifier.padding(18.dp)) {
                    Text(
                        text = "Clinical Consultation Briefing",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = "Formatted summary of your regimen, adherence, and physiological markers ready to present to your doctor.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Spacer(Modifier.height(14.dp))

                    Button(
                        onClick = { onCopyBriefing(briefingText) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("copy_briefing_button"),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Copy Full Briefing to Clipboard")
                    }
                }
            }
        }

        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                shape = RoundedCornerShape(14.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = briefingText,
                        style = MaterialTheme.typography.bodySmall.copy(lineHeight = 20.sp),
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }
        }

        item { Spacer(Modifier.height(80.dp)) }
    }
}

// -------------------------------------------------------------
// DIALOGS: Add Medication, Add Refill, Log Vital, etc.
// -------------------------------------------------------------
@Composable
fun AddMedicationDialog(
    doctors: List<DoctorEntity>,
    onDismiss: () -> Unit,
    onConfirm: (String, String, Double, String, String, String, String, String) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var brand by remember { mutableStateOf("") }
    var strength by remember { mutableStateOf("50") }
    var unit by remember { mutableStateOf("mg") }
    var form by remember { mutableStateOf("tablet") }
    var instructions by remember { mutableStateOf("Take 1 tablet every morning with food.") }
    var scheduleTimes by remember { mutableStateOf("08:00") }
    var doctor by remember { mutableStateOf(if (doctors.isNotEmpty()) doctors.first().name else "") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add New Medication") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Generic Name (e.g. Sertraline HCl)") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("input_med_name")
                )
                OutlinedTextField(
                    value = brand,
                    onValueChange = { brand = it },
                    label = { Text("Brand Name (e.g. Zoloft)") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("input_med_brand")
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = strength,
                        onValueChange = { strength = it },
                        label = { Text("Strength") },
                        modifier = Modifier
                            .weight(1f)
                            .testTag("input_med_strength")
                    )
                    OutlinedTextField(
                        value = unit,
                        onValueChange = { unit = it },
                        label = { Text("Unit") },
                        modifier = Modifier
                            .weight(1f)
                            .testTag("input_med_unit")
                    )
                }
                OutlinedTextField(
                    value = instructions,
                    onValueChange = { instructions = it },
                    label = { Text("Instructions") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = scheduleTimes,
                    onValueChange = { scheduleTimes = it },
                    label = { Text("Schedule Time (e.g. 08:00)") },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (name.isNotBlank()) {
                        val strengthVal = strength.toDoubleOrNull() ?: 0.0
                        onConfirm(name, brand, strengthVal, unit, form, instructions, scheduleTimes, doctor)
                    }
                },
                modifier = Modifier.testTag("dialog_confirm_add_med")
            ) {
                Text("Add")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
fun AddRefillDialog(
    medications: List<MedicationEntity>,
    onDismiss: () -> Unit,
    onConfirm: (String, Int, String, Int, Int, String) -> Unit
) {
    var medName by remember { mutableStateOf(if (medications.isNotEmpty()) medications.first().genericName else "") }
    var qty by remember { mutableStateOf("30") }
    var unit by remember { mutableStateOf("tablets") }
    var burnRate by remember { mutableStateOf("1") }
    var threshold by remember { mutableStateOf("7") }
    var pharmacy by remember { mutableStateOf("CVS Pharmacy") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Track Refill Stock") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = medName,
                    onValueChange = { medName = it },
                    label = { Text("Medication Name") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("input_refill_med_name")
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = qty,
                        onValueChange = { qty = it },
                        label = { Text("Current Stock") },
                        modifier = Modifier
                            .weight(1f)
                            .testTag("input_refill_qty")
                    )
                    OutlinedTextField(
                        value = unit,
                        onValueChange = { unit = it },
                        label = { Text("Unit") },
                        modifier = Modifier.weight(1f)
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = burnRate,
                        onValueChange = { burnRate = it },
                        label = { Text("Doses / Day") },
                        modifier = Modifier.weight(1f)
                    )
                    OutlinedTextField(
                        value = threshold,
                        onValueChange = { threshold = it },
                        label = { Text("Alert Days Left") },
                        modifier = Modifier.weight(1f)
                    )
                }
                OutlinedTextField(
                    value = pharmacy,
                    onValueChange = { pharmacy = it },
                    label = { Text("Pharmacy Name") },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (medName.isNotBlank()) {
                        val qtyVal = qty.toIntOrNull() ?: 30
                        val burnVal = burnRate.toIntOrNull() ?: 1
                        val threshVal = threshold.toIntOrNull() ?: 7
                        onConfirm(medName, qtyVal, unit, burnVal, threshVal, pharmacy)
                    }
                },
                modifier = Modifier.testTag("dialog_confirm_add_refill")
            ) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
fun LogVitalDialog(
    onDismiss: () -> Unit,
    onConfirm: (Int?, Int?, Int?, Float?, String, String) -> Unit
) {
    var systolic by remember { mutableStateOf("120") }
    var diastolic by remember { mutableStateOf("80") }
    var heartRate by remember { mutableStateOf("72") }
    var weight by remember { mutableStateOf("70.0") }
    var symptoms by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("Routine check.") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Log Vitals") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = systolic,
                        onValueChange = { systolic = it },
                        label = { Text("Systolic") },
                        modifier = Modifier
                            .weight(1f)
                            .testTag("input_vital_sys")
                    )
                    OutlinedTextField(
                        value = diastolic,
                        onValueChange = { diastolic = it },
                        label = { Text("Diastolic") },
                        modifier = Modifier
                            .weight(1f)
                            .testTag("input_vital_dia")
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = heartRate,
                        onValueChange = { heartRate = it },
                        label = { Text("Heart Rate (bpm)") },
                        modifier = Modifier
                            .weight(1f)
                            .testTag("input_vital_hr")
                    )
                    OutlinedTextField(
                        value = weight,
                        onValueChange = { weight = it },
                        label = { Text("Weight (kg)") },
                        modifier = Modifier
                            .weight(1f)
                            .testTag("input_vital_wt")
                    )
                }
                OutlinedTextField(
                    value = symptoms,
                    onValueChange = { symptoms = it },
                    label = { Text("Symptoms (e.g. dizziness, fatigue)") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("Clinical Note") },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val sys = systolic.toIntOrNull()
                    val dia = diastolic.toIntOrNull()
                    val hr = heartRate.toIntOrNull()
                    val wt = weight.toFloatOrNull()
                    onConfirm(sys, dia, hr, wt, symptoms, note)
                },
                modifier = Modifier.testTag("dialog_confirm_vital")
            ) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
fun AddDoctorDialog(
    onDismiss: () -> Unit,
    onConfirm: (String, String, String, String) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var specialty by remember { mutableStateOf("Neuropsychiatry & Mind Care Specialist") }
    var clinic by remember { mutableStateOf("Healthcare Clinic") }
    var phone by remember { mutableStateOf("+1 (555) 123-4567") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Clinician") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Full Name (e.g. Dr. Jane Smith)") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("input_doc_name")
                )
                OutlinedTextField(
                    value = specialty,
                    onValueChange = { specialty = it },
                    label = { Text("Specialty") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = clinic,
                    onValueChange = { clinic = it },
                    label = { Text("Clinic Name") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    label = { Text("Phone Number") },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (name.isNotBlank()) {
                        onConfirm(name, specialty, clinic, phone)
                    }
                },
                modifier = Modifier.testTag("dialog_confirm_add_doc")
            ) {
                Text("Add")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
fun BookAppointmentDialog(
    doctors: List<DoctorEntity>,
    onDismiss: () -> Unit,
    onConfirm: (String, String, String, String, String) -> Unit
) {
    val defaultDate = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
    var docName by remember { mutableStateOf(if (doctors.isNotEmpty()) doctors.first().name else "Dr Devendra Ratnani") }
    var date by remember { mutableStateOf(defaultDate) }
    var time by remember { mutableStateOf("10:30 AM") }
    var reason by remember { mutableStateOf("Routine Medication Review") }
    var notes by remember { mutableStateOf("Bring recent vitals history.") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Book Consultation") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = docName,
                    onValueChange = { docName = it },
                    label = { Text("Doctor Name") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("input_apt_doc")
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = date,
                        onValueChange = { date = it },
                        label = { Text("Date (YYYY-MM-DD)") },
                        modifier = Modifier.weight(1f)
                    )
                    OutlinedTextField(
                        value = time,
                        onValueChange = { time = it },
                        label = { Text("Time") },
                        modifier = Modifier.weight(1f)
                    )
                }
                OutlinedTextField(
                    value = reason,
                    onValueChange = { reason = it },
                    label = { Text("Reason for Visit") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text("Notes / Reminders") },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (docName.isNotBlank()) {
                        onConfirm(docName, date, time, reason, notes)
                    }
                },
                modifier = Modifier.testTag("dialog_confirm_book_apt")
            ) {
                Text("Schedule")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
