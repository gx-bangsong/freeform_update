package com.sunshine.freeform

import android.content.Context
import android.content.res.Configuration
import android.view.ContextThemeWrapper
import androidx.appcompat.app.AppCompatDelegate
import androidx.preference.PreferenceManager

/** Persisted UI theme; follow the device setting until the user chooses an override. */
object ThemeSettings {
    const val KEY = "app_theme"

    // Service-created windows do not have an AppCompatDelegate. Resolve their
    // resources explicitly; new windows pick up the saved theme without restarting services.
    fun wrap(context: Context): Context {
        val value = PreferenceManager.getDefaultSharedPreferences(context)
            .getString(KEY, "system")
        val configuration = Configuration(context.resources.configuration)
        val nightMode = when (value) {
            "light" -> Configuration.UI_MODE_NIGHT_NO
            "dark" -> Configuration.UI_MODE_NIGHT_YES
            else -> context.applicationContext.resources.configuration.uiMode and
                Configuration.UI_MODE_NIGHT_MASK
        }
        configuration.uiMode = (configuration.uiMode and
            Configuration.UI_MODE_NIGHT_MASK.inv()) or nightMode
        return ContextThemeWrapper(context.createConfigurationContext(configuration), R.style.Theme_FreeForm)
    }

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
