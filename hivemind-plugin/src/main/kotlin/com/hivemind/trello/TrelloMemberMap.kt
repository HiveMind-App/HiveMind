package com.hivemind.trello

/**
 * Mapa de nombre del dev → ID de Trello. Se rellena en runtime desde la
 * API de Trello (`/boards/{id}/members`) usando las credenciales del
 * proyecto. NADA hardcodeado.
 *
 * El llamador (por ejemplo TrelloService o Listeners) invoca
 * `TrelloMemberMap.refresh(key, token, boardId)` una vez al arrancar,
 * y a partir de ahi `getIdByName(name)` devuelve el id correcto.
 */
object TrelloMemberMap {
    private val memberIds: MutableMap<String, String> = mutableMapOf()

    /**
     * Refresca el mapa leyendo la lista real de miembros del board.
     * Bloqueante — llamar desde un worker thread.
     */
    fun refresh(apiKey: String, apiToken: String, boardId: String): Boolean {
        if (apiKey.isBlank() || apiToken.isBlank() || boardId.isBlank()) return false
        return try {
            val url =
                "https://api.trello.com/1/boards/$boardId/members?fields=id,fullName,username&key=$apiKey&token=$apiToken"
            val conn = (java.net.URI(url).toURL().openConnection() as java.net.HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 5000
                readTimeout = 5000
            }
            if (conn.responseCode !in 200..299) return false
            val body = conn.inputStream.bufferedReader().readText()
            // Parse ultra-simple sin json lib: cada miembro viene en orden
            // con "id":"..." y "fullName":"...".
            val regex = Regex("\\{[^{}]*?\"id\"\\s*:\\s*\"([^\"]+)\"[^{}]*?\"fullName\"\\s*:\\s*\"([^\"]+)\"[^{}]*?}")
            memberIds.clear()
            for (m in regex.findAll(body)) {
                val id = m.groupValues[1]
                val name = m.groupValues[2]
                // Guarda el nombre completo y tambien cada palabra como alias
                memberIds[name] = id
                name.split(" ").forEach { part ->
                    if (part.isNotBlank()) memberIds[part] = id
                }
            }
            memberIds.isNotEmpty()
        } catch (_: Throwable) {
            false
        }
    }

    fun getIdByName(name: String): String? = memberIds[name]

    fun all(): Map<String, String> = memberIds.toMap()
}
