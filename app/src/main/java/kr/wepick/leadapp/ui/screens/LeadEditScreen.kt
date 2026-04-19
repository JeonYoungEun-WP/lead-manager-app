package kr.wepick.leadapp.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kr.wepick.leadapp.LeadApp
import kr.wepick.leadapp.data.db.Lead

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LeadEditScreen(
    leadId: Long?,
    onDone: () -> Unit,
    onCancel: () -> Unit,
) {
    val repo = remember { LeadApp.instance.leadRepo }
    val scope = rememberCoroutineScope()

    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var memo by remember { mutableStateOf("") }
    var tags by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("신규") }

    LaunchedEffect(leadId) {
        if (leadId != null) repo.getLead(leadId)?.let {
            name = it.name; phone = it.phone; memo = it.memo ?: ""
            tags = it.tags ?: ""; status = it.status
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (leadId == null) "고객 등록" else "고객 편집") },
                navigationIcon = {
                    IconButton(onClick = onCancel) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "뒤로")
                    }
                },
                actions = {
                    TextButton(
                        enabled = name.isNotBlank() && phone.isNotBlank(),
                        onClick = {
                            scope.launch {
                                val lead = Lead(
                                    id = leadId ?: 0L,
                                    name = name.trim(),
                                    phone = phone.trim(),
                                    memo = memo.trim().ifBlank { null },
                                    tags = tags.trim().ifBlank { null },
                                    status = status,
                                )
                                repo.saveLead(lead)
                                onDone()
                            }
                        }
                    ) { Text("저장") }
                }
            )
        }
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(
                value = name, onValueChange = { name = it },
                label = { Text("이름 *") }, singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = phone, onValueChange = { phone = it },
                label = { Text("전화번호 *") }, singleLine = true,
                placeholder = { Text("010-1234-5678") },
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = memo, onValueChange = { memo = it },
                label = { Text("메모") }, minLines = 3,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = tags, onValueChange = { tags = it },
                label = { Text("태그 (쉼표 구분)") }, singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Text("상태", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("신규", "상담중", "완료", "거절", "보류").forEach { s ->
                    FilterChip(
                        selected = status == s,
                        onClick = { status = s },
                        label = { Text(s) },
                    )
                }
            }
        }
    }
}
