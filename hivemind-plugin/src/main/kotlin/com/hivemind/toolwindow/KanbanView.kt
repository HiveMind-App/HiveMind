package com.hivemind.toolwindow

import com.hivemind.brand.HiveBrand
import com.hivemind.trello.TrelloCard
import com.hivemind.trello.TrelloRepository
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBScrollPane
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.swing.Swing
import java.awt.*
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.*
import javax.swing.border.EmptyBorder

/**
 * Vista Kanban dentro del IDE.
 * Muestra las tarjetas Trello agrupadas por columna.
 */
class KanbanView(private val project: Project) : JPanel(BorderLayout()) {

    private val scope = CoroutineScope(Dispatchers.Main)
    private val contentPanel = JPanel()
    private val loadingLabel = JLabel("Cargando tablero Trello...", SwingConstants.CENTER)

    init {
        background = HiveBrand.bgSurface
        setupUI()
        startObservingCards()
    }

    private fun setupUI() {
        contentPanel.layout = BoxLayout(contentPanel, BoxLayout.Y_AXIS)
        contentPanel.background = HiveBrand.bgSurface

        val header = JPanel(FlowLayout(FlowLayout.LEFT)).apply {
            background = HiveBrand.bgPanel
            border = EmptyBorder(8, 12, 8, 12)
            add(JLabel("Tablero HiveMind").apply {
                font = HiveBrand.font(12, Font.BOLD)
                foreground = HiveBrand.YELLOW
            })
        }

        val scrollPane = JBScrollPane(contentPanel).apply {
            verticalScrollBarPolicy = ScrollPaneConstants.VERTICAL_SCROLLBAR_AS_NEEDED
            horizontalScrollBarPolicy = ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER
            border = null
        }

        loadingLabel.apply {
            font = HiveBrand.font(11, Font.ITALIC)
            foreground = HiveBrand.TEXT_DIM
        }

        add(header,       BorderLayout.NORTH)
        add(scrollPane,   BorderLayout.CENTER)
        add(loadingLabel, BorderLayout.SOUTH)
        loadingLabel.isVisible = true
    }

    private fun startObservingCards() {
        scope.launch {
            TrelloRepository.boardCards.collect { cards ->
                updateKanban(cards)
                loadingLabel.isVisible = cards.isEmpty()
            }
        }

        scope.launch {
            TrelloRepository.isLoading.collect { loading ->
                loadingLabel.text = if (loading) "Actualizando..." else ""
                loadingLabel.isVisible = loading || TrelloRepository.boardCards.value.isEmpty()
            }
        }
    }

    private fun updateKanban(allCards: List<TrelloCard>) {
        contentPanel.removeAll()

        // Las columnas se descubren en runtime agrupando las cards por
        // listId/listName reales. NADA hardcodeado: si el tablero usa
        // listas personalizadas, aparecen automaticamente.
        val groups = LinkedHashMap<String, MutableList<TrelloCard>>()
        for (card in allCards) {
            val key = card.listId ?: ""
            groups.getOrPut(key) { mutableListOf() }.add(card)
        }
        val listNames = TrelloRepository.listNames.value
        for ((listId, cardsInList) in groups) {
            if (cardsInList.isEmpty()) continue
            val listName = listNames[listId]
                ?: (if (listId.isBlank()) "(sin lista)" else "Lista ${listId.take(6)}")
            contentPanel.add(createColumnSection(listName, cardsInList))
            contentPanel.add(Box.createVerticalStrut(8))
        }

        contentPanel.revalidate()
        contentPanel.repaint()
    }

    private fun createColumnSection(columnName: String, cards: List<TrelloCard>): JPanel {
        return JPanel(BorderLayout()).apply {
            background = HiveBrand.bgSurface
            border = EmptyBorder(6, 10, 6, 10)

            val columnHeader = JLabel("$columnName (${cards.size})").apply {
                font = HiveBrand.font(12, Font.BOLD)
                foreground = HiveBrand.YELLOW
                border = EmptyBorder(0, 0, 4, 0)
            }

            val cardsPanel = JPanel().apply {
                layout = BoxLayout(this, BoxLayout.Y_AXIS)
                background = HiveBrand.bgSurface
                cards.forEach { card -> add(createCardComponent(card)) }
            }

            add(columnHeader, BorderLayout.NORTH)
            add(cardsPanel,   BorderLayout.CENTER)
        }
    }

    private fun createCardComponent(card: TrelloCard): JPanel {
        return JPanel(BorderLayout()).apply {
            background = HiveBrand.bgSurfaceAlt
            border = BorderFactory.createCompoundBorder(
                BorderFactory.createLineBorder(HiveBrand.border, 1),
                EmptyBorder(8, 10, 8, 10)
            )
            maximumSize = Dimension(Int.MAX_VALUE, 64)

            val cardName = card.name
                .removePrefix("[Angel]").removePrefix("[Carlos]")
                .removePrefix("[Alvaro]").removePrefix("[Pablo]").removePrefix("[Alejandro]")
                .trim()

            // El acento del dev es siempre el amarillo HiveMind.
            // El nombre del dev se mantiene como etiqueta para identificacion rapida.
            val devName = when {
                card.name.startsWith("[Angel]")     -> "Angel"
                card.name.startsWith("[Carlos]")    -> "Carlos"
                card.name.startsWith("[Alvaro]")    -> "Alvaro"
                card.name.startsWith("[Pablo]")     -> "Pablo"
                card.name.startsWith("[Alejandro]") -> "Alejandro"
                else -> ""
            }

            val nameLabel = JLabel(cardName).apply {
                font = HiveBrand.font(11)
                foreground = HiveBrand.WHITE
            }

            val devLabel = JLabel(if (devName.isNotEmpty()) "@$devName" else "").apply {
                font = HiveBrand.font(10, Font.BOLD)
                foreground = HiveBrand.YELLOW
            }

            add(nameLabel, BorderLayout.CENTER)
            add(devLabel,  BorderLayout.EAST)

            addMouseListener(object : MouseAdapter() {
                override fun mouseClicked(e: MouseEvent) {
                    if (e.clickCount == 2 && card.url.isNotEmpty()) {
                        java.awt.Desktop.getDesktop().browse(java.net.URI(card.url))
                    }
                }
            })
            cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)
        }
    }
}
