package kr.wepick.leadapp.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kr.wepick.leadapp.LeadApp
import kr.wepick.leadapp.data.db.Lead
import kr.wepick.leadapp.util.PhoneUtils
import kr.wepick.leadapp.util.appPreferences

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LeadListScreen(
    onLeadClick: (Long) -> Unit,
    onAddClick: () -> Unit,
    onGoSettings: () -> Unit = {},
) {
    val repo = remember { LeadApp.instance.leadRepo }
    val context = LocalContext.current
    var query by rememberSaveable { mutableStateOf("") }
    val flow: Flow<List<Lead>> = remember(query) {
        if (query.isBlank()) repo.observeLeads() else repo.searchLeads(query)
    }
    val leads by flow.collectAsState(initial = emptyList())
    // 상담사 이름 미설정 감지 — 멀티유저 배포 시 이름 없이 업로드되면 어드민에서 'unknown' 으로 보임
    val agentName by remember {
        context.appPreferences.data.map { it[KEY_AGENT_NAME]?.trim().orEmpty() }
    }.collectAsState(initial = null)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("잠재고객") },
                actions = {
                    IconButton(onClick = onAddClick) {
                        Icon(Icons.Filled.Add, contentDescription = "추가")
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onAddClick) {
                Icon(Icons.Filled.Add, contentDescription = "추가")
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            // 상담사 이름 미설정 배너 — null(로딩 중)일 땐 표시 안 함 (깜빡임 방지)
            if (agentName != null && agentName!!.isBlank()) {
                Surface(
                    color = MaterialTheme.colorScheme.tertiaryContainer,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(top = 12.dp),
                    shape = MaterialTheme.shapes.medium,
                    onClick = onGoSettings,
                ) {
                    Row(
                        Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Icon(
                            Icons.Filled.Person,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onTertiaryContainer,
                        )
                        Column(Modifier.weight(1f)) {
                            Text(
                                "상담사 이름을 설정해주세요",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onTertiaryContainer,
                            )
                            Text(
                                "이름이 없으면 관리자 화면에 'unknown' 으로 표시됩니다. 탭해서 설정으로 이동.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onTertiaryContainer,
                            )
                        }
                    }
                }
            }
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("이름·번호·메모 검색") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(16.dp),
            )
            if (leads.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        "등록된 고객이 없습니다.\n+ 버튼으로 추가하세요.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                LazyColumn(Modifier.fillMaxSize()) {
                    items(leads, key = { it.id }) { lead ->
                        LeadRow(lead, onClick = { onLeadClick(lead.id) })
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}

@Composable
private fun LeadRow(lead: Lead, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                lead.name.ifBlank { "(이름 없음)" },
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                PhoneUtils.format(lead.phone),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary,
            )
            if (!lead.memo.isNullOrBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(
                    lead.memo,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        AssistChip(
            onClick = {},
            label = { Text(lead.status, style = MaterialTheme.typography.labelSmall) },
        )
    }
}
