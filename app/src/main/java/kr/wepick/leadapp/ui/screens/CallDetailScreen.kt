package kr.wepick.leadapp.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kr.wepick.leadapp.LeadApp
import kr.wepick.leadapp.data.db.CallRecord
import kr.wepick.leadapp.util.PhoneUtils
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CallDetailScreen(
    callId: Long,
    onBack: () -> Unit,
) {
    val repo = remember { LeadApp.instance.leadRepo }
    var call by remember { mutableStateOf<CallRecord?>(null) }
    LaunchedEffect(callId) { call = repo.getCall(callId) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("통화 상세") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "뒤로")
                    }
                }
            )
        }
    ) { padding ->
        val c = call
        if (c == null) {
            Box(Modifier.fillMaxSize().padding(padding)) { CircularProgressIndicator() }
        } else {
            Column(
                Modifier.fillMaxSize().padding(padding).padding(16.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Card {
                    Column(Modifier.padding(16.dp)) {
                        Text(
                            PhoneUtils.format(c.phone),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
                                .format(Date(c.startedAt)),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        if (c.durationSec != null) {
                            Text(
                                "길이: ${c.durationSec / 60}분 ${c.durationSec % 60}초",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }

                Text("5줄 요약", style = MaterialTheme.typography.titleMedium)
                Card {
                    Text(
                        c.summary ?: "아직 요약이 생성되지 않았습니다. (상태: ${c.status})",
                        modifier = Modifier.fillMaxWidth().padding(16.dp),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }

                Text("전사문", style = MaterialTheme.typography.titleMedium)
                Card {
                    Text(
                        c.transcript ?: "STT 처리 대기 중.",
                        modifier = Modifier.fillMaxWidth().padding(16.dp),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }

                if (c.status == "FAILED" && !c.errorMessage.isNullOrBlank()) {
                    Text(
                        "오류: ${c.errorMessage}",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }

                UploadStatusCard(c)
            }
        }
    }
}

@Composable
private fun UploadStatusCard(c: CallRecord) {
    val context = LocalContext.current
    val repo = remember { LeadApp.instance.leadRepo }
    var clickedAt by remember { mutableStateOf<Long?>(null) }

    val (label, color) = when (c.uploadStatus) {
        "OK" -> "어드민 업로드 완료" to MaterialTheme.colorScheme.primary
        "FAILED" -> "어드민 업로드 실패" to MaterialTheme.colorScheme.error
        else -> "어드민 업로드 대기/미시도" to MaterialTheme.colorScheme.onSurfaceVariant
    }
    Card {
        Column(Modifier.padding(16.dp)) {
            Text(label, color = color, style = MaterialTheme.typography.bodyMedium)
            if (c.uploadStatus == "FAILED" && !c.uploadError.isNullOrBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    c.uploadError,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            if (c.uploadStatus == "FAILED" && !c.transcript.isNullOrBlank()) {
                Spacer(Modifier.height(8.dp))
                Button(onClick = {
                    repo.retryUpload(context, c.id)
                    clickedAt = System.currentTimeMillis()
                }) {
                    Text("재업로드")
                }
                clickedAt?.let {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "재시도를 큐잉했습니다. 잠시 후 화면을 새로고침해 결과를 확인하세요.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }
    }
}
