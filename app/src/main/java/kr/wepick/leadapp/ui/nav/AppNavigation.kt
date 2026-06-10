package kr.wepick.leadapp.ui.nav

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import kr.wepick.leadapp.ui.screens.CallDetailScreen
import kr.wepick.leadapp.ui.screens.CallLogScreen
import kr.wepick.leadapp.ui.screens.KEY_AGENT_NAME
import kr.wepick.leadapp.ui.screens.KEY_ONBOARDING_DONE
import kr.wepick.leadapp.ui.screens.KEY_RECORDINGS_URI
import kr.wepick.leadapp.ui.screens.LeadDetailScreen
import kr.wepick.leadapp.ui.screens.LeadEditScreen
import kr.wepick.leadapp.ui.screens.LeadListScreen
import kr.wepick.leadapp.ui.screens.OnboardingScreen
import kr.wepick.leadapp.ui.screens.SettingsScreen
import kr.wepick.leadapp.ui.screens.requiredPermissionsGranted
import kr.wepick.leadapp.util.appPreferences

@Composable
fun AppRoot(initialCallId: Long? = null) {
    // ── 온보딩 게이트 — 이름/권한/녹음폴더가 다 준비돼야 메인 진입 ──
    val context = LocalContext.current
    val prefs by context.appPreferences.data.collectAsState(initial = null)
    var permTick by remember { mutableStateOf(0) }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val obs = LifecycleEventObserver { _, e ->
            if (e == Lifecycle.Event.ON_RESUME) permTick++
        }
        lifecycleOwner.lifecycle.addObserver(obs)
        onDispose { lifecycleOwner.lifecycle.removeObserver(obs) }
    }
    val p = prefs ?: return // DataStore 첫 로딩 (한 프레임)
    val permsOk = remember(permTick) { requiredPermissionsGranted(context) }
    val needsOnboarding = p[KEY_ONBOARDING_DONE] != true ||
        p[KEY_AGENT_NAME]?.trim().isNullOrBlank() ||
        p[KEY_RECORDINGS_URI].isNullOrBlank() ||
        !permsOk
    if (needsOnboarding) {
        OnboardingScreen()
        return
    }

    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route

    // 알림 클릭 등으로 들어온 경우 해당 통화 상세로 자동 이동.
    LaunchedEffect(initialCallId) {
        if (initialCallId != null && initialCallId > 0L) {
            navController.navigate(Route.CallDetail.build(initialCallId))
        }
    }

    Scaffold(
        bottomBar = {
            // 하단 탭은 최상위 3개 화면에서만 표시
            if (currentRoute in BOTTOM_NAV.map { it.path }) {
                NavigationBar {
                    BOTTOM_NAV.forEach { route ->
                        val selected = currentRoute == route.path
                        val icon = when (route) {
                            Route.LeadList -> Icons.Filled.People
                            Route.CallLog -> Icons.Filled.Phone
                            Route.Settings -> Icons.Filled.Settings
                            else -> Icons.Filled.People
                        }
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                if (!selected) navController.navigate(route.path) {
                                    popUpTo(Route.LeadList.path) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(icon, contentDescription = route.label) },
                            label = { Text(route.label) },
                        )
                    }
                }
            }
        }
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = Route.LeadList.path,
            modifier = Modifier.padding(padding)
        ) {
            composable(Route.LeadList.path) {
                LeadListScreen(
                    onLeadClick = { navController.navigate(Route.LeadDetail.build(it)) },
                    onAddClick = { navController.navigate(Route.LeadEdit.build(0)) },
                )
            }
            composable(Route.CallLog.path) {
                CallLogScreen(
                    onCallClick = { navController.navigate(Route.CallDetail.build(it)) },
                )
            }
            composable(Route.Settings.path) {
                SettingsScreen()
            }
            composable(
                Route.LeadDetail.path,
                arguments = listOf(navArgument(Route.LeadDetail.ARG_ID) { type = NavType.LongType }),
            ) { entry ->
                val id = entry.arguments?.getLong(Route.LeadDetail.ARG_ID) ?: 0L
                LeadDetailScreen(
                    leadId = id,
                    onBack = { navController.popBackStack() },
                    onEdit = { navController.navigate(Route.LeadEdit.build(id)) },
                    onCallClick = { callId -> navController.navigate(Route.CallDetail.build(callId)) },
                )
            }
            composable(
                Route.LeadEdit.path,
                arguments = listOf(navArgument(Route.LeadEdit.ARG_ID) { type = NavType.LongType }),
            ) { entry ->
                val id = entry.arguments?.getLong(Route.LeadEdit.ARG_ID) ?: 0L
                LeadEditScreen(
                    leadId = if (id == 0L) null else id,
                    onDone = { navController.popBackStack() },
                    onCancel = { navController.popBackStack() },
                )
            }
            composable(
                Route.CallDetail.path,
                arguments = listOf(navArgument(Route.CallDetail.ARG_ID) { type = NavType.LongType }),
            ) { entry ->
                val id = entry.arguments?.getLong(Route.CallDetail.ARG_ID) ?: 0L
                CallDetailScreen(
                    callId = id,
                    onBack = { navController.popBackStack() },
                )
            }
        }
    }
}
