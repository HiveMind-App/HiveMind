package com.hivemind.auth

import com.hivemind.config.Config
import com.hivemind.config.HiveMindSettings
import com.intellij.openapi.diagnostic.Logger
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import java.net.HttpURLConnection
import java.net.URI
import java.nio.charset.StandardCharsets

/**
 * Cliente de autenticacion contra Supabase GoTrue para el login Swing
 * del plugin. Tras login exitoso, obtiene automaticamente el perfil
 * del usuario y la configuracion del proyecto (Trello, Slack, OpenAI)
 * desde Supabase, sin necesidad de configuracion manual.
 */
object HiveMindAuth {

    private val log = Logger.getInstance(HiveMindAuth::class.java)
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private val supabaseUrl = Config.supabaseUrl.trimEnd('/')
    private val anonKey = Config.supabaseAnonKey

    data class AuthResult(
        val ok: Boolean,
        val errorMessage: String? = null,
        val userId: String? = null,
        val email: String? = null,
    )

    @Serializable
    private data class AuthResponse(
        val access_token: String = "",
        val refresh_token: String = "",
        val expires_in: Long = 3600L,
        val user: UserObj? = null,
    )

    @Serializable
    private data class UserObj(
        val id: String = "",
        val email: String = "",
    )

    fun signInWithPassword(email: String, password: String): AuthResult {
        val endpoint = "$supabaseUrl/auth/v1/token?grant_type=password"
        val payload = buildJsonObject {
            put("email", email.trim())
            put("password", password)
        }.toString()

        return try {
            val conn = (URI(endpoint).toURL().openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("apikey", anonKey)
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "application/json")
                doOutput = true
                connectTimeout = 8000
                readTimeout = 10000
            }
            conn.outputStream.use { it.write(payload.toByteArray(StandardCharsets.UTF_8)) }

            val code = conn.responseCode
            val body = try {
                (if (code in 200..299) conn.inputStream else conn.errorStream)
                    ?.bufferedReader(StandardCharsets.UTF_8)
                    ?.readText()
                    .orEmpty()
            } catch (_: Throwable) {
                ""
            }

            if (code !in 200..299) {
                val msg = extractError(body) ?: "Error $code"
                log.warn("HiveMindAuth: login fallo ($code): $msg")
                return AuthResult(ok = false, errorMessage = msg)
            }

            val resp = json.decodeFromString(AuthResponse.serializer(), body)
            if (resp.access_token.isBlank()) {
                return AuthResult(ok = false, errorMessage = "Respuesta sin access_token")
            }

            val userId = resp.user?.id.orEmpty()
            val userEmail = resp.user?.email?.ifBlank { email } ?: email

            val settings = HiveMindSettings.getInstance().state
            settings.accessToken = resp.access_token
            settings.refreshToken = resp.refresh_token
            settings.tokenExpiresAt = System.currentTimeMillis() + resp.expires_in * 1000L
            settings.currentUserEmail = userEmail
            settings.currentUserId = userId
            settings.email = userEmail

            // Tras login exitoso, cargar perfil + config del proyecto
            loadUserProfileAndProject(resp.access_token, userId, settings)

            AuthResult(ok = true, userId = userId, email = userEmail)
        } catch (t: Throwable) {
            log.warn("HiveMindAuth: exception en login: ${t.message}")
            AuthResult(
                ok = false,
                errorMessage = "No pude conectar con Supabase: ${t.message ?: t.javaClass.simpleName}",
            )
        }
    }

    /**
     * Carga el perfil del usuario y la config del proyecto tras login.
     * Llena HiveMindSettings con developerName, Trello, Slack, OpenAI
     * para que todo funcione sin configuracion manual.
     */
    private fun loadUserProfileAndProject(accessToken: String, userId: String, settings: HiveMindSettings.State) {
        try {
            // 1. Obtener perfil del usuario desde tabla 'users'
            val userProfile = supabaseGet(
                "/rest/v1/users?id=eq.$userId&select=name,role,trello_member_id",
                accessToken
            )
            val userArr = json.parseToJsonElement(userProfile).jsonArray
            if (userArr.isNotEmpty()) {
                val user = userArr[0].jsonObject
                val name = user["name"]?.jsonPrimitive?.content.orEmpty()
                if (name.isNotBlank()) {
                    settings.developerName = name
                    com.hivemind.interceptor.PromptInterceptor.localDeveloperName = name
                }
            }

            // 2. Obtener project_id desde 'user_projects'
            val upResp = supabaseGet(
                "/rest/v1/user_projects?user_id=eq.$userId&select=project_id,role",
                accessToken
            )
            val upArr = json.parseToJsonElement(upResp).jsonArray
            if (upArr.isEmpty()) {
                log.info("HiveMindAuth: usuario sin proyecto asignado")
                return
            }
            val projectId = upArr[0].jsonObject["project_id"]?.jsonPrimitive?.content.orEmpty()
            if (projectId.isBlank()) return
            settings.projectId = projectId

            // 3. Obtener config del proyecto (Trello, Slack, OpenAI)
            val projResp = supabaseGet(
                "/rest/v1/projects?id=eq.$projectId&select=name,project_code,trello_key,trello_token,trello_board_id,slack_webhook_url,openai_api_key",
                accessToken
            )
            val projArr = json.parseToJsonElement(projResp).jsonArray
            if (projArr.isEmpty()) return
            val proj = projArr[0].jsonObject

            fun str(key: String) = proj[key]?.jsonPrimitive?.content.orEmpty()

            settings.projectCode = str("project_code")
            settings.trelloKey = str("trello_key")
            settings.trelloToken = str("trello_token")
            settings.trelloBoard = str("trello_board_id")
            settings.slackWebhookUrl = str("slack_webhook_url")

            log.info("HiveMindAuth: config del proyecto '${str("name")}' cargada (Trello=${settings.trelloBoard.isNotBlank()}, Slack=${settings.slackWebhookUrl.isNotBlank()})")
        } catch (t: Throwable) {
            log.warn("HiveMindAuth: no se pudo cargar config del proyecto: ${t.message}")
        }
    }

    /** GET generico a Supabase REST con auth Bearer. */
    private fun supabaseGet(path: String, accessToken: String): String {
        val conn = (URI("$supabaseUrl$path").toURL().openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            setRequestProperty("apikey", anonKey)
            setRequestProperty("Authorization", "Bearer $accessToken")
            setRequestProperty("Accept", "application/json")
            connectTimeout = 5000
            readTimeout = 5000
        }
        return conn.inputStream.bufferedReader(StandardCharsets.UTF_8).readText()
    }

    fun signOut() {
        val settings = HiveMindSettings.getInstance().state
        settings.accessToken = ""
        settings.refreshToken = ""
        settings.tokenExpiresAt = 0L
        settings.currentUserEmail = ""
        settings.currentUserId = ""
    }

    fun isSignedIn(): Boolean {
        val s = HiveMindSettings.getInstance().state
        return s.accessToken.isNotBlank() && s.tokenExpiresAt > System.currentTimeMillis()
    }

    private fun extractError(body: String): String? {
        if (body.isBlank()) return null
        return try {
            val obj: JsonObject = json.parseToJsonElement(body).jsonObject
            val keys = listOf("error_description", "msg", "message", "error")
            for (k in keys) {
                val v = obj[k]?.jsonPrimitive?.content
                if (!v.isNullOrBlank()) return v
            }
            body.take(200)
        } catch (_: Throwable) {
            body.take(200)
        }
    }
}
