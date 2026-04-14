package com.hivemind.slack

import com.hivemind.config.HiveMindSettings
import io.ktor.client.*
import io.ktor.client.engine.cio.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.json.Json

/**
 * Servicio de notificaciones a Slack usando Block Kit para un formato premium.
 * PROPIETARIO: Carlos / Alejandro
 */
object SlackService {

    private val webhookUrl get() = HiveMindSettings.getInstance().state.slackWebhookUrl

    private val client = HttpClient(CIO) {
        install(ContentNegotiation) {
            json(Json { ignoreUnknownKeys = true })
        }
    }

    suspend fun notifyIntent(developerName: String, intentText: String, moduleArea: String) {
        val url = webhookUrl
        if (url.isNullOrEmpty()) return

        runCatching {
            val message = SlackMessage(
                text = "$developerName ha expresado una intención",
                blocks = listOf(
                    SlackBlock(
                        type = "header",
                        text = SlackText("plain_text", "🚀 NUEVA INTENCIÓN CAPTURADA")
                    ),
                    SlackBlock(
                        type = "section",
                        text = SlackText("mrkdwn", "*$developerName* está trabajando en:\n>_\"$intentText\"_")
                    ),
                    SlackBlock(
                        type = "context",
                        elements = listOf(SlackText("mrkdwn", "📍 Área: `$moduleArea`  |  🧠 _Sincronizado vía HiveMind_"))
                    )
                )
            )
            client.post(url) {
                contentType(ContentType.Application.Json)
                setBody(message)
            }
        }
    }

    suspend fun notifyConflict(dev1: String, dev2: String, area: String) {
        val url = webhookUrl
        if (url.isNullOrEmpty()) return

        runCatching {
            val message = SlackMessage(
                text = "⚠️ Alerta de Colisión Detectada",
                blocks = listOf(
                    SlackBlock(
                        type = "header",
                        text = SlackText("plain_text", "⚠️ COLISIÓN SEMÁNTICA")
                    ),
                    SlackBlock(
                        type = "section",
                        text = SlackText("mrkdwn", "*$dev1* y *$dev2* están solapados en el área: `$area`.\n*Sugerencia:* Coordinad vuestro trabajo para evitar duplicidades.")
                    ),
                    SlackBlock(
                        type = "divider"
                    )
                )
            )
            client.post(url) {
                contentType(ContentType.Application.Json)
                setBody(message)
            }
        }
    }
}
