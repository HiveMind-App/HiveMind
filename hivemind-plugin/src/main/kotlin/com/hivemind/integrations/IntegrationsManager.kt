package com.hivemind.integrations

import com.hivemind.events.IntentionEvent
import com.hivemind.slack.SlackReader
import com.hivemind.slack.SlackService
import com.hivemind.trello.TrelloMemberMap
import com.hivemind.trello.TrelloRepository
import com.hivemind.trello.TrelloService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Punto de entrada único para todas las integraciones externas.
 * Orquesta Trello y Slack de forma coordinada.
 * PROPIETARIO: Carlos
 */
object IntegrationsManager {

    private val scope = CoroutineScope(Dispatchers.IO)
    
    // Cache para evitar duplicados en Trello/Slack (Hackathon Fix)
    private var lastIntentionText: String = ""
    private var lastIntentionTime: Long = 0

    /** Llamar desde HiveMindStartupActivity al arrancar el plugin. */
    fun initialize() {
        TrelloRepository.startPolling(intervalMs = 10_000)
        SlackReader.startPolling(intervalMs = 5_000)
    }
/** Gestiona un nuevo evento de intención: crea tarjeta Trello + notifica Slack. */
fun onIntentionDetected(event: IntentionEvent) {
    // Si la intención es exactamente igual a la última, la ignoramos por completo
    if (event.intentText.trim() == lastIntentionText.trim()) {
        return
    }

    lastIntentionText = event.intentText.trim()
    val now = System.currentTimeMillis()
    lastIntentionTime = now

    scope.launch {
            TrelloService.createInProgressCard(
                developerName     = event.developerName,
                intentText        = event.intentText,
                developerTrelloId = TrelloMemberMap.getIdByName(event.developerName)
            )
            SlackService.notifyIntent(
                developerName = event.developerName,
                intentText    = event.intentText,
                moduleArea    = event.moduleArea
            )
            delay(1000)
            TrelloRepository.refreshData()
        }
    }

    /** Notifica un conflicto en Slack. */
    fun onConflictDetected(dev1: String, dev2: String, area: String) {
        scope.launch { SlackService.notifyConflict(dev1, dev2, area) }
    }
}