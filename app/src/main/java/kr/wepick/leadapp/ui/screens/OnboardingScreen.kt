package kr.wepick.leadapp.ui.screens

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kr.wepick.leadapp.util.appPreferences

/** 온보딩 완료 플래그 — 마지막 단계(배터리)까지 본 뒤 true. */
val KEY_ONBOARDING_DONE = booleanPreferencesKey("onboarding_done")

/** 파이프라인 동작에 필수인 런타임 권한들. 하나라도 빠지면 온보딩 게이트가 다시 뜬다. */
val REQUIRED_PERMISSIONS = arrayOf(
    Manifest.permission.CALL_PHONE,
    Manifest.permission.READ_PHONE_STATE,
    Manifest.permission.READ_CALL_LOG,
    Manifest.permission.POST_NOTIFICATIONS,
)

fun requiredPermissionsGranted(ctx: Context): Boolean =
    REQUIRED_PERMISSIONS.all {
        ctx.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED
    }

/**
 * 초기 설치 온보딩 — 메인 화면 진입 전에 반드시 순서대로 완료해야 하는 설정 게이트.
 *
 *  1. 상담사 이름 (필수) — 어드민에 통화가 이 이름으로 표시됨
 *  2. 필수 권한 (필수) — 전화/통화기록/알림
 *  3. 녹음 폴더 SAF 권한 (필수) — /Recordings/Call/
 *  4. 배터리 최적화 예외 (권장, 건너뛰기 가능)
 *
 * AppRoot 가 (이름/권한/SAF 미충족 || 온보딩 미완료) 일 때 이 화면을 띄운다.
 * 권한이 나중에 회수되면 해당 단계부터 다시 보인다.
 */
