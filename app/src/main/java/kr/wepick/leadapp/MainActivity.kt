package kr.wepick.leadapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import kr.wepick.leadapp.ui.nav.AppRoot
import kr.wepick.leadapp.ui.theme.BoosterLeadAppTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            BoosterLeadAppTheme {
                AppRoot()
            }
        }
    }
}
