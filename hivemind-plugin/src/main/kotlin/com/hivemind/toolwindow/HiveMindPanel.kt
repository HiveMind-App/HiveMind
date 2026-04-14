package com.hivemind.toolwindow

import com.hivemind.auth.HiveMindAuth
import com.hivemind.brand.HiveBrand
import com.hivemind.config.HiveMindSettings
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import java.awt.BorderLayout
import java.awt.CardLayout
import java.awt.Color
import java.awt.Component
import java.awt.Cursor
import java.awt.Dimension
import java.awt.FlowLayout
import java.awt.Font
import java.awt.Image
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import javax.swing.BorderFactory
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.ImageIcon
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JPasswordField
import javax.swing.JTextField
import javax.swing.SwingConstants
import javax.swing.SwingUtilities
import kotlin.concurrent.thread

/**
 * Panel lateral HiveMind con dos estados:
 *  - "login": formulario Swing branded (logo + Bricolage) que llama a
 *    HiveMindAuth.signInWithPassword() contra Supabase GoTrue.
 *  - "dashboard": JBCefBrowser embebido con la PWA del Watchtower.
 *    Cuando JCEF no esta disponible, fallback Swing con boton para
 *    abrir el navegador externo.
 *
 * El Watchtower (hivemind-cockpit App.tsx) lee ?access_token=&refresh_token=
 * del URL al cargar y llama a supabase.auth.setSession() para hidratar la
 * sesion, asi el dashboard arranca ya autenticado.
 */
class HiveMindPanel(private val project: Project) : JPanel(BorderLayout()) {

    private val cards = CardLayout()
    private val cardHost = JPanel(cards).apply { background = HiveBrand.bgSurface }

    private val loginPanel = LoginCard(::onLoginSuccess)
    private val dashboardHost = JPanel(BorderLayout()).apply { background = HiveBrand.bgSurface }

    init {
        background = HiveBrand.bgSurface

        cardHost.add(loginPanel, CARD_LOGIN)
        cardHost.add(dashboardHost, CARD_DASHBOARD)
        add(cardHost, BorderLayout.CENTER)

        if (HiveMindAuth.isSignedIn()) {
            showDashboard()
        } else {
            cards.show(cardHost, CARD_LOGIN)
        }
    }

    private fun onLoginSuccess() {
        showDashboard()
    }

    private fun showDashboard() {
        dashboardHost.removeAll()
        dashboardHost.add(DashboardCard(project, ::onLogout), BorderLayout.CENTER)
        dashboardHost.revalidate()
        dashboardHost.repaint()
        cards.show(cardHost, CARD_DASHBOARD)
    }

    private fun onLogout() {
        HiveMindAuth.signOut()
        loginPanel.reset()
        cards.show(cardHost, CARD_LOGIN)
    }

    companion object {
        private const val CARD_LOGIN = "login"
        private const val CARD_DASHBOARD = "dashboard"
    }
}

/* ============================================================
   LOGIN CARD — formulario Swing branded
   ============================================================ */
private class LoginCard(private val onSuccess: () -> Unit) : JPanel(BorderLayout()) {

    private val emailField = JTextField()
    private val passwordField = JPasswordField()
    private val statusLabel = JLabel(" ")
    private val submitButton: JButton

    init {
        background = HiveBrand.bgSurface
        border = BorderFactory.createEmptyBorder(40, 32, 40, 32)

        val content = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            background = HiveBrand.bgSurface
            alignmentX = CENTER_ALIGNMENT
        }

        content.add(buildLogoBlock())
        content.add(Box.createVerticalStrut(28))
        content.add(centered(JLabel("Bienvenido de vuelta").apply {
            font = HiveBrand.font(18, Font.BOLD)
            foreground = HiveBrand.WHITE
        }))
        content.add(Box.createVerticalStrut(6))
        content.add(centered(JLabel("Entra para sincronizar tu enjambre.").apply {
            font = HiveBrand.font(12)
            foreground = HiveBrand.TEXT_MUTED
        }))
        content.add(Box.createVerticalStrut(28))

        content.add(buildLabeledField("EMAIL", emailField))
        content.add(Box.createVerticalStrut(14))
        content.add(buildLabeledField("CONTRASEÑA", passwordField))

