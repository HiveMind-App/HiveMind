package com.hivemind.brand

import com.intellij.openapi.diagnostic.Logger
import com.intellij.ui.JBColor
import java.awt.Color
import java.awt.Font
import java.awt.GraphicsEnvironment
import javax.swing.ImageIcon

/**
 * Paleta oficial HiveMind + tipografia unica (Bricolage Grotesque).
 *
 * El TTF se empaqueta en resources/fonts/ y se registra en el
 * GraphicsEnvironment la primera vez que se accede a HiveBrand. Asi todos
 * los componentes Swing del plugin comparten la misma tipografia oficial.
 *
 * Si el font falla al cargar (corrupto, denegado, etc.) caemos a system
 * sans-serif sin romper nada.
 */
object HiveBrand {

    private val log = Logger.getInstance(HiveBrand::class.java)

    // Marca
    val BLACK: Color = Color(0, 0, 0)
    val YELLOW: Color = Color(0xF9, 0xC9, 0x00)
    val YELLOW_BRIGHT: Color = Color(0xFF, 0xD6, 0x33)
    val YELLOW_DIM: Color = Color(0xC9, 0xA2, 0x00)
    val WHITE: Color = Color(0xFF, 0xFF, 0xFF)

    // Superficies neutras sobre negro
    val SURFACE_0: Color = Color(0x0A, 0x0A, 0x0A)
    val SURFACE_1: Color = Color(0x14, 0x14, 0x14)
    val SURFACE_2: Color = Color(0x1F, 0x1F, 0x1F)
    val BORDER: Color = Color(0x2A, 0x2A, 0x2A)

    // Texto
    val TEXT: Color = WHITE
    val TEXT_MUTED: Color = Color(0xA0, 0xA0, 0xA0)
    val TEXT_DIM: Color = Color(0x66, 0x66, 0x66)

    // Semanticos
    val SUCCESS: Color = Color(0x3F, 0xB9, 0x50)
    val ERROR: Color = Color(0xEF, 0x44, 0x44)

    val bgPanel: JBColor = JBColor(SURFACE_1, SURFACE_1)
    val bgSurface: JBColor = JBColor(SURFACE_0, SURFACE_0)
    val bgSurfaceAlt: JBColor = JBColor(SURFACE_2, SURFACE_2)
    val border: JBColor = JBColor(BORDER, BORDER)
    val accent: JBColor = JBColor(YELLOW, YELLOW)
    val accentDim: JBColor = JBColor(YELLOW_DIM, YELLOW_DIM)
    val textMuted: JBColor = JBColor(TEXT_MUTED, TEXT_MUTED)

    const val TAGLINE = "Una colmena de IAs, para un equipo de desarrolladores."

    const val FONT_FAMILY = "Bricolage Grotesque"

    // --- Font loading (lazy, idempotente) ---
    private var fontLoaded = false
    private val fontLock = Any()

    private fun ensureFontLoaded() {
        if (fontLoaded) return
        synchronized(fontLock) {
            if (fontLoaded) return
            try {
                val ge = GraphicsEnvironment.getLocalGraphicsEnvironment()
                val paths = listOf(
                    "/fonts/BricolageGrotesque-Regular.ttf",
                    "/fonts/BricolageGrotesque-Bold.ttf",
                    "/fonts/BricolageGrotesque-ExtraBold.ttf",
                )
                for (p in paths) {
                    val stream = HiveBrand::class.java.getResourceAsStream(p)
                    if (stream == null) {
                        log.warn("HiveBrand: no encuentro $p en resources")
                        continue
                    }
                    stream.use {
                        val f = Font.createFont(Font.TRUETYPE_FONT, it)
                        ge.registerFont(f)
                    }
                }
            } catch (t: Throwable) {
                log.warn("HiveBrand: fallo cargando Bricolage Grotesque: ${t.message}")
            } finally {
                fontLoaded = true
            }
        }
    }

    fun font(size: Int, style: Int = Font.PLAIN): Font {
        ensureFontLoaded()
        return Font(FONT_FAMILY, style, size)
    }

    fun titleFont(size: Int = 16): Font {
        ensureFontLoaded()
        return Font(FONT_FAMILY, Font.BOLD, size)
    }

    /** Carga el logo PNG de /brand/logo.png; null si no existe. */
    fun loadLogo(): ImageIcon? {
        return try {
            val url = HiveBrand::class.java.getResource("/brand/logo.png")
            if (url != null) ImageIcon(url) else null
        } catch (t: Throwable) {
            log.warn("HiveBrand: fallo cargando logo: ${t.message}")
            null
        }
    }
}
