package kr.wepick.leadapp.ui.screens

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kr.wepick.leadapp.util.appPreferences
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

val KEY_RECORDINGS_URI = stringPreferencesKey("recordings_folder_uri")
val KEY_BACKEND_URL    = stringPreferencesKey("backend_url")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val uriFlow = remember {
        context.appPreferences.data.map { it[KEY_RECORDINGS_URI] }
    }
    val currentUri by uriFlow.collectAsState(initial = null)

    val urlFlow = remember {
        context.appPreferences.data.map { it[KEY_BACKEND_URL] ?: "" }
    }
    val backendUrl by urlFlow.collectAsState(initial = "")
    var urlInput by remember(backendUrl) { mutableStateOf(backendUrl) }

    val folderPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocumentTree(),
    ) { uri ->
        if (uri != null) {
            // 지속 권한 획득
            val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            scope.launch {
                context.appPreferences.edit { it[KEY_RECORDINGS_URI] = uri.toString() }
            }
        }
    }

    Scaffold(topBar = { TopAppBar(title = { Text("설정") }) }) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // 녹음 폴더 설정
            Card {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("통화 녹음 폴더", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(
                        "Samsung 기본 녹음 저장 위치: /내장 저장공간/Recordings/Call/\n" +
                        "아래 버튼을 눌러 이 폴더를 한 번 선택해주세요. (SAF 권한)",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (currentUri != null) {
                        Text(
                            "✓ 현재 지정됨: ${currentUri!!.takeLast(60)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                    Button(onClick = { folderPicker.launch(null) }) {
                        Text(if (currentUri == null) "녹음 폴더 선택" else "폴더 다시 선택")
                    }
                }
            }

            // Samsung 설정 안내
            Card {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Samsung 통화 녹음 켜기", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(
                        "전화 앱 → ⋮ 더보기 → 설정 → 통화 녹음 → '모든 통화 자동 녹음' ON",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Text(
                        "※ 안내: 이 앱은 지정 폴더의 녹음 파일 중 DB 에 등록된 번호와의 통화만 읽습니다. 가족·지인 등 DB 에 없는 번호의 녹음은 앱이 접근하지 않습니다.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // 백엔드 URL
            Card {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("백엔드 (Gemini 프록시)", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    OutlinedTextField(
                        value = urlInput,
                        onValueChange = { urlInput = it },
                        label = { Text("API Base URL") },
                        placeholder = { Text("https://booster-dashboard-nine.vercel.app") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Button(
                        onClick = {
                            scope.launch {
                                context.appPreferences.edit { it[KEY_BACKEND_URL] = urlInput.trim() }
                            }
                        }
                    ) { Text("저장") }
                }
            }

            Text(
                "버전 0.1 (개발 빌드)",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
