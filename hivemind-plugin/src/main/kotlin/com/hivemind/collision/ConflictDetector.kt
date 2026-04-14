package com.hivemind.collision

import com.hivemind.supabase.TeamContextManager

/**
 * Detecta conflictos de intencion entre miembros del equipo.
 * Deteccion rapida O(1) por area de modulo usando el estado en memoria
 * de TeamContextManager (Supabase Realtime).
 *
 * La deteccion semantica (via embeddings + pgvector) se hace en el
 * backend con validate-file-write para el CLI, no aqui.
 *
 * PROPIETARIO: Angel
 */
object ConflictDetector {

    /** Deteccion O(1) por area de modulo. */
    fun detectByArea(myArea: String, myIntent: String, excludeUser: String): ConflictResult {
        val conflict = TeamContextManager.teamState.value.entries
            .firstOrNull { (name, s) ->
                name != excludeUser && s.isActive &&
                s.moduleArea?.lowercase() == myArea.lowercase()
            }
        return if (conflict != null) ConflictResult(
            detected        = true,
            conflictingUser = conflict.key,
            conflictArea    = myArea,
            myIntent        = myIntent,
            theirIntent     = conflict.value.activeIntent ?: "",
            suggestedAction = "⚠️ ${conflict.key} también está trabajando en '$myArea'."
        ) else ConflictResult(detected = false)
    }

    /** Metodo principal: deteccion rapida por area. */
    fun detect(myIntent: String, myArea: String, excludeUser: String): ConflictResult {
        return detectByArea(myArea, myIntent, excludeUser)
    }
}
