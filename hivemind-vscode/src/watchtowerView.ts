import * as vscode from 'vscode'
import type { Auth } from './auth'
import { WATCHTOWER_URL } from './config'

/**
 * Webview view que embebe el Watchtower via iframe con ?access_token=.
 * Cuando no hay sesión, muestra un formulario Swing-equivalente de login.
 */

export class WatchtowerViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'hivemind.watchtower'

  private view?: vscode.WebviewView

  constructor(private readonly ctx: vscode.ExtensionContext, private readonly auth: Auth) {}

  async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    this.view = webviewView
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, 'media')],
    }
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'login') {
        try {
          await this.auth.signInWithPassword(msg.email, msg.password)
          await this.render()
        } catch (e) {
          webviewView.webview.postMessage({
            type: 'error',
            message: (e as Error).message,
          })
        }
      } else if (msg.type === 'logout') {
        await this.auth.signOut()
        await this.render()
      }
    })
    await this.render()
  }

  async refresh() {
    if (this.view) await this.render()
  }

  private async render() {
    if (!this.view) return
    const session = await this.auth.getSession()
    this.view.webview.html = session
      ? this.dashboardHtml(session.accessToken, session.refreshToken, session.email)
      : this.loginHtml()
  }

  private watchtowerUrl(): string {
    return `${WATCHTOWER_URL}/watchtower`
  }

  private dashboardHtml(at: string, rt: string, email: string): string {
    const url = `${this.watchtowerUrl()}?access_token=${encodeURIComponent(
      at,
    )}&refresh_token=${encodeURIComponent(rt)}`
    return /* html */ `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${
    this.watchtowerUrl().split('/watchtower')[0]
  }; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <title>HiveMind</title>
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background: #000; color: #fff; font-family: -apple-system, sans-serif; }
    .bar { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: #0E0E0E; border-bottom: 1px solid #2E2E2E; font-size: 11px; }
    .bar b { color: #F9C900; }
    .bar button { background: transparent; color: #B0B0B0; border: 1px solid #2E2E2E; padding: 2px 8px; border-radius: 4px; cursor: pointer; }
    .bar button:hover { color: #fff; border-color: #F9C900; }
    iframe { width: 100%; height: calc(100vh - 30px); border: 0; display: block; background: #000; }
  </style>
</head>
<body>
  <div class="bar">
    <span><b>⬢ HiveMind</b> · ${email}</span>
    <button onclick="acquireVsCodeApi().postMessage({ type: 'logout' })">Salir</button>
  </div>
  <iframe src="${url}" allow="clipboard-read; clipboard-write"></iframe>
  <script>
    const vscode = acquireVsCodeApi();
    document.querySelector('.bar button').onclick = () => vscode.postMessage({ type: 'logout' });
  </script>
</body>
</html>`
  }

  private loginHtml(): string {
    return /* html */ `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <title>HiveMind · Login</title>
  <style>
    :root {
      --yellow: #F9C900;
      --yellow-bright: #FFD633;
      --bg: #000000;
      --surface: #0E0E0E;
      --border: #2E2E2E;
      --muted: #B0B0B0;
    }
    html, body { margin: 0; padding: 0; background: var(--bg); color: #fff; font-family: -apple-system, 'Segoe UI', sans-serif; height: 100vh; }
    body { display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box; }
    .card { width: 100%; max-width: 320px; text-align: center; }
    .logo { font-size: 48px; color: var(--yellow); line-height: 1; margin-bottom: 8px; }
    h1 { font-size: 22px; margin: 0 0 4px; font-weight: 800; letter-spacing: -0.01em; }
    .tagline { color: var(--muted); font-size: 12px; margin-bottom: 28px; }
    .group { text-align: left; margin-bottom: 14px; }
    label { display: block; font-size: 9px; font-weight: 700; color: var(--yellow); letter-spacing: 0.1em; margin-bottom: 5px; text-transform: uppercase; }
    input { width: 100%; box-sizing: border-box; padding: 10px 12px; background: #181818; border: 1px solid var(--border); color: #fff; border-radius: 8px; font-size: 13px; outline: none; }
    input:focus { border-color: var(--yellow); }
    button.primary { width: 100%; padding: 12px; background: var(--yellow); color: #000; border: 0; border-radius: 8px; font-weight: 800; cursor: pointer; margin-top: 6px; font-size: 12px; letter-spacing: 0.05em; }
    button.primary:hover { background: var(--yellow-bright); }
    button.primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .hint { color: var(--muted); font-size: 10px; margin-top: 16px; }
    .error { color: #EF4444; font-size: 11px; min-height: 14px; margin: 8px 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">⬢</div>
    <h1>HiveMind</h1>
    <div class="tagline">Una colmena de IAs,<br/>para un equipo de desarrolladores.</div>
    <form id="loginForm">
      <div class="group">
        <label>Email</label>
        <input id="email" type="email" required autocomplete="email" placeholder="tu@email.com" />
      </div>
      <div class="group">
        <label>Contraseña</label>
        <input id="password" type="password" required autocomplete="current-password" placeholder="••••••••" />
      </div>
      <div class="error" id="error"></div>
      <button class="primary" type="submit" id="submit">ENTRAR AL WATCHTOWER</button>
    </form>
    <div class="hint">¿No tienes cuenta? Contacta a tu PM.</div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const form = document.getElementById('loginForm');
    const err = document.getElementById('error');
    const btn = document.getElementById('submit');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      err.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Autenticando...';
      vscode.postMessage({
        type: 'login',
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
      });
    });
    window.addEventListener('message', (event) => {
      const m = event.data;
      if (m && m.type === 'error') {
        err.textContent = m.message || 'Credenciales invalidas.';
        btn.disabled = false;
        btn.textContent = 'ENTRAR AL WATCHTOWER';
      }
    });
  </script>
</body>
</html>`
  }
}
