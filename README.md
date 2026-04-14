# HiveMind CLI

> **A hive of AIs, for a team of developers.**

HiveMind is an open-source tool that wraps your AI CLI (Gemini, Claude Code, etc.) and synchronizes your team's intentions in real time — so every developer knows what every AI agent is doing, preventing duplicate work and surfacing conflicts before they happen.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green)](https://nodejs.org)

---

## What's in this repo

```
hivemind-cli/
├── src/                  # CLI source (Node.js / TypeScript)
│   ├── index.ts          # Entry point — registers all subcommands
│   ├── config.ts         # ~/.hivemind/config.json management
│   ├── brand.ts          # Colors and ASCII banner
│   ├── core/
│   │   ├── interceptor.ts  # PTY wrapper — intercepts AI CLI turns
│   │   ├── realtime.ts     # Supabase Realtime subscription
│   │   ├── mcp-server.ts   # MCP server (Model Context Protocol)
│   │   └── ...
│   └── commands/
│       ├── init.ts       # `hivemind init`
│       ├── run.ts        # `hivemind run`
│       ├── status.ts     # `hivemind status`
│       └── ...
├── hivemind-vscode/      # VS Code extension
└── hivemind-plugin/      # IntelliJ / Android Studio plugin (Kotlin)
```

---

## Quick start

### Prerequisites

- Node.js 20+
- A HiveMind backend (see [hivemind-cloud](https://github.com/yourorg/hivemind-cloud) to self-host)
- The AI CLI you want to wrap (e.g. `npm install -g @google/gemini-cli`)

### Install

```bash
npm install -g hivemind-cli
```

Or from source:

```bash
git clone https://github.com/yourorg/hivemind-cli
cd hivemind-cli
npm install
npm run build
npm link   # makes `hivemind` available globally
```

### Configure

1. Copy `.env.example` to `.env` and fill in your HiveMind backend credentials:

```bash
cp .env.example .env
```

```env
HIVEMIND_SUPABASE_URL=https://your-project-ref.supabase.co
HIVEMIND_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

2. Initialize your local identity (your team's PM will give you your credentials):

```bash
hivemind init
```

### Run

```bash
hivemind run          # Wraps `gemini` CLI — every turn syncs to the hive
hivemind status       # Shows your local config and connectivity
hivemind pull-context # Downloads your team's shared system prompt
hivemind mcp          # Starts the MCP server (used by Gemini CLI auto-discovery)
```

---

## Commands

| Command | Description |
|---------|-------------|
| `hivemind init` | First-time setup. Authenticates against your HiveMind backend and saves credentials to `~/.hivemind/config.json`. |
| `hivemind login` | Renew your session without re-running init. |
| `hivemind logout` | Clear local session. Use `--full` to wipe the entire config. |
| `hivemind run` | Launch your AI CLI wrapped in a PTY. Every conversation turn is intercepted and synced to Supabase in real time. |
| `hivemind pull-context` | Download the team system prompt (role, current task, team snapshot). |
| `hivemind status` | Show current config and backend connectivity. |
| `hivemind mcp` | Start the MCP server in stdio mode (auto-discovered by Gemini CLI). |

---

## IDE Extensions

### VS Code

```bash
cd hivemind-vscode
npm install
npm run build
# Install the generated .vsix in VS Code: Extensions → "Install from VSIX..."
```

The extension adds a **Watchtower** panel to the activity bar showing your team's live activity, and a `Ctrl+Shift+H` shortcut to ask the AI with team context injected.

### IntelliJ / Android Studio

```bash
cd hivemind-plugin
./gradlew buildPlugin
# Install from: Settings → Plugins → ⚙ → Install Plugin from Disk
```

---

## Architecture

```
Developer types a prompt
       │
       ▼
  hivemind run                   (PTY wrapper)
       │  intercepts turn
       ▼
  invokeFunction("register-intent")   ──► Supabase Edge Function
       │
       ├──► "get-team-context"         ──► team snapshot (who's doing what)
       │
       ├──► "check-dependencies"       ──► conflict detection
       │
       └──► injects context block into PTY ──► AI CLI sees team state
```

Realtime events flow back via **Supabase Realtime** — every developer's editor and AI agent see live updates from the hive.

---

## Self-hosting

To point the CLI at your own HiveMind backend, set `HIVEMIND_SUPABASE_URL` and `HIVEMIND_SUPABASE_ANON_KEY` in your `.env` file. See [hivemind-cloud](https://github.com/yourorg/hivemind-cloud) for instructions on deploying the backend.

---

## Contributing

Pull requests are welcome! Please read [CONTRIBUTING.md](../CONTRIBUTING.md) first.

## License

[GNU Affero General Public License v3.0](LICENSE) — software libre: puedes usar, modificar y distribuir, pero las versiones modificadas (incluso las que se ejecutan como servicio en red) deben publicarse bajo la misma licencia.
