package kr.wepick.leadapp.ui.screens

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import kr.wepick.leadapp.service.CallFolderScanWorker
import kr.wepick.leadapp.util.appPreferences
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

val KEY_RECORDINGS_URI = stringPreferencesKey("recordings_folder_uri")
val KEY_BACKEND_URL    = stringPreferencesKey("backend_url")
val KEY_AGENT_NAME     = stringPreferencesKey("agent_name")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val uriFlow = remember {
        context.appPreferences.data.map { it[KEY_RECORDINGS_URI] }
    }
    val currentUri by uriFlow.collectAsState(initial = null)

    var urlInput by rememberSaveable { mutableStateOf("") }
    var agentInput by rememberSaveable { mutableStateOf("") }
    var prefsLoaded by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        if (!prefsLoaded) {
            val prefs = context.appPreferences.data.first()
            urlInput = prefs[KEY_BACKEND_URL] ?: ""
            agentInput = prefs[KEY_AGENT_NAME] ?: ""
            prefsLoaded = true
        }
    }

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

    var callLogGranted by remember {
        mutableStateOf(
            context.checkSelfPermission(Manifest.permission.READ_CALL_LOG) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    val callLogPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted -> callLogGranted = granted }

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
                    if (currentUri != null) {
                        var scanMsg by remember { mutableStateOf<String?>(null) }
                        OutlinedButton(onClick = {
                            WorkManager.getInstance(context).enqueue(
                                OneTimeWorkRequestBuilder<CallFolderScanWorker>().build()
                            )
                            scanMsg = "폴더 스캔을 시작했습니다."
                        }) { Text("지금 스캔") }
                        scanMsg?.let {
                            Text(it, style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }

            // 통화 기록 권한 (녹음 파일 → 번호 매칭에 필요)
            Card {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("통화 기록 권한", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(
                        "폰 연락처에 이름으로 저장된 번호는 녹음 파일명에 번호가 안 들어갑니다. " +
                        "이 권한이 있어야 녹음 시각 ↔ 통화기록의 실제 번호를 매칭해 리드와 연결할 수 있습니다.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (callLogGranted) {
                        Text("✓ 허용됨", style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary)
                    } else {
                        Button(onClick = {
                            callLogPermissionLauncher.launch(Manifest.permission.READ_CALL_LOG)
                        }) { Text("통화 기록 권한 허용") }
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

            // 상담사 이름
            Card {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("상담사 이름", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(
                        "어드민 업로드 시 누구의 통화인지 식별하는 데 사용됩니다.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    OutlinedTextField(
                        value = agentInput,
                        onValueChange = { agentInput = it },
                        label = { Text("이름") },
                        placeholder = { Text("예: 박상담") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Button(onClick = {
                        scope.launch {
                            context.appPreferences.edit { it[KEY_AGENT_NAME] = agentInput.trim() }
                        }
                    }) { Text("저장") }
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
                        placeholder = { Text("https://lead-manager-app-wepick.vercel.app") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
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
