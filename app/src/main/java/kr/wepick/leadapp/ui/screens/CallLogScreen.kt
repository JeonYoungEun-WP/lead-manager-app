package kr.wepick.leadapp.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
fun CallLogScreen(onCallClick: (Long) -> Unit) {
    val repo = remember { LeadApp.instance.leadRepo }
    val calls by repo.observeCalls().collectAsState(initial = emptyList())

    Scaffold(
        topBar = { TopAppBar(title = { Text("통화내역") }) },
    ) { padding ->
        if (calls.isEmpty()) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Text(
                    "아직 감지된 통화가 없습니다.\n설정에서 녹음 폴더를 지정하세요.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            LazyColumn(Modifier.fillMaxSize().padding(padding)) {
                items(calls, key = { it.id }) { c ->
                    CallRow(c, onClick = { onCallClick(c.id) })
                    HorizontalDivider()
                }
            }
        }
    }
}

@Composable
private fun CallRow(c: CallRecord, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(16.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                PhoneUtils.format(c.phone),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()).format(Date(c.startedAt)),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(4.dp))
            // 비-RECORDED (미응답·부재중·거절) 는 transcript 가 없으므로 안내 문구 표시.
            val body = when {
                c.callType == "MISSED" -> "수신 부재중 통화 (녹음 없음)"
                c.callType == "REJECTED" -> "수신 거절 통화 (녹음 없음)"
                c.callType == "NO_ANSWER" -> "발신 미응답 (상대 받지 않음)"
                else -> c.summary?.take(120) ?: "요약 대기 중"
            }
            Text(
                body,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 3,
            )
        }
        StatusBadge(c)
    }
}

@Composable
private fun StatusBadge(c: CallRecord) {
    // 통화 유형이 비-RECORDED 면 status 무관하게 통화 유형으로 배지 노출.
    val (label, bg, fg) = when (c.callType) {
        "MISSED" -> Triple("부재중", Color(0xFFFEF3E2), Color(0xFF9A3412))
        "REJECTED" -> Triple("거절", Color(0xFFFCE8E6), Color(0xFFC5221F))
        "NO_ANSWER" -> Triple("미응답", Color(0xFFF1F5F9), Color(0xFF475569))
        else -> when (c.status) {
            "DONE" -> Triple("완료", Color(0xFFE6F4EA), Color(0xFF137333))
            "PROCESSING" -> Triple("처리중", Color(0xFFE8F0FE), Color(0xFF1967D2))
            "FAILED" -> Triple("실패", Color(0xFFFCE8E6), Color(0xFFC5221F))
            "AWAITING_FILE" -> Triple("녹음대기", Color(0xFFF3E8FD), Color(0xFF6B2FD1))
            else -> Triple("대기", Color(0xFFFFF4E5), Color(0xFFB06000))
        }
    }
    Surface(color = bg, shape = MaterialTheme.shapes.small) {
        Text(
            label, color = fg,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
        )
    }
}
