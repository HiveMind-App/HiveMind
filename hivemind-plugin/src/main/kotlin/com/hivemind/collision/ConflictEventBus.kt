package com.hivemind.collision

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Bus de eventos para conflictos detectados.
 *
 * Angel emite → ConflictEventBus.emit(result)
 * Alvaro escucha → ConflictEventBus.events.collect { ... }
 *
 * PROPIETARIO: Shared — no modificar sin avisar
 */
object ConflictEventBus {
    private val _events = MutableSharedFlow<ConflictResult>(replay = 1)
    val events: SharedFlow<ConflictResult> = _events.asSharedFlow()

    suspend fun emit(conflict: ConflictResult) {
        _events.emit(conflict)
    }
}
