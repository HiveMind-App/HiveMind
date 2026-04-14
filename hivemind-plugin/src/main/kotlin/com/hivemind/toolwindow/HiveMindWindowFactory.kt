package com.hivemind.toolwindow

import com.hivemind.brand.HiveBrand
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import java.awt.BorderLayout
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.SwingConstants

/**
 * Factory que crea el contenido del ToolWindow.
 * IntelliJ llama a createToolWindowContent() al abrir el panel.
 */
class HiveMindWindowFactory : ToolWindowFactory {

    private val log = Logger.getInstance(HiveMindWindowFactory::class.java)

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        // Defensivo: cualquier excepcion al construir el panel deberia
        // mostrar un placeholder en lugar de "Nothing to show".
        val component: javax.swing.JComponent = try {
            HiveMindPanel(project)
        } catch (t: Throwable) {
            log.error("HiveMind: error creando HiveMindPanel", t)
            buildErrorPlaceholder(t)
        }

        val content = ContentFactory.getInstance().createContent(component, "", false)
        toolWindow.contentManager.addContent(content)
    }

    private fun buildErrorPlaceholder(t: Throwable): JPanel = JPanel(BorderLayout()).apply {
        background = HiveBrand.bgSurface
        val label = JLabel(
            "<html><div style='text-align:center; padding:30px;'>" +
                "<h2 style='color:#F9C900; font-family: sans-serif;'>HiveMind</h2>" +
                "<p style='color:#FFFFFF;'>Error al iniciar el plugin:</p>" +
                "<p style='color:#A0A0A0;'>${t.message ?: t.javaClass.simpleName}</p>" +
                "</div></html>",
            SwingConstants.CENTER,
        )
        add(label, BorderLayout.CENTER)
    }
}
