package kr.wepick.leadapp.util

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStore

private const val PREFS_NAME = "lead_app_prefs"

val Context.appPreferences: DataStore<Preferences> by preferencesDataStore(name = PREFS_NAME)
