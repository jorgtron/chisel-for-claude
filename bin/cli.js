#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')

const PACKAGE_ROOT = path.resolve(__dirname, '..')
const CLAUDE_DIR = path.join(os.homedir(), '.claude')
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json')
const HOOKS_DIR = path.join(CLAUDE_DIR, 'hooks')
const HOOK_DEST = path.join(HOOKS_DIR, 'chisel.sh')
const HOOK_SRC = path.join(PACKAGE_ROOT, 'hooks', 'inject-annotations.sh')
const DEFAULT_PORT = 3847

const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const ORANGE = '\x1b[38;5;208m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const CYAN = '\x1b[36m'

function print(msg) { console.log(msg) }
function success(msg) { print(`${GREEN}  ✓${RESET} ${msg}`) }
function info(msg) { print(`${CYAN}  ℹ${RESET} ${msg}`) }
function warn(msg) { print(`${RED}  ✗${RESET} ${msg}`) }

function banner() {
  print(`
${ORANGE}${BOLD}  ╔═══════════════════════════════╗
  ║     Chisel for Claude         ║
  ╚═══════════════════════════════╝${RESET}
${DIM}  Point. Speak. Ship.${RESET}
`)
}

// ── setup ──────────────────────────────────────────────────────────────────────

function setup() {
  banner()
  print(`${BOLD}  Setting up Chisel...${RESET}\n`)

  // 1. Ensure ~/.claude directory exists
  if (!fs.existsSync(CLAUDE_DIR)) {
    fs.mkdirSync(CLAUDE_DIR, { recursive: true })
  }

  // 2. Copy hook script
  if (!fs.existsSync(HOOKS_DIR)) {
    fs.mkdirSync(HOOKS_DIR, { recursive: true })
  }

  fs.copyFileSync(HOOK_SRC, HOOK_DEST)
  fs.chmodSync(HOOK_DEST, 0o755)
  success(`Hook installed → ${HOOK_DEST}`)

  // 3. Add UserPromptSubmit hook to settings.json
  let settings = {}
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
    } catch {
      settings = {}
    }
  }

  if (!settings.hooks) settings.hooks = {}
  if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = []

  const hookEntry = {
    matcher: '',
    hooks: [{
      type: 'command',
      command: HOOK_DEST
    }]
  }

  // Check if already registered (idempotent)
  const alreadyInstalled = settings.hooks.UserPromptSubmit.some(entry =>
    entry.hooks && entry.hooks.some(h => h.command === HOOK_DEST)
  )

  if (alreadyInstalled) {
    info('Hook already registered in settings.json')
  } else {
    settings.hooks.UserPromptSubmit.push(hookEntry)
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n')
    success(`Hook registered in → ${SETTINGS_FILE}`)
  }

  print(`
${BOLD}  Setup complete!${RESET}

  Next steps:
    ${CYAN}chisel start${RESET}       Start the annotation server
    ${CYAN}chisel extension${RESET}   Get Chrome extension path for install
`)
}

// ── start ──────────────────────────────────────────────────────────────────────

function start(args) {
  const portIdx = args.indexOf('--port')
  const port = portIdx !== -1 && args[portIdx + 1] ? parseInt(args[portIdx + 1], 10) : DEFAULT_PORT

  const tmuxIdx = args.indexOf('--tmux')
  const tmuxSession = tmuxIdx !== -1 && args[tmuxIdx + 1] ? args[tmuxIdx + 1] : 'claude'

  const { createServer } = require(path.join(PACKAGE_ROOT, 'lib', 'server.js'))
  createServer({ port, tmuxSession })
}

// ── status ─────────────────────────────────────────────────────────────────────

function status() {
  banner()
  print(`${BOLD}  Status${RESET}\n`)

  // Hook installed?
  if (fs.existsSync(HOOK_DEST)) {
    success('Hook script installed')
  } else {
    warn('Hook script not found — run: chisel setup')
  }

  // Hook registered in settings?
  let hookRegistered = false
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
      hookRegistered = settings.hooks?.UserPromptSubmit?.some(entry =>
        entry.hooks?.some(h => h.command === HOOK_DEST)
      )
    } catch {}
  }
  if (hookRegistered) {
    success('Hook registered in settings.json')
  } else {
    warn('Hook not registered — run: chisel setup')
  }

  // Server running?
  let serverChecked = false
  try {
    const http = require('http')
    const req = http.get(`http://localhost:${DEFAULT_PORT}/annotations`, (res) => {
      if (serverChecked) return
      serverChecked = true
      success(`Server running on port ${DEFAULT_PORT}`)
      res.resume()
      checkTmux()
    })
    req.on('error', () => {
      if (serverChecked) return
      serverChecked = true
      warn(`Server not running on port ${DEFAULT_PORT} — run: chisel start`)
      checkTmux()
    })
    req.setTimeout(1000, () => {
      if (serverChecked) return
      serverChecked = true
      req.destroy()
      warn(`Server not responding on port ${DEFAULT_PORT}`)
      checkTmux()
    })
  } catch {
    if (!serverChecked) {
      serverChecked = true
      warn(`Server not running on port ${DEFAULT_PORT} — run: chisel start`)
      checkTmux()
    }
  }

  function checkTmux() {
    try {
      execSync('tmux has-session -t claude 2>/dev/null')
      success('tmux "claude" session found')
    } catch {
      warn('No tmux "claude" session — start one: tmux new -s claude')
    }
    print('')
  }
}

// ── extension ──────────────────────────────────────────────────────────────────

function extension() {
  const extPath = path.join(PACKAGE_ROOT, 'extension')
  banner()
  print(`${BOLD}  Chrome Extension${RESET}\n`)
  print(`  Load as unpacked extension in Chrome:\n`)
  print(`    1. Open ${CYAN}chrome://extensions${RESET}`)
  print(`    2. Enable ${BOLD}Developer mode${RESET} (top right)`)
  print(`    3. Click ${BOLD}Load unpacked${RESET}`)
  print(`    4. Select this directory:\n`)
  print(`       ${GREEN}${extPath}${RESET}\n`)
}

// ── help ───────────────────────────────────────────────────────────────────────

function help() {
  banner()
  print(`${BOLD}  Usage:${RESET}  chisel <command> [options]\n`)
  print(`${BOLD}  Commands:${RESET}`)
  print(`    ${CYAN}setup${RESET}       Install hook into ~/.claude/settings.json`)
  print(`    ${CYAN}start${RESET}       Start the annotation server`)
  print(`    ${CYAN}status${RESET}      Check if everything is configured`)
  print(`    ${CYAN}extension${RESET}   Show Chrome extension install path\n`)
  print(`${BOLD}  Options:${RESET}`)
  print(`    ${CYAN}--port${RESET} <n>    Server port (default: ${DEFAULT_PORT})`)
  print(`    ${CYAN}--tmux${RESET} <name> tmux session name (default: claude)\n`)
}

// ── main ───────────────────────────────────────────────────────────────────────

const [,, command, ...args] = process.argv

switch (command) {
  case 'setup':     setup(); break
  case 'start':     start(args); break
  case 'status':    status(); break
  case 'extension': extension(); break
  case 'help':
  case '--help':
  case '-h':        help(); break
  default:          help(); break
}
