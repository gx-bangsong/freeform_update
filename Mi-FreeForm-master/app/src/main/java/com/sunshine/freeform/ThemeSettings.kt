package com.sunshine.freeform

import android.content.Context
import androidx.appcompat.app.AppCompatDelegate
import androidx.preference.PreferenceManager

/** Persisted UI theme; follow the device setting until the user chooses an override. */
object ThemeSettings {
    const val KEY = "app_theme"

    fun apply(context: Context) {
        val value = PreferenceManager.getDefaultSharedPreferences(context)
            .getString(KEY, "system")
        AppCompatDelegate.setDefaultNightMode(when (value) {
            "light" -> AppCompatDelegate.MODE_NIGHT_NO
            "dark" -> AppCompatDelegate.MODE_NIGHT_YES
            else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
        })
    }
}