@Composable
fun OnboardingScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // ── 상태 ──────────────────────────────────────────────
    var nameInput by rememberSaveable { mutableStateOf("") }
    var nameSaved by remember { mutableStateOf(false) }
    var permTick by remember { mutableStateOf(0) }
    var safSet by remember { mutableStateOf(false) }
    var batteryExempt by remember { mutableStateOf(isBatteryExempt(context)) }
    var step by rememberSaveable { mutableStateOf(0) } // 0 = 초기 계산 전
    var permDeniedOnce by remember { mutableStateOf(false) }

    val permsOk = remember(permTick) { requiredPermissionsGranted(context) }

    // 시스템 설정 갔다가 돌아오면 권한/배터리 상태 재확인
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val obs = LifecycleEventObserver { _, e ->
            if (e == Lifecycle.Event.ON_RESUME) {
                permTick++
                batteryExempt = isBatteryExempt(context)
            }
        }
        lifecycleOwner.lifecycle.addObserver(obs)
        onDispose { lifecycleOwner.lifecycle.removeObserver(obs) }
    }

    // 첫 진입: 기존 설정 로드 + 시작 단계 계산 (이미 끝난 단계는 건너뜀)
    LaunchedEffect(Unit) {
        val prefs = context.appPreferences.data.first()
        val name = prefs[KEY_AGENT_NAME]?.trim().orEmpty()
        nameInput = name
        nameSaved = name.isNotBlank()
        safSet = !prefs[KEY_RECORDINGS_URI].isNullOrBlank()
        val granted = requiredPermissionsGranted(context)
        step = when {
            name.isBlank() -> 1
            !granted -> 2
            !safSet -> 3
            else -> 4
        }
        // 모든 필수 조건 충족 + 배터리도 이미 예외면 (기존 사용자) 게이트 즉시 통과
        if (step == 4 && isBatteryExempt(context)) {
            context.appPreferences.edit { it[KEY_ONBOARDING_DONE] = true }
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        permTick++
        if (result.values.any { !it }) permDeniedOnce = true
    }

    val folderPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocumentTree(),
    ) { uri ->
        if (uri != null) {
            context.contentResolver.takePersistableUriPermission(
                uri, Intent.FLAG_GRANT_READ_URI_PERMISSION,
            )
            scope.launch {
                context.appPreferences.edit { it[KEY_RECORDINGS_URI] = uri.toString() }
                safSet = true
            }
        }
    }

    fun finishOnboarding() {
        scope.launch {
            context.appPreferences.edit { it[KEY_ONBOARDING_DONE] = true }
        }
    }

    // ── UI ────────────────────────────────────────────────
    Scaffold { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).padding(24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Spacer(Modifier.height(16.dp))
            Text("처음 설정", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(
                "앱을 사용하려면 아래 단계를 순서대로 완료해주세요.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (step in 1..4) {
                LinearProgressIndicator(
                    progress = { (step - 1) / 4f },
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    "단계 $step / 4",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            when (step) {
                1 -> StepCard(
                    title = "1. 상담사 이름",
                    description = "통화 기록이 관리자 화면에 이 이름으로 표시됩니다.",
                ) {
                    OutlinedTextField(
                        value = nameInput,
                        onValueChange = { nameInput = it },
                        label = { Text("이름") },
                        placeholder = { Text("예: 박상담") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Button(
                        enabled = nameInput.isNotBlank(),
                        onClick = {
                            val name = nameInput.trim()
                            scope.launch {
                                context.appPreferences.edit { it[KEY_AGENT_NAME] = name }
                                nameSaved = true
                                step = 2
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("저장하고 다음") }
                }

                2 -> StepCard(
                    title = "2. 필수 권한",
                    description = "통화 감지·기록 매칭·알림에 필요한 권한입니다. 모두 허용해야 다음으로 진행됩니다.",
                ) {
                    PermissionRow("전화 걸기", Manifest.permission.CALL_PHONE, permTick)
                    PermissionRow("전화 상태 (통화 종료 감지)", Manifest.permission.READ_PHONE_STATE, permTick)
                    PermissionRow("통화 기록 (번호 매칭)", Manifest.permission.READ_CALL_LOG, permTick)
                    PermissionRow("알림 (재연락 알림)", Manifest.permission.POST_NOTIFICATIONS, permTick)
                    Spacer(Modifier.height(4.dp))
                    if (!permsOk) {
                        Button(
                            onClick = { permissionLauncher.launch(REQUIRED_PERMISSIONS) },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("권한 허용") }
                        if (permDeniedOnce) {
                            Text(
                                "거부된 권한이 있습니다. 다시 시도하거나, 팝업이 더 안 뜨면 아래 버튼으로 시스템 설정에서 직접 허용해주세요.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                            OutlinedButton(
                                onClick = { openAppSettings(context) },
                                modifier = Modifier.fillMaxWidth(),
                            ) { Text("시스템 설정 열기") }
                        }
                    } else {
                        Button(
                            onClick = { step = 3 },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("다음") }
                    }
                }

                3 -> StepCard(
                    title = "3. 통화 녹음 폴더",
                    description = "Samsung 기본 녹음 위치인 [내장 저장공간 → Recordings → Call] 폴더를 선택하고 \"이 폴더 사용\" 을 눌러주세요.",
                ) {
                    if (safSet) {
                        Text(
                            "✓ 폴더 지정 완료",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Button(onClick = { step = 4 }, modifier = Modifier.fillMaxWidth()) { Text("다음") }
                    } else {
                        Button(
                            onClick = { folderPicker.launch(null) },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("녹음 폴더 선택") }
                    }
                    Text(
                        "※ 이 앱은 등록된 잠재고객 번호와의 통화 녹음만 읽습니다. 가족·지인 통화는 접근하지 않습니다.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                4 -> StepCard(
                    title = "4. 배터리 최적화 예외 (권장)",
                    description = "예외로 등록하면 절전 모드에서도 통화 처리가 지연되지 않습니다.",
                ) {
                    if (batteryExempt) {
                        Text(
                            "✓ 예외 등록 완료",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Button(onClick = { finishOnboarding() }, modifier = Modifier.fillMaxWidth()) {
                            Text("시작하기")
                        }
                    } else {
                        Button(
                            onClick = { requestBatteryExemption(context) },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("배터리 예외 허용") }
                        TextButton(
                            onClick = { finishOnboarding() },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("건너뛰고 시작하기") }
                    }
                }
            }

            // 마지막 안내 — Samsung 자동 녹음은 시스템 설정이라 앱이 대신 못 켬
            if (step >= 3) {
                Card {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("⚠ 추가 확인", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        Text(
                            "전화 앱 → ⋮ → 설정 → 통화 녹음 → '모든 통화 자동 녹음' 이 켜져 있어야 합니다.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StepCard(
    title: String,
    description: String,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            content()
        }
    }
}

@Composable
private fun PermissionRow(label: String, permission: String, permTick: Int) {
    val context = LocalContext.current
    val granted = remember(permTick) {
        context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            if (granted) "✓" else "○",
            color = if (granted) MaterialTheme.colorScheme.primary
            else MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.width(28.dp),
        )
        Text(label, style = MaterialTheme.typography.bodyMedium)
    }
}

private fun isBatteryExempt(ctx: Context): Boolean {
    val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return false
    return pm.isIgnoringBatteryOptimizations(ctx.packageName)
}

private fun requestBatteryExemption(ctx: Context) {
    runCatching {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:${ctx.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        ctx.startActivity(intent)
    }.onFailure {
        runCatching {
            val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            ctx.startActivity(fallback)
        }
    }
}

private fun openAppSettings(ctx: Context) {
    runCatching {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.parse("package:${ctx.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        ctx.startActivity(intent)
    }
}
