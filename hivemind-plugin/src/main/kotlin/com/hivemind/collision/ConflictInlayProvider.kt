package com.hivemind.collision

import com.hivemind.supabase.TeamContextManager
import com.intellij.codeInsight.hints.*
import com.intellij.openapi.editor.Editor
import com.intellij.psi.PsiFile
import javax.swing.JPanel

@Suppress("UnstableApiUsage")
class ConflictInlayProvider : InlayHintsProvider<NoSettings> {

    override val key = SettingsKey<NoSettings>("hivemind.conflict")
    override val name = "HiveMind Conflict Hints"       
    override val previewText = "// TODO: crear login  ⚠️ Carlos también está aquí"
    override fun createSettings() = NoSettings()        

    override fun getCollectorFor(
        file: PsiFile,
        editor: Editor,
        settings: NoSettings,
        sink: InlayHintsSink
    ): InlayHintsCollector {
        return object : FactoryInlayHintsCollector(editor) {
            override fun collect(element: com.intellij.psi.PsiElement, editor: Editor, sink: InlayHintsSink): Boolean {
                // Buscar comentarios TODO en el archivo
                val text = element.text
                if (text.contains("TODO:") || text.contains("HIVEMIND:")) {
                    // Verificar si hay un conflicto activo
                    val teamState = TeamContextManager.teamState.value
                    val conflictingMember = teamState.values.firstOrNull { session ->
                        session.isActive && session.moduleArea != null
                    }

                    if (conflictingMember != null) {    
                        // Añadir InlayHint al final de la línea
                        val offset = element.textRange.endOffset
                        sink.addInlineElement(
                            offset = offset,
                            relatesToPrecedingText = true,
                            presentation = factory.smallText(
                                "  ⚠️ ${conflictingMember.userName} también está aquí"
                            ),
                            placeAtTheEndOfLine = true  
                        )
                    }
                }
                return true
            }
        }
    }

    override fun createConfigurable(settings: NoSettings) = object : ImmediateConfigurable {
        override fun createComponent(listener: ChangeListener) = JPanel()
    }
}
