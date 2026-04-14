package com.hivemind.toolwindow

import com.hivemind.brand.HiveBrand
import com.hivemind.slack.SlackMessage
import com.hivemind.slack.SlackReader
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBScrollPane
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.swing.Swing
import java.awt.*
import javax.swing.*
import javax.swing.border.EmptyBorder

class ChatView(private val project: Project) : JPanel(BorderLayout()) {

    private val scope = CoroutineScope(Dispatchers.Main)
    private val messagesPanel = JPanel()
    private val scrollPane: JScrollPane

    init {
        background = HiveBrand.bgSurface
        messagesPanel.layout = BoxLayout(messagesPanel, BoxLayout.Y_AXIS)
        messagesPanel.background = HiveBrand.bgSurface

        val header = JPanel(FlowLayout(FlowLayout.LEFT)).apply {
            background = HiveBrand.bgPanel
            border = EmptyBorder(8, 12, 8, 12)
            add(JLabel("#hivemind").apply {
                font = HiveBrand.font(12, Font.BOLD)
                foreground = HiveBrand.YELLOW
            })
        }

        scrollPane = JBScrollPane(messagesPanel).apply {
            border = null
            verticalScrollBarPolicy = ScrollPaneConstants.VERTICAL_SCROLLBAR_AS_NEEDED
        }

        add(header,     BorderLayout.NORTH)
        add(scrollPane, BorderLayout.CENTER)

        startObservingMessages()
    }

    private fun startObservingMessages() {
        scope.launch {
            SlackReader.messages.collect { messages ->
                renderMessages(messages)
            }
        }
    }

    private fun renderMessages(messages: List<SlackMessage>) {
        messagesPanel.removeAll()

        if (messages.isEmpty()) {
            val placeholder = JLabel("Sin mensajes aún. Escribe en #hivemind").apply {
                foreground = HiveBrand.TEXT_DIM
                font = HiveBrand.font(11, Font.ITALIC)
                alignmentX = Component.CENTER_ALIGNMENT
                border = EmptyBorder(20, 0, 0, 0)
            }
            messagesPanel.add(placeholder)
        } else {
            messages.forEach { msg ->
                messagesPanel.add(createMessageComponent(msg))
            }
        }

        messagesPanel.revalidate()
        messagesPanel.repaint()

        SwingUtilities.invokeLater {
            val scrollBar = scrollPane.verticalScrollBar
            scrollBar.value = scrollBar.maximum
        }
    }

    private fun createMessageComponent(msg: SlackMessage): JPanel {
        val isHiveMindBot = msg.username.contains("HiveMind", ignoreCase = true)

        return JPanel(BorderLayout()).apply {
            background = if (isHiveMindBot) HiveBrand.bgSurfaceAlt else HiveBrand.bgSurface

            border = BorderFactory.createCompoundBorder(
                BorderFactory.createMatteBorder(0, 0, 1, 0, HiveBrand.border),
                EmptyBorder(8, 12, 8, 12)
            )

            val time = SlackReader.formatTimestamp(msg.ts)
            val user = msg.username.ifEmpty { msg.user.take(8) }
            val displayUser = if (isHiveMindBot) "HiveMind" else user

            val userLabel = JLabel("$displayUser  $time").apply {
                font = HiveBrand.font(10, Font.BOLD)
                foreground = if (isHiveMindBot) HiveBrand.YELLOW else HiveBrand.TEXT_MUTED
            }

            val textLabel = JLabel("<html><body style='width:200px'>${msg.text}</body></html>").apply {
                font = HiveBrand.font(11)
                foreground = HiveBrand.WHITE
            }

            add(userLabel, BorderLayout.NORTH)
            add(textLabel, BorderLayout.CENTER)

            maximumSize = Dimension(Int.MAX_VALUE, preferredSize.height + 10)
        }
    }
}
