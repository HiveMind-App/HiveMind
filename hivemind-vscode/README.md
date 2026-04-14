# HiveMind — VS Code Extension

Una colmena de IAs, para un equipo de desarrolladores. Extensión con
paridad funcional respecto al plugin oficial de IntelliJ.

## Qué hace

- **Login Swing-equivalente** contra Supabase GoTrue, con la sesión
  guardada en el SecretStorage de VS Code.
- **Watchtower embebido** en un Webview lateral (sidebar) con el dashboard
  cargado vía iframe con el token inyectado.
- **Intent watcher**: detecta comentarios `// TODO:` / `# TODO:` en los
  archivos abiertos y los sincroniza en tiempo real con `team_sessions`.
- **Decoraciones de colisión**: equivalentes a los `InlayHints` de IntelliJ.
  Cuando otro dev del equipo está editando el mismo archivo con TODOs, las
  líneas se marcan en amarillo con un mensaje en el margen.
- **Comandos**:
  - `HiveMind: Iniciar sesión`
  - `HiveMind: Cerrar sesión`
  - `HiveMind: Abrir Watchtower`
  - `HiveMind: Preguntar a la IA` (`Cmd+Shift+H` / `Ctrl+Shift+H`)
  - `HiveMind: Refrescar equipo`

## Desarrollo

```bash
cd hivemind-vscode
npm install
npm run build      # esbuild -> dist/extension.js
```

Pulsa `F5` en VS Code con este directorio abierto para lanzar un
Extension Host con la extensión cargada.

## Configuración

`Settings → Extensions → HiveMind`:

- `hivemind.supabaseUrl` — URL del workspace Supabase.
- `hivemind.supabaseAnonKey` — anon key pública.
- `hivemind.watchtowerUrl` — base URL del PWA (default
  `https://hivemind.aaangelmartin.com`).
- `hivemind.projectId` — UUID del proyecto HiveMind.
