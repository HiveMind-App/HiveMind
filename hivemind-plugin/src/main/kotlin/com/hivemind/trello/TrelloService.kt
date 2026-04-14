package com.hivemind.trello

import com.hivemind.config.HiveMindSettings
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.engine.cio.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.json.Json

object TrelloService {

    private val API_KEY: String
        get() = HiveMindSettings.getInstance().state.trelloKey
            .ifEmpty { System.getenv("HIVEMIND_TRELLO_KEY") ?: "" }
            .ifEmpty { System.getenv("TRELLO_KEY") ?: "" }

    private val TOKEN: String
        get() = HiveMindSettings.getInstance().state.trelloToken
            .ifEmpty { System.getenv("HIVEMIND_TRELLO_TOKEN") ?: "" }
            .ifEmpty { System.getenv("TRELLO_TOKEN") ?: "" }

    private val BOARD_ID: String
        get() = HiveMindSettings.getInstance().state.trelloBoard
            .ifEmpty { System.getenv("HIVEMIND_TRELLO_BOARD") ?: "" }
            .ifEmpty { System.getenv("TRELLO_BOARD_ID") ?: "" }
    
    private const val BASE_URL  = "https://api.trello.com/1"

    /**
     * Cache de listas del board, resuelta en runtime desde la API de Trello
     * (`/boards/{id}/lists`). NADA hardcodeado: detecta automaticamente las
     * listas por nombre (case-insensitive, tolerando emojis y acentos).
     *
     * La primera llamada a getListId() dispara la carga. Se refresca al
     * cambiar board_id en Settings.
     */
    @Volatile private var cachedLists: Map<String, String> = emptyMap()
    @Volatile private var cachedForBoard: String = ""

    private suspend fun ensureListsLoaded() {
        val boardId = BOARD_ID
        if (boardId.isBlank()) return
        if (cachedForBoard == boardId && cachedLists.isNotEmpty()) return
        try {
            val res: List<Map<String, String>> = client.get("$BASE_URL/boards/$boardId/lists") {
                parameter("filter", "open")
                parameter("fields", "id,name")
                addAuth()
            }.body()
            cachedLists = res.associate { (it["id"] ?: "") to (it["name"] ?: "") }
                .filterKeys { it.isNotBlank() }
                .entries.associate { it.key to it.value }  // id → name
                .let { idToName -> idToName }
            cachedForBoard = boardId
        } catch (_: Throwable) {
            cachedLists = emptyMap()
        }
    }

    private fun norm(s: String) = s.lowercase().replace(Regex("[^a-z0-9]"), "")

    /** Devuelve el id de la primera lista cuyo nombre contenga alguno de los `needles`. */
    private suspend fun getListId(vararg needles: String): String? {
        ensureListsLoaded()
        val normNeedles = needles.map { norm(it) }
        return cachedLists.entries.firstOrNull { (_, name) ->
            val n = norm(name)
            normNeedles.any { n.contains(it) }
        }?.key
    }

    private val client = HttpClient(CIO) {
        install(ContentNegotiation) {
            json(Json { ignoreUnknownKeys = true })
        }
    }

    // Parámetros de auth que van en todas las peticiones
    private fun HttpRequestBuilder.addAuth() {
        parameter("key", API_KEY)
        parameter("token", TOKEN)
    }

    /**
     * Crea una tarjeta en la columna "En Progreso".
     * Se llama automáticamente cuando Angel detecta una intención.
     */
    suspend fun createInProgressCard(
        developerName: String,
        intentText: String,
        developerTrelloId: String? = null
    ): String? {
        return try {
            val cardName = "[$developerName] $intentText"
            
            // --- BLINDAJE ANTI-DUPLICADOS ---
            val existingCards = getBoardCards()
            val inProgressId = getListId("progreso", "progress", "doing") ?: ""
            if (existingCards.any { it.name == cardName && it.listId == inProgressId }) {
                println("HiveMind: Tarjeta duplicada detectada en Trello, saltando creación.")
                return null
            }
            // --------------------------------
            
            val cardDesc = buildString {
                appendLine("🤖 **Generado automáticamente por HiveMind**")
                appendLine()
                appendLine("**Desarrollador:** $developerName")
                appendLine("**Intención detectada:** $intentText")
                appendLine("**Creado:** ${java.time.LocalDateTime.now()}")
                appendLine()
                appendLine("Esta tarjeta fue creada por el plugin HiveMind al detectar")
                appendLine("una intención de código en el IDE de $developerName.")
            }

            val response = client.post("$BASE_URL/cards") {
                addAuth()
                parameter("name", cardName)
                parameter("desc", cardDesc)
                parameter("idList", inProgressId)
                if (developerTrelloId != null) {
                    parameter("idMembers", developerTrelloId)
                }
            }

            val card = response.body<TrelloCard>()
            println("HiveMind: tarjeta Trello creada → ${card.url}")
            card.url
        } catch (e: Exception) {
            println("HiveMind WARNING: No se pudo crear tarjeta Trello: ${e.message}")
            null
        }
    }

    /**
     * Crea una tarjeta genérica para asignar tareas a miembros.
     * Utilizado por el TaskDistributor.
     */
    suspend fun createCard(
        title: String,
        description: String,
        listId: String,
        assigneeName: String? = null
    ): String? {
        return try {
            val response = client.post("$BASE_URL/cards") {
                addAuth()
                parameter("name", title)
                parameter("desc", description)
                parameter("idList", listId)
                
                if (assigneeName != null) {
                    val assignId = TrelloMemberMap.getIdByName(assigneeName)
                    if (assignId != null) {
                        parameter("idMembers", assignId)
                    }
                }
            }

            val card = response.body<TrelloCard>()
            println("HiveMind: tarea asignada en Trello → ${card.url}")
            card.url
        } catch (e: Exception) {
            println("HiveMind WARNING: No se pudo asignar tarea en Trello: ${e.message}")
            null
        }
    }

    /**
     * Obtiene todas las tarjetas abiertas del tablero.
     */
    suspend fun getBoardCards(): List<TrelloCard> {
        return try {
            client.get("$BASE_URL/boards/$BOARD_ID/cards") {
                addAuth()
                parameter("filter", "open")
                parameter("fields", "id,name,desc,idList,idMembers,url")
            }.body<List<TrelloCard>>()
        } catch (e: Exception) {
            println("HiveMind WARNING: No se pudo leer tablero Trello: ${e.message}")
            emptyList()
        }
    }

    /**
     * Obtiene las listas del tablero.
     */
    suspend fun getBoardLists(): List<TrelloList> {
        return try {
            client.get("$BASE_URL/boards/$BOARD_ID/lists") {
                addAuth()
                parameter("filter", "open")
            }.body<List<TrelloList>>()
        } catch (e: Exception) {
            emptyList()
        }
    }

    /**
     * Mueve una tarjeta a "Completado".
     */
    suspend fun moveCardToDone(cardId: String) {
        try {
            val doneId = getListId("completado", "done", "terminado") ?: return
            client.put("$BASE_URL/cards/$cardId") {
                addAuth()
                parameter("idList", doneId)
            }
        } catch (e: Exception) {
            println("HiveMind WARNING: No se pudo mover tarjeta: ${e.message}")
        }
    }
}