        statusLabel.apply {
            font = HiveBrand.font(11)
            foreground = HiveBrand.ERROR
            alignmentX = CENTER_ALIGNMENT
            horizontalAlignment = SwingConstants.CENTER
            maximumSize = Dimension(360, 22)
        }
        content.add(Box.createVerticalStrut(14))
        content.add(statusLabel)

        submitButton = buildPrimaryButton("ENTRAR AL WATCHTOWER") { doLogin() }
            .apply {
                alignmentX = Component.CENTER_ALIGNMENT
                maximumSize = Dimension(360, 44)
            }
        content.add(Box.createVerticalStrut(4))
        content.add(submitButton)

        content.add(Box.createVerticalStrut(14))
        content.add(centered(JLabel(
            "<html><div style='color:#A0A0A0; text-align:center;'>" +
                "¿No tienes cuenta? Contacta a tu PM." +
                "</div></html>"
        ).apply {
            font = HiveBrand.font(10)
            foreground = HiveBrand.TEXT_MUTED
        }))
        content.add(Box.createVerticalStrut(20))
        content.add(centered(JLabel(HiveBrand.TAGLINE).apply {
            font = HiveBrand.font(10)
            foreground = HiveBrand.TEXT_DIM
        }))

        add(content, BorderLayout.NORTH)

        // Enter fires submit
        val enterListener = object : KeyAdapter() {
            override fun keyPressed(e: KeyEvent) {
                if (e.keyCode == KeyEvent.VK_ENTER) doLogin()
            }
        }
        emailField.addKeyListener(enterListener)
        passwordField.addKeyListener(enterListener)

        // Pre-fill email si ya lo teniamos
        val s = HiveMindSettings.getInstance().state
        if (s.currentUserEmail.isNotBlank()) emailField.text = s.currentUserEmail
        else if (s.email.isNotBlank()) emailField.text = s.email
    }

    fun reset() {
        passwordField.text = ""
        statusLabel.text = " "
        submitButton.isEnabled = true
    }

    private fun doLogin() {
        val email = emailField.text.trim()
        val password = String(passwordField.password)
        if (email.isBlank() || password.isBlank()) {
            statusLabel.foreground = HiveBrand.ERROR
            statusLabel.text = "Rellena email y contraseña."
            return
        }
        statusLabel.foreground = HiveBrand.TEXT_MUTED
        statusLabel.text = "Autenticando..."
        submitButton.isEnabled = false

        ApplicationManager.getApplication().executeOnPooledThread {
            val res = HiveMindAuth.signInWithPassword(email, password)
            SwingUtilities.invokeLater {
                submitButton.isEnabled = true
                if (res.ok) {
                    statusLabel.foreground = HiveBrand.SUCCESS
                    statusLabel.text = "Sesion iniciada — cargando Watchtower..."
                    onSuccess()
                } else {
                    statusLabel.foreground = HiveBrand.ERROR
                    statusLabel.text = res.errorMessage ?: "Credenciales invalidas."
                }
            }
        }
    }

    private fun buildLogoBlock(): JPanel = JPanel().apply {
        layout = BoxLayout(this, BoxLayout.Y_AXIS)
        background = HiveBrand.bgSurface
        alignmentX = CENTER_ALIGNMENT

        val logoIcon = HiveBrand.loadLogo()
        val logoLabel = if (logoIcon != null) {
            JLabel(ImageIcon(logoIcon.image.getScaledInstance(64, 64, Image.SCALE_SMOOTH)))
        } else {
            JLabel("⬢").apply {
                font = Font(HiveBrand.FONT_FAMILY, Font.BOLD, 48)
                foreground = HiveBrand.YELLOW
            }
        }
        logoLabel.alignmentX = CENTER_ALIGNMENT
        logoLabel.horizontalAlignment = SwingConstants.CENTER

        val brandName = JLabel("HiveMind").apply {
            font = HiveBrand.titleFont(24)
            foreground = HiveBrand.WHITE
            alignmentX = CENTER_ALIGNMENT
            horizontalAlignment = SwingConstants.CENTER
        }
        add(logoLabel)
        add(Box.createVerticalStrut(10))
        add(brandName)
    }

    private fun buildLabeledField(label: String, field: JTextField): JPanel = JPanel().apply {
        layout = BoxLayout(this, BoxLayout.Y_AXIS)
        background = HiveBrand.bgSurface
        alignmentX = CENTER_ALIGNMENT
        maximumSize = Dimension(360, 64)

        val lbl = JLabel(label).apply {
            font = HiveBrand.font(9, Font.BOLD)
            foreground = HiveBrand.YELLOW
            alignmentX = CENTER_ALIGNMENT
            border = BorderFactory.createEmptyBorder(0, 2, 5, 0)
        }
        field.apply {
            font = HiveBrand.font(13)
            background = Color(0x18, 0x18, 0x18)
            foreground = HiveBrand.WHITE
            caretColor = HiveBrand.YELLOW
            border = BorderFactory.createCompoundBorder(
                BorderFactory.createLineBorder(HiveBrand.border, 1),
                BorderFactory.createEmptyBorder(10, 14, 10, 14),
            )
            maximumSize = Dimension(360, 40)
            alignmentX = CENTER_ALIGNMENT
        }
        add(lbl)
        add(field)
    }

    private fun centered(c: JComponent): JPanel = JPanel().apply {
        layout = BoxLayout(this, BoxLayout.X_AXIS)
        background = HiveBrand.bgSurface
        alignmentX = CENTER_ALIGNMENT
        add(Box.createHorizontalGlue())
        add(c)
        add(Box.createHorizontalGlue())
    }

    private fun buildPrimaryButton(text: String, onClick: () -> Unit): JButton =
        JButton(text).apply {
            font = HiveBrand.font(12, Font.BOLD)
            foreground = HiveBrand.BLACK
            background = HiveBrand.YELLOW
            isFocusPainted = false
            isOpaque = true
            isBorderPainted = false
            cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)
            border = BorderFactory.createEmptyBorder(12, 18, 12, 18)
            addActionListener { onClick() }
        }
}

