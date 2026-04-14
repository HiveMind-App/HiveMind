package com.hivemind.interceptor

import com.hivemind.collision.ConflictDetector
import com.hivemind.collision.ConflictEventBus
import com.hivemind.events.IntentionEvent
import com.hivemind.supabase.SupabaseFunctionsClient
import com.hivemind.toolwindow.HiveMindState
import com.intellij.openapi.application.ApplicationManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * EL CORAZON DE HIVEMIND.
 *
 * Flujo de una intencion detectada:
 *   1. Registra la intencion del dev en Supabase (equipo la ve en el heatmap)
 *   2. Detecta si hay conflicto de area con algun companero
 *   3. Emite el conflicto (balloon + inlay hints)
 *   4. Dispara integraciones Trello + Slack
 *
 * La generacion de codigo la hace el CLI (Gemini via MCP tools),
 * no el plugin. El plugin es el sensor + dashboard del IDE.
 *
 * PROPIETARIO: Angel
 */
object PromptInterceptor {

    var localDeveloperName: String = "Dev"

    private val scope = CoroutineScope(Dispatchers.IO)

    /** Punto de entrada. Alvaro llama a este metodo desde el DocumentListener. */
    fun onIntentDetected(event: IntentionEvent) {
        scope.launch {
            // 1. Registrar intencion en Supabase (equipo la ve)
            SupabaseFunctionsClient.registerIntent(
                userName   = localDeveloperName,
                intentText = event.intentText,
                filePath   = event.filePath,
                moduleArea = event.moduleArea
            )

            // 2. Detectar conflictos por area
            val conflict = ConflictDetector.detect(
                myIntent    = event.intentText,
                myArea      = event.moduleArea,
                excludeUser = localDeveloperName
            )

            // 3. Emitir conflicto si existe
            if (conflict.detected) {
                ConflictEventBus.emit(conflict)
                ApplicationManager.getApplication().invokeLater {
                    HiveMindState.updateConflict("⚠️ Conflicto con ${conflict.conflictingUser}")
                }
            } else {
                ApplicationManager.getApplication().invokeLater {
                    HiveMindState.updateConflict(null)
                }
            }

            // 4. Notificar integraciones (Trello card + Slack webhook)
            com.hivemind.integrations.IntegrationsManager.onIntentionDetected(event)
        }
    }

    /**
     * Funcion de utilidad para inferir el area del modulo segun la ruta del archivo.
     */
    fun inferModuleArea(filePath: String): String {
        return when {
            filePath.contains("/auth/")     -> "auth"
            filePath.contains("/db/")       -> "database"
            filePath.contains("/ui/")       -> "ui"
            filePath.contains("/api/")      -> "api"
            filePath.contains("/model/")    -> "model"
            filePath.contains("/service/")  -> "service"
            else -> "general"
        }
    }
}
