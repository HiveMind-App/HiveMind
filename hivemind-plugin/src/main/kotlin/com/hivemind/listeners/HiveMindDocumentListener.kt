package com.hivemind.listeners

import com.hivemind.events.IntentionEvent
import com.hivemind.interceptor.PromptInterceptor
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.fileEditor.FileDocumentManager
import kotlinx.coroutines.*

/**
 * Escucha cambios de texto en el editor y detecta intenciones (TODOs, etc.).
 * Usa debounce de 800ms para no disparar con cada tecla.
 * PROPIETARIO: Alvaro
 */
class HiveMindDocumentListener : DocumentListener {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var debounceJob: Job? = null
    private val DEBOUNCE_MS = 800L

    private val INTENT_PATTERNS = listOf(
        Regex("""//\s*TODO:\s*(.+)"""),
        Regex("""//\s*HIVEMIND:\s*(.+)"""),
        Regex("""//\s*TASK:\s*(.+)"""),
        Regex("""#\s*TODO:\s*(.+)""")
    )

    override fun documentChanged(event: DocumentEvent) {
        debounceJob?.cancel()
        debounceJob = scope.launch {
            delay(DEBOUNCE_MS)
            processChange(event)
        }
    }

    private suspend fun processChange(event: DocumentEvent) {
        val doc        = event.document
        val lineNum    = doc.getLineNumber(event.offset)
        val lineStart  = doc.getLineStartOffset(lineNum)
        val lineEnd    = doc.getLineEndOffset(lineNum)
        val currentLine = doc.text.substring(lineStart, minOf(lineEnd, doc.text.length))

        val intent = INTENT_PATTERNS
            .mapNotNull { it.find(currentLine)?.groupValues?.get(1)?.trim() }
            .firstOrNull()?.takeIf { it.length > 3 } ?: return

        val filePath   = FileDocumentManager.getInstance().getFile(doc)?.path ?: "unknown"
        val moduleArea = inferArea(filePath)

        withContext(Dispatchers.Main) {
            PromptInterceptor.onIntentDetected(IntentionEvent(
                intentText    = intent,
                filePath      = filePath,
                moduleArea    = moduleArea,
                developerName = PromptInterceptor.localDeveloperName
            ))
        }
    }

    private fun inferArea(path: String) = when {
        path.contains("/auth/")                       -> "auth"
        path.contains("/db/") || path.contains("/database/") -> "database"
        path.contains("/ui/") || path.contains("/view/")     -> "ui"
        path.contains("/api/")                        -> "api"
        path.contains("/model/")                      -> "model"
        path.contains("/service/")                    -> "service"
        else                                           -> "general"
    }
}
