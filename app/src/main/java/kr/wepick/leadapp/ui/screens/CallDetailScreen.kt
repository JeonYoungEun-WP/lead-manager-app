package kr.wepick.leadapp.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
                val isRecorded = c.callType == "RECORDED"
                Card {
                    Column(Modifier.padding(16.dp)) {
                        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                            Text(
                                PhoneUtils.format(c.phone),
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.weight(1f),
                            )
                            CallTypeBadge(c.callType)
                        }
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

                if (!isRecorded) {
                    // 비-RECORDED 통화는 transcript/summary 없음 — 시도 사실만 안내.
                    Card {
                        Column(Modifier.padding(16.dp)) {
                            val msg = when (c.callType) {
                                "MISSED" -> "수신 부재중 통화입니다."
                                "REJECTED" -> "수신 거절 통화입니다."
                                "NO_ANSWER" -> "발신했으나 상대가 받지 않았습니다."
                                else -> "녹음이 없는 통화입니다."
                            }
                            Text(msg, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "녹음 파일이 생성되지 않아 전사·요약이 없습니다.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                } else {
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
private fun CallTypeBadge(callType: String) {
    val (label, bg, fg) = when (callType) {
        "MISSED" -> Triple("부재중", Color(0xFFFEF3E2), Color(0xFF9A3412))
        "REJECTED" -> Triple("거절", Color(0xFFFCE8E6), Color(0xFFC5221F))
        "NO_ANSWER" -> Triple("미응답", Color(0xFFF1F5F9), Color(0xFF475569))
        else -> return // RECORDED 는 배지 생략
    }
    Surface(color = bg, shape = MaterialTheme.shapes.small) {
        Text(
            label, color = fg,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
        )
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
            // 재업로드: RECORDED 는 transcript 있어야, 비-RECORDED 는 transcript 없이도 가능.
            val canRetry = c.uploadStatus == "FAILED" &&
                (c.callType != "RECORDED" || !c.transcript.isNullOrBlank())
            if (canRetry) {
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
