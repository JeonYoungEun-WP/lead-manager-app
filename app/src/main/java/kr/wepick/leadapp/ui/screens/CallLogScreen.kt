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
            Text(
                c.summary?.take(120) ?: "요약 대기 중",
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 3,
            )
        }
        StatusBadge(c.status)
    }
}

@Composable
private fun StatusBadge(status: String) {
    val (label, bg, fg) = when (status) {
        "DONE" -> Triple("완료", Color(0xFFE6F4EA), Color(0xFF137333))
        "PROCESSING" -> Triple("처리중", Color(0xFFE8F0FE), Color(0xFF1967D2))
        "FAILED" -> Triple("실패", Color(0xFFFCE8E6), Color(0xFFC5221F))
        else -> Triple("대기", Color(0xFFFFF4E5), Color(0xFFB06000))
    }
    Surface(color = bg, shape = MaterialTheme.shapes.small) {
        Text(
            label, color = fg,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
        )
    }
}
