package com.hivemind.config

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service

/**
 * Configuración persistente del plugin.
 * PROPIETARIO: Alvaro / Alejandro
 */
@State(name = "HiveMindSettings", storages = [Storage("hivemind.xml")])
class HiveMindSettings : PersistentStateComponent<HiveMindSettings.State> {

    data class State(
        var developerName: String = "Dev",
        var email: String = "",
        var slackWebhookUrl: String = "",
        var trelloKey: String = "",
        var trelloToken: String = "",
        var trelloBoard: String = "",
        var watchtowerUrl: String = "https://hivemind.aaangelmartin.com",
        // Supabase config — hardcodeada en Config.kt, estos campos se mantienen
        // por compatibilidad con HiveMindAuth que los lee.
        var supabaseUrl: String = Config.supabaseUrl,
        var supabaseAnonKey: String = Config.supabaseAnonKey,
        var projectCode: String = "",
        var projectId: String = "",
        var wizardCompleted: Boolean = false,
        var enabled: Boolean = true,
        // --- Auth session (se rellena tras login Swing) ---
        var accessToken: String = "",
        var refreshToken: String = "",
        var tokenExpiresAt: Long = 0L,
        var currentUserEmail: String = "",
        var currentUserId: String = ""
    )

    private var myState = State()
    override fun getState() = myState
    override fun loadState(state: State) { myState = state }

    companion object {
        fun getInstance(): HiveMindSettings = service()
    }
}
