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
import kr.wepick.leadapp.data.db.CallWithLeadName
import kr.wepick.leadapp.util.PhoneUtils
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CallLogScreen(onCallClick: (Long) -> Unit) {
    val repo = remember { LeadApp.instance.leadRepo }
    val calls by repo.observeCallsWithLeadName().collectAsState(initial = emptyList())

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
                items(calls, key = { it.call.id }) { c ->
                    CallRow(c, onClick = { onCallClick(c.call.id) })
                    HorizontalDivider()
                }
            }
        }
    }
}

@Composable
private fun CallRow(item: CallWithLeadName, onClick: () -> Unit) {
    val c = item.call
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(16.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(Modifier.weight(1f)) {
            // 고객명 우선 — 리드 미매칭 통화는 번호로 폴백
            Text(
                item.leadName?.takeIf { it.isNotBlank() } ?: PhoneUtils.format(c.phone),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                "${PhoneUtils.format(c.phone)} · " +
                    SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()).format(Date(c.startedAt)),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(4.dp))
            // 비-RECORDED (부재중·놓친 전화·거절) 는 transcript 가 없으므로 안내 문구 표시.
            val body = when {
                c.callType == "MISSED" -> "고객 전화를 받지 못했습니다 (녹음 없음)"
                c.callType == "REJECTED" -> "수신 거절 통화 (녹음 없음)"
                c.callType == "NO_ANSWER" -> "고객이 전화를 받지 않았습니다 (녹음 없음)"
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
    // 라벨 규약: 부재중(고객이 안 받음) / 놓친 전화(상담사가 못 받음) / 거절 / 녹음(정상 통화)
    val (label, bg, fg) = when (c.callType) {
        "MISSED" -> Triple("놓친 전화", Color(0xFFFEF3E2), Color(0xFF9A3412))
        "REJECTED" -> Triple("거절", Color(0xFFFCE8E6), Color(0xFFC5221F))
        "NO_ANSWER" -> Triple("부재중", Color(0xFFF1F5F9), Color(0xFF475569))
        else -> when (c.status) {
            "DONE" -> Triple("통화성공", Color(0xFFE0F2FE), Color(0xFF075985))
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
