package com.hivemind.supabase

import com.hivemind.config.Config
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.engine.cio.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class TeamContextResponse(
    val team_context: String,
    val active_members: List<ActiveMember> = emptyList(),
    val conflict_detected: Boolean,
    val conflicting_user: String? = null,
    val conflict_area: String? = null
)

@Serializable
data class ActiveMember(
    val userName: String,
    val activeIntent: String,
    val moduleArea: String? = null
)

object SupabaseFunctionsClient {

    private val baseUrl get() = Config.supabaseUrl + "/functions/v1"
    private val anonKey get() = Config.supabaseAnonKey

    private val client = HttpClient(CIO) {
        install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
    }

    /** Registra la intención activa del dev para que el equipo la vea. */
    suspend fun registerIntent(
        userName: String,
        intentText: String,
        filePath: String,
        moduleArea: String
    ) {
        runCatching {
            val settings = com.hivemind.config.HiveMindSettings.getInstance().state
            client.post("$baseUrl/register-intent") {
                header(HttpHeaders.Authorization, "Bearer $anonKey")
                contentType(ContentType.Application.Json)
                setBody(mapOf(
                    "user_name"   to userName,
                    "intent_text" to intentText,
                    "file_path"   to filePath,
                    "module_area" to moduleArea,
                    "role"        to "Developer", // Hardcoded para demo
                    "git_branch"  to "main"       // Hardcoded para demo
                ))
            }
        }.onFailure { println("HiveMind WARNING: registerIntent failed: ${it.message}") }
    }

    /** Obtiene el contexto del equipo para enriquecer el prompt de la IA. */
    suspend fun getTeamContext(
        requestingUser: String,
        currentIntent: String,
        currentArea: String
    ): TeamContextResponse = runCatching {
        client.post("$baseUrl/build-team-context") {
            header(HttpHeaders.Authorization, "Bearer $anonKey")
            contentType(ContentType.Application.Json)
            setBody(mapOf(
                "requesting_user" to requestingUser,
                "current_intent"  to currentIntent,
                "current_area"    to currentArea
            ))
        }.body<TeamContextResponse>()
    }.getOrElse {
        println("HiveMind WARNING: getTeamContext failed: ${it.message}")
        TeamContextResponse("No se pudo obtener el contexto del equipo.", conflict_detected = false)
    }
}
