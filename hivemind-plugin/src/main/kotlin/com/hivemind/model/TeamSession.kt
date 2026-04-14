package com.hivemind.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Representa el estado actual de un desarrollador en el equipo.
 * Mapeado directamente a la tabla team_sessions de Supabase.
 *
 * PROPIETARIO: Alejandro (Backend)
 */
@Serializable
data class TeamSession(
    val id: String? = null,

    @SerialName("user_name")
    val userName: String,

    @SerialName("active_file")
    val activeFile: String? = null,

    @SerialName("active_intent")
    val activeIntent: String? = null,

    @SerialName("module_area")
    val moduleArea: String? = null,

    @SerialName("is_active")
    val isActive: Boolean = true,

    @SerialName("last_updated")
    val lastUpdated: String? = null
)
