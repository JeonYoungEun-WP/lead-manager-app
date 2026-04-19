package kr.wepick.leadapp.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Message
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kr.wepick.leadapp.LeadApp
import kr.wepick.leadapp.data.db.Lead
import kr.wepick.leadapp.util.PhoneUtils
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LeadDetailScreen(
    leadId: Long,
    onBack: () -> Unit,
    onEdit: () -> Unit,
    onCallClick: (Long) -> Unit,
) {
    val repo = remember { LeadApp.instance.leadRepo }
    val context = LocalContext.current

    var lead by remember { mutableStateOf<Lead?>(null) }
    LaunchedEffect(leadId) { lead = repo.getLead(leadId) }

    val calls by repo.observeCallsByLead(leadId).collectAsState(initial = emptyList())

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(lead?.name ?: "고객 상세") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "뒤로")
                    }
                },
                actions = {
                    IconButton(onClick = onEdit) {
                        Icon(Icons.Filled.Edit, contentDescription = "편집")
                    }
                }
            )
        }
    ) { padding ->
        val l = lead
        if (l == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            Column(Modifier.fillMaxSize().padding(padding)) {
                Card(Modifier.fillMaxWidth().padding(16.dp)) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            PhoneUtils.format(l.phone),
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        if (!l.memo.isNullOrBlank()) {
                            Spacer(Modifier.height(4.dp))
                            Text(l.memo, style = MaterialTheme.typography.bodyMedium)
                        }
                        if (!l.tags.isNullOrBlank()) {
                            Spacer(Modifier.height(4.dp))
                            Text(
                                l.tags, style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                        AssistChip(onClick = {}, label = { Text(l.status) })
                    }
                }

                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Button(
                        onClick = {
                            val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:${l.phone}"))
                            try { context.startActivity(intent) } catch (_: Exception) {
                                // CALL_PHONE 권한 없을 시 DIAL 인텐트로 폴백
                                val dial = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${l.phone}"))
                                context.startActivity(dial)
                            }
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.Filled.Phone, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text("전화")
                    }
                    OutlinedButton(
                        onClick = {
                            val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:${l.phone}"))
                            context.startActivity(intent)
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.Filled.Message, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text("문자")
                    }
                }

                Spacer(Modifier.height(16.dp))
                Text(
                    "통화 내역 (${calls.size})",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
                Spacer(Modifier.height(8.dp))
                if (calls.isEmpty()) {
                    Text(
                        "아직 연결된 통화 없음",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp),
                    )
                } else {
                    LazyColumn(Modifier.fillMaxSize()) {
                        items(calls, key = { it.id }) { c ->
                            Row(
                                Modifier.fillMaxWidth().clickable { onCallClick(c.id) }.padding(16.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(
                                        SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault())
                                            .format(Date(c.startedAt)),
                                        style = MaterialTheme.typography.bodyMedium,
                                    )
                                    Text(
                                        c.summary?.take(80) ?: "요약 대기 중 (${c.status})",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 2,
                                    )
                                }
                            }
                            HorizontalDivider()
                        }
                    }
                }
            }
        }
    }
}
