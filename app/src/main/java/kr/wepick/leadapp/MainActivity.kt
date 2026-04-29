package kr.wepick.leadapp

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kr.wepick.leadapp.service.CallbackNotifier
import kr.wepick.leadapp.ui.nav.AppRoot
import kr.wepick.leadapp.ui.theme.BoosterLeadAppTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            // 알림 클릭으로 들어온 경우 intent extras 에서 callId 추출 → CallDetail 로 자동 이동
            var pendingCallId by remember {
                mutableStateOf(intent.getLongExtra(CallbackNotifier.EXTRA_CALL_ID, -1L)
                    .takeIf { it > 0L })
            }
            BoosterLeadAppTheme {
                AppRoot(initialCallId = pendingCallId)
            }
        }
    }

    /** 앱이 이미 실행 중일 때 새 알림 클릭 — 새 intent 처리. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        // 가장 단순한 방법: setContent 를 다시 호출하지 않고, 사용자가 다시 들어올 때
        // recompose 되어 적용. 또는 single-top 인 경우 onCreate 가 다시 호출되지 않음.
        // 더 정밀한 처리는 ViewModel + SharedFlow 를 거쳐 navigate 하는 게 정석이지만,
        // 사용 빈도(알림 도중 클릭) 가 낮으므로 다음 onCreate 시 적용 정도로 둠.
    }
}
