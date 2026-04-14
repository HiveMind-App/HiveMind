package com.hivemind.toolwindow

import com.hivemind.model.TeamSession
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Estado compartido del ToolWindow.
 *
 * Productores:
 *   - HiveMindStartupActivity → updateTeamSessions(), updateConflict()
 *   - PromptInterceptor → updateConflict()
 *
 * Consumidores:
 *   - HiveMindPanel, KanbanView, ChatView → observa los StateFlows
 *
 * PROPIETARIO: Shared
 */
object HiveMindState {

    private val _teamSessions = MutableStateFlow<List<TeamSession>>(emptyList())
    val teamSessions: StateFlow<List<TeamSession>> = _teamSessions.asStateFlow()

    private val _activeConflict = MutableStateFlow<String?>(null)
    val activeConflict: StateFlow<String?> = _activeConflict.asStateFlow()

    fun updateTeamSessions(sessions: List<TeamSession>) { _teamSessions.value = sessions }
    fun updateConflict(message: String?) { _activeConflict.value = message }
}
