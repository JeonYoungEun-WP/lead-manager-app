package kr.wepick.leadapp.util

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStore
import kr.wepick.leadapp.BuildConfig

private const val PREFS_NAME = "lead_app_prefs"

val Context.appPreferences: DataStore<Preferences> by preferencesDataStore(name = PREFS_NAME)

/**
 * 유효 백엔드 URL — 설정 화면 입력값이 있으면 그것, 없으면 APK 내장 기본값.
 * (멀티유저 배포 시 사용자가 URL 을 직접 입력하지 않아도 동작하게)
 */
fun effectiveBackendUrl(userValue: String?): String {
    val v = userValue?.trim()?.trimEnd('/').orEmpty()
    return v.ifBlank { BuildConfig.DEFAULT_BACKEND_URL.trimEnd('/') }
}
