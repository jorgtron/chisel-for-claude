# Chisel for Claude

**Point. Speak. Ship.**

Chisel lets you click any element on a webpage, speak (or type) what you want changed, and have the command sent straight to Claude Code.

I built this because I was frustrated by having to give Claude context to make UI changes. Things like "change the text on /dashboard below the login form to..".
This tool will send the currently viewed URL, the HTML context of the specific element you select along with your instruction.

Using Chisel for Claude has increased my iteration speed by at least 2X, because I can stay in the browser when tweaking my designs and product and use voice as the primary input.

## How it works

```
Browser ──► Extension ──► Chisel Server ──► tmux ──► Claude Code
  │              │              │                        │
  │  click +     │  POST to     │  writes JSON +         │  hook reads
  │  speak       │  localhost    │  sends keys            │  annotations
```

1. Click the Chisel extension icon to enter selection mode
2. Click any element on the page — it highlights with an orange border
3. Speak your instruction (or type it)
4. Hit "Send to Claude" — the annotation lands in your Claude Code session

## Quick start

```bash
curl -fsSL https://raw.githubusercontent.com/jorgtron/chisel-for-claude/main/install.sh | bash
```

This installs `chisel-for-claude` globally, sets up the Claude Code hook, and prints the Chrome extension path. Then:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the path shown by the installer

Or install manually:

```bash
npm install -g chisel-for-claude
chisel setup
chisel extension
```

## Hands-free mode (recommended)

For the best experience, run Claude Code inside a tmux session named `claude`. Chisel will auto-detect it and submit annotations directly:

```bash
# Terminal 1: Start tmux session
tmux new -s claude
claude

# Terminal 2: Start Chisel server
chisel start
```

When you send an annotation from the browser, it will appear as a prompt in your Claude Code session automatically.

## CLI commands

| Command | Description |
|---------|-------------|
| `chisel setup` | Install hook into `~/.claude/settings.json` (idempotent) |
| `chisel start` | Start the annotation server (default port 3847) |
| `chisel status` | Check if hook, server, and tmux are configured |
| `chisel extension` | Print the Chrome extension path for unpacked install |

### Options

```bash
chisel start --port 4000        # Custom port
chisel start --tmux mysession   # Custom tmux session name
```

## Server API

The server runs on `http://localhost:3847` by default.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/annotate` | Send a new annotation (JSON body) |
| `GET` | `/annotations` | Get all stored annotations |
| `GET` | `/latest` | Get the latest annotation formatted as markdown |
| `DELETE` | `/annotations` | Clear all annotations |

## How the hook works

When you run `chisel setup`, it:

1. Copies `chisel.sh` to `~/.claude/hooks/`
2. Registers a `UserPromptSubmit` hook in `~/.claude/settings.json`

Before every prompt, Claude Code runs the hook. If there are pending annotations, they're injected into the prompt context. The hook auto-clears annotations after reading so they don't repeat.

## Troubleshooting

**Extension can't connect to server**
- Make sure `chisel start` is running
- Check the port matches (default: 3847)

**Annotations don't appear in Claude Code**
- Run `chisel status` to check all components
- Make sure `chisel setup` has been run
- Verify the hook exists: `cat ~/.claude/settings.json`

**Voice input not working**
- Chrome requires HTTPS or localhost for speech recognition
- Try typing your instruction instead

**tmux auto-submit not working**
- Ensure your tmux session is named `claude` (or use `--tmux <name>`)
- Check with: `tmux list-sessions`

## Requirements

- Node.js >= 18
- Chrome (or Chromium-based browser)
- Claude Code CLI
- tmux (optional, for hands-free mode)

## License

MIT
