package com.hivemind.supabase

import com.hivemind.model.TeamSession
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.decodeOldRecord
import io.github.jan.supabase.realtime.decodeRecord
import io.github.jan.supabase.realtime.postgresChangeFlow
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import com.hivemind.config.HiveMindSettings
import kotlinx.serialization.Serializable

@Serializable
private data class IntentRecord(
    val user_name: String,
    val intent_text: String,
    val source: String = "plugin"
)

/**
 * Mantiene el estado del equipo en tiempo real vía Supabase Realtime.
 *
 * Productores: Supabase (cambios en team_sessions llegan automáticamente)
 * Consumidores:
 *   - Angel (PromptInterceptor) → lee getTeamContextString()
 *   - Angel (ConflictDetector)  → lee teamState.value
 *   - Alvaro (HiveMindStartupActivity) → actualiza HiveMindState
 *
 * PROPIETARIO: Alejandro
 */
object TeamContextManager {

    private val scope = CoroutineScope(Dispatchers.IO)

    private val _teamState = MutableStateFlow<Map<String, TeamSession>>(emptyMap())
    val teamState: StateFlow<Map<String, TeamSession>> = _teamState.asStateFlow()

    fun startListening() {
        scope.launch {
            try {
                SupabaseManager.connect()

                val channel = SupabaseManager.client.channel("team-events-channel")
                
                // 1. Escuchar sesiones
                val sessionFlow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
                    table = "team_sessions"
                }

                // 2. Escuchar intenciones (para Trello -> TODO automático)
                val intentFlow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
                    table = "code_intents"
                }

                channel.subscribe()

                // Manejar sesiones
                launch {
                    sessionFlow.collect { action ->
                        when (action) {
                            is PostgresAction.Insert -> {
                                val s = action.decodeRecord<TeamSession>()
                                _teamState.value = _teamState.value.toMutableMap().also { it[s.userName] = s }
                            }
                            is PostgresAction.Update -> {
                                val s = action.decodeRecord<TeamSession>()
                                _teamState.value = _teamState.value.toMutableMap().also { it[s.userName] = s }
                            }
                            is PostgresAction.Delete -> {
                                val old = action.decodeOldRecord<TeamSession>()
                                _teamState.value = _teamState.value.toMutableMap().also { it.remove(old.userName) }
                            }
                            else -> {}
                        }
                    }
                }

                // Manejar intenciones automaticas de Trello
                // (deshabilitado: TrelloToTodoService nunca llego a existir
                // en el repo y rompia la compilacion. Lo recuperamos cuando
                // el modulo trello/ exponga un helper de inserción de TODOs.)
                launch {
                    intentFlow.collect { action ->
                        if (action is PostgresAction.Insert) {
                            val record = action.decodeRecord<IntentRecord>()
                            val myName = HiveMindSettings.getInstance().state.developerName
                            if (record.source == "trello" && record.user_name == myName) {
                                println("HiveMind: intencion Trello recibida → ${record.intent_text}")
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                println("HiveMind WARNING: TeamContextManager failed to start: ${e.message}")
            }
        }
    }

    /** Devuelve el contexto del equipo como texto para concatenar al prompt de la IA. */
    fun getTeamContextString(excludeUser: String): String =
        _teamState.value
            .filter { (name, s) -> name != excludeUser && s.isActive }
            .map { (_, s) ->
                "${s.userName} está trabajando en: ${s.activeIntent ?: "algo"}" +
                s.moduleArea?.let { " (módulo: $it)" }.orEmpty()
            }
            .joinToString(". ")
            .ifEmpty { "Ningún compañero activo en este momento." }
}
