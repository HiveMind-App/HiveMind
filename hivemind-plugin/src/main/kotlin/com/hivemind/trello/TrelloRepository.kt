package com.hivemind.trello

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Repositorio de datos de Trello con polling automático.
 * Pablo observa boardCards para actualizar el Kanban.
 */
object TrelloRepository {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var pollingJob: Job? = null

    // Estado del tablero que Pablo observa
    private val _boardCards = MutableStateFlow<List<TrelloCard>>(emptyList())
    val boardCards: StateFlow<List<TrelloCard>> = _boardCards.asStateFlow()

    private val _boardLists = MutableStateFlow<List<TrelloList>>(emptyList())
    val boardLists: StateFlow<List<TrelloList>> = _boardLists.asStateFlow()

    /** Mapa id → nombre de lista, derivado de boardLists. */
    private val _listNames = MutableStateFlow<Map<String, String>>(emptyMap())
    val listNames: StateFlow<Map<String, String>> = _listNames.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    /**
     * Inicia el polling de Trello cada 10 segundos.
     * Llamar desde HiveMindStartupActivity.
     */
    fun startPolling(intervalMs: Long = 10_000) {
        pollingJob?.cancel()
        pollingJob = scope.launch {
            // Primera carga inmediata
            refreshData()

            // Después polling periódico
            while (isActive) {
                delay(intervalMs)
                refreshData()
            }
        }
    }

    fun stopPolling() {
        pollingJob?.cancel()
    }

    /**
     * Fuerza una actualización manual.
     */
    suspend fun refreshData() {
        _isLoading.value = true
        try {
            val cards = TrelloService.getBoardCards()
            val lists = TrelloService.getBoardLists()
            _boardCards.value = cards
            _boardLists.value = lists
            _listNames.value = lists.associate { it.id to it.name }
        } finally {
            _isLoading.value = false
        }
    }

    /**
     * Devuelve las tarjetas agrupadas por lista.
     * Llave = ID de la lista, valor = lista de tarjetas
     */
    fun getCardsByList(): Map<String, List<TrelloCard>> {
        return boardCards.value.groupBy { it.listId }
    }

    /**
     * Devuelve el nombre de una lista por su ID.
     */
    fun getListName(listId: String): String {
        return boardLists.value.find { it.id == listId }?.name ?: "Sin columna"
    }
}
