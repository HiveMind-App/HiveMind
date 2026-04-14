package com.hivemind.events

/**
 * Evento emitido por el PSI Listener (Alvaro) cuando detecta una intencion.
 * Consumido por el PromptInterceptor (Angel) y el IntegrationsManager (Carlos).
 *
 * PROPIETARIO: Shared — no modificar sin avisar al equipo
 */
data class IntentionEvent(
    val intentText: String,       // "crear formulario de login"
    val filePath: String,         // "src/main/kotlin/auth/LoginForm.kt"
    val moduleArea: String,       // "auth"  (inferido del path)
    val developerName: String     // "Angel" (de HiveMindSettings)
)
