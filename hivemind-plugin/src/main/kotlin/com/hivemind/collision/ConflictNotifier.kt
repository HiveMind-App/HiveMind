package com.hivemind.collision

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.project.Project
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Muestra notificaciones balloon cuando Angel detecta un conflicto.
 * PROPIETARIO: Alvaro
 */
object ConflictNotifier {

    private val scope = CoroutineScope(Dispatchers.Main)
    private var project: Project? = null

    fun initialize(project: Project) {
        this.project = project
        scope.launch {
            ConflictEventBus.events.collect { conflict ->
                if (conflict.detected) show(conflict)
            }
        }
    }

    private fun show(conflict: ConflictResult) {
        val p = project ?: return
        NotificationGroupManager.getInstance()
            .getNotificationGroup("HiveMind Notifications")
            .createNotification(
                title   = "HiveMind – Conflicto detectado",
                content = "⚠️ <b>${conflict.conflictingUser}</b> también está trabajando aquí.<br/>" +
                          (conflict.suggestedAction ?: "Coordina antes de continuar."),
                type    = NotificationType.WARNING
            )
            .notify(p)
    }
}
