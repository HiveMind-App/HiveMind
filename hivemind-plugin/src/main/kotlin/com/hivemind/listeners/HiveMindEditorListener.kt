package com.hivemind.listeners

import com.intellij.openapi.editor.event.EditorFactoryEvent
import com.intellij.openapi.editor.event.EditorFactoryListener

/**
 * Registra el DocumentListener en cada editor que se abre.
 * Sin este wrapper solo escucharíamos el primer editor del IDE.
 * PROPIETARIO: Alvaro
 */
class HiveMindEditorListener : EditorFactoryListener {

    private val documentListener = HiveMindDocumentListener()

    override fun editorCreated(event: EditorFactoryEvent) {
        event.editor.document.addDocumentListener(documentListener)
    }

    override fun editorReleased(event: EditorFactoryEvent) {
        event.editor.document.removeDocumentListener(documentListener)
    }
}
