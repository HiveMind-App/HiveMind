package com.hivemind

import com.hivemind.collision.ConflictNotifier
import com.hivemind.config.HiveMindSettings
import com.hivemind.integrations.IntegrationsManager
import com.hivemind.interceptor.PromptInterceptor
import com.hivemind.supabase.TeamContextManager
import com.hivemind.toolwindow.HiveMindState
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Se ejecuta al abrir un proyecto. Inicializa todos los subsistemas de HiveMind.
 * Orden: Supabase → Integraciones → Conflict Notifier → Interceptor callback
 */
class HiveMindStartupActivity : StartupActivity {

    private val LOG = Logger.getInstance(HiveMindStartupActivity::class.java)
    private val scope = CoroutineScope(Dispatchers.IO)

    override fun runActivity(project: Project) {
        val devName = HiveMindSettings.getInstance().state.developerName
        PromptInterceptor.localDeveloperName = devName
        LOG.info("HiveMind iniciado para: $devName en proyecto: ${project.name}")

        scope.launch { TeamContextManager.startListening() }

        IntegrationsManager.initialize()
        ConflictNotifier.initialize(project)

        // El estado y las alertas ahora se gestionan dentro de PromptInterceptor.onIntentDetected

        // Mantener el estado del equipo sincronizado con el ToolWindow
        scope.launch {
            TeamContextManager.teamState.collect { teamMap ->
                HiveMindState.updateTeamSessions(teamMap.values.toList())
            }
        }

        LOG.info("HiveMind listo ✓")
    }
}