/* ============================================================
   DASHBOARD CARD — JCEF del Watchtower (+ toolbar)
   ============================================================ */
private class DashboardCard(
    private val project: Project,
    private val onLogout: () -> Unit,
) : JPanel(BorderLayout()) {

    private var browser: JBCefBrowser? = null
    private val contentHost = JPanel(BorderLayout()).apply {
        background = HiveBrand.bgSurface
    }

    init {
        background = HiveBrand.bgSurface
        add(buildToolbar(), BorderLayout.NORTH)
        add(contentHost, BorderLayout.CENTER)
        // Mostrar loader inmediato y arrancar preflight + carga
        contentHost.add(buildLoader(), BorderLayout.CENTER)
        contentHost.revalidate()
        contentHost.repaint()
        startLoad()
    }

    private fun buildToolbar(): JPanel = JPanel(BorderLayout()).apply {
        background = Color(0x0E, 0x0E, 0x0E)
        border = BorderFactory.createCompoundBorder(
            BorderFactory.createMatteBorder(0, 0, 1, 0, HiveBrand.border),
            BorderFactory.createEmptyBorder(8, 12, 8, 12),
        )

        val left = JPanel(FlowLayout(FlowLayout.LEFT, 8, 0)).apply {
            background = Color(0x0E, 0x0E, 0x0E)
            val logoIcon = HiveBrand.loadLogo()
            if (logoIcon != null) {
                add(JLabel(ImageIcon(logoIcon.image.getScaledInstance(18, 18, Image.SCALE_SMOOTH))))
            }
            add(JLabel("HiveMind").apply {
                font = HiveBrand.titleFont(12)
                foreground = HiveBrand.YELLOW
            })
        }
        add(left, BorderLayout.WEST)

        val right = JPanel(FlowLayout(FlowLayout.RIGHT, 6, 0)).apply {
            background = Color(0x0E, 0x0E, 0x0E)
            val email = HiveMindSettings.getInstance().state.currentUserEmail
            if (email.isNotBlank()) {
                add(JLabel(email).apply {
                    font = HiveBrand.font(11)
                    foreground = HiveBrand.TEXT_MUTED
                    border = BorderFactory.createEmptyBorder(0, 6, 0, 10)
                })
            }
            val openExternal = smallGhostButton("Abrir externo") {
                try {
                    java.awt.Desktop.getDesktop().browse(java.net.URI(buildWatchtowerUrl()))
                } catch (_: Exception) {
                }
            }
            add(openExternal)
            val reload = smallGhostButton("↻") {
                browser?.cefBrowser?.reload() ?: startLoad()
            }
            add(reload)
            val logout = smallGhostButton("Salir") {
                browser?.dispose()
                browser = null
                onLogout()
            }
            add(logout)
        }
        add(right, BorderLayout.EAST)
    }

    /** Loader branded mientras comprobamos conectividad y/o JCEF carga. */
    private fun buildLoader(): JPanel = JPanel(BorderLayout()).apply {
        background = HiveBrand.bgSurface
        border = BorderFactory.createEmptyBorder(40, 30, 40, 30)
        val box = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            background = HiveBrand.bgSurface
        }
        val logoIcon = HiveBrand.loadLogo()
        val mark: JLabel = if (logoIcon != null) {
            JLabel(ImageIcon(logoIcon.image.getScaledInstance(48, 48, Image.SCALE_SMOOTH)))
        } else {
            JLabel("⬢").apply {
                font = Font(HiveBrand.FONT_FAMILY, Font.BOLD, 42)
                foreground = HiveBrand.YELLOW
            }
        }
        mark.alignmentX = CENTER_ALIGNMENT
        mark.horizontalAlignment = SwingConstants.CENTER
        val title = JLabel("Cargando Watchtower...").apply {
            font = HiveBrand.font(13, Font.BOLD)
            foreground = HiveBrand.WHITE
            alignmentX = CENTER_ALIGNMENT
            horizontalAlignment = SwingConstants.CENTER
        }
        val url = JLabel(buildWatchtowerBase()).apply {
            font = HiveBrand.font(10)
            foreground = HiveBrand.TEXT_DIM
            alignmentX = CENTER_ALIGNMENT
            horizontalAlignment = SwingConstants.CENTER
        }
        box.add(mark)
        box.add(Box.createVerticalStrut(14))
        box.add(title)
        box.add(Box.createVerticalStrut(6))
        box.add(url)
        add(box, BorderLayout.NORTH)
    }

    /**
     * Flujo de carga:
     *  1. Si JCEF no está soportado, fallback directo.
     *  2. Preflight HEAD a la base URL en background (1500ms timeout).
     *  3. Si responde OK, creamos JBCefBrowser y lo ponemos en el contentHost.
     *  4. Si falla, mostramos el fallback con instrucciones claras.
     */
    private fun startLoad() {
        if (!JBCefApp.isSupported()) {
            showFallback(
                headline = "JCEF no esta disponible",
                body = "Tu runtime de IntelliJ no incluye Chromium embebido. " +
                    "Activa un <b style='color:#F9C900;'>JBR-with-JCEF</b> en " +
                    "Help → Find Action → Choose Boot Java Runtime, o abre el " +
                    "Watchtower en el navegador.",
            )
            return
        }

        val base = buildWatchtowerBase()
        thread(name = "hivemind-watchtower-preflight", isDaemon = true) {
            val ok = pingUrl(base)
            SwingUtilities.invokeLater {
                if (!ok) {
                    val isLocal = base.startsWith("http://localhost") ||
                        base.startsWith("http://127.") ||
                        base.startsWith("http://0.0.0.0")
                    val body = if (isLocal) {
                        "No pude conectar con <b style='color:#F9C900;'>$base</b>.<br/><br/>" +
                            "Asegurate de que el Watchtower esta levantado:<br/>" +
                            "<code style='color:#F9C900;'>cd hivemind-cockpit &amp;&amp; npm run dev</code>"
                    } else {
                        "No pude conectar con <b style='color:#F9C900;'>$base</b>.<br/><br/>" +
                            "Comprueba que el dominio esta en linea y que el deploy " +
                            "de Cloudflare Pages ha terminado."
                    }
                    showFallback("No puedo conectar con el Watchtower", body)
                } else {
                    loadJcef()
                }
            }
        }
    }

    private fun loadJcef() {
        try {
            val url = buildWatchtowerUrl()
            val br = JBCefBrowser(url)
            browser = br
            contentHost.removeAll()
            contentHost.add(br.component.apply { background = HiveBrand.bgSurface }, BorderLayout.CENTER)
            contentHost.revalidate()
            contentHost.repaint()
        } catch (t: Throwable) {
            showFallback(
                headline = "No pude crear el navegador embebido",
                body = "${t.javaClass.simpleName}: ${t.message ?: "(sin detalles)"}",
            )
        }
    }

    private fun showFallback(headline: String, body: String) {
        contentHost.removeAll()
        contentHost.add(buildFallback(headline, body), BorderLayout.CENTER)
        contentHost.revalidate()
        contentHost.repaint()
    }

    private fun buildFallback(headline: String, bodyHtml: String): JPanel = JPanel(BorderLayout()).apply {
        background = HiveBrand.bgSurface
        border = BorderFactory.createEmptyBorder(40, 30, 40, 30)
        val box = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            background = HiveBrand.bgSurface
        }
        val logoIcon = HiveBrand.loadLogo()
        val mark: JLabel = if (logoIcon != null) {
            JLabel(ImageIcon(logoIcon.image.getScaledInstance(48, 48, Image.SCALE_SMOOTH)))
        } else {
            JLabel("⬢").apply {
                font = Font(HiveBrand.FONT_FAMILY, Font.BOLD, 42)
                foreground = HiveBrand.YELLOW
            }
        }
        mark.alignmentX = CENTER_ALIGNMENT
        mark.horizontalAlignment = SwingConstants.CENTER

        val title = JLabel(headline).apply {
            font = HiveBrand.font(14, Font.BOLD)
            foreground = HiveBrand.WHITE
            alignmentX = CENTER_ALIGNMENT
            horizontalAlignment = SwingConstants.CENTER
        }
        val body = JLabel(
            "<html><div style='text-align:center; width:420px; color:#A0A0A0;'>$bodyHtml</div></html>"
        ).apply {
            font = HiveBrand.font(12)
            foreground = HiveBrand.TEXT_MUTED
            alignmentX = CENTER_ALIGNMENT
            horizontalAlignment = SwingConstants.CENTER
        }
        val retry = buildPrimaryButton("REINTENTAR") { startLoad() }.apply {
            alignmentX = CENTER_ALIGNMENT
            maximumSize = Dimension(360, 44)
        }
        val external = smallGhostButton("Abrir en navegador") {
            try {
                java.awt.Desktop.getDesktop().browse(java.net.URI(buildWatchtowerUrl()))
            } catch (_: Exception) {
            }
        }.apply { alignmentX = CENTER_ALIGNMENT }

        box.add(mark)
        box.add(Box.createVerticalStrut(14))
        box.add(title)
        box.add(Box.createVerticalStrut(10))
        box.add(body)
        box.add(Box.createVerticalStrut(22))
        box.add(retry)
        box.add(Box.createVerticalStrut(10))
        box.add(external)
        add(box, BorderLayout.NORTH)
    }

    private fun pingUrl(url: String): Boolean {
        return try {
            val conn = (URI(url).toURL().openConnection() as HttpURLConnection).apply {
                connectTimeout = 1500
                readTimeout = 1500
                instanceFollowRedirects = true
                requestMethod = "HEAD"
            }
            val code = conn.responseCode
            // 200 OK, 3xx redirects, 404 tambien es aceptable (SPA root 200 + /watchtower 404 antes del SW)
            code in 200..499
        } catch (_: Throwable) {
            false
        }
    }

    private fun buildWatchtowerBase(): String {
        val s = HiveMindSettings.getInstance().state
        return s.watchtowerUrl.trimEnd('/').ifBlank { "https://hivemind.aaangelmartin.com" }
    }

    private fun buildWatchtowerUrl(): String {
        val s = HiveMindSettings.getInstance().state
        val base = buildWatchtowerBase()
        val access = URLEncoder.encode(s.accessToken, StandardCharsets.UTF_8)
        val refresh = URLEncoder.encode(s.refreshToken, StandardCharsets.UTF_8)
        return "$base/watchtower?access_token=$access&refresh_token=$refresh"
    }

    private fun smallGhostButton(text: String, onClick: () -> Unit): JButton =
        JButton(text).apply {
            font = HiveBrand.font(10, Font.BOLD)
            foreground = HiveBrand.TEXT_MUTED
            background = Color(0x18, 0x18, 0x18)
            isFocusPainted = false
            isOpaque = true
            border = BorderFactory.createCompoundBorder(
                BorderFactory.createLineBorder(HiveBrand.border, 1),
                BorderFactory.createEmptyBorder(4, 10, 4, 10),
            )
            cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)
            addActionListener { onClick() }
        }

    private fun buildPrimaryButton(text: String, onClick: () -> Unit): JButton =
        JButton(text).apply {
            font = HiveBrand.font(12, Font.BOLD)
            foreground = HiveBrand.BLACK
            background = HiveBrand.YELLOW
            isFocusPainted = false
            isOpaque = true
            isBorderPainted = false
            cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)
            border = BorderFactory.createEmptyBorder(12, 18, 12, 18)
            addActionListener { onClick() }
        }
}
