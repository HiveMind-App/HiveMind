package com.hivemind.collision

/**
 * Resultado de la detección de conflictos.
 * Angel lo produce, Alvaro lo consume para mostrar alertas visuales.
 *
 * PROPIETARIO: Shared (Angel produce, Alvaro consume)
 */
data class ConflictResult(
    val detected: Boolean,
    val conflictingUser: String? = null,   // "Carlos"
    val conflictArea: String? = null,       // "auth"
    val myIntent: String = "",
    val theirIntent: String = "",
    val suggestedAction: String? = null    // "Coordina con Carlos antes de continuar"
)
