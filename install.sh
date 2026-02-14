#!/bin/bash
set -e

# Chisel for Claude — One-line installer
# curl -fsSL https://raw.githubusercontent.com/jorgtron/chisel-for-claude/main/install.sh | bash

BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'
ORANGE='\033[38;5;208m'
GREEN='\033[32m'
RED='\033[31m'
CYAN='\033[36m'

ok()   { echo -e "${GREEN}  ✓${RESET} $1"; }
fail() { echo -e "${RED}  ✗${RESET} $1"; }
info() { echo -e "${CYAN}  ℹ${RESET} $1"; }

echo -e "
${ORANGE}${BOLD}  ╔═══════════════════════════════╗
  ║     Chisel for Claude         ║
  ╚═══════════════════════════════╝${RESET}
${DIM}  Point. Speak. Ship.${RESET}
"

# ── Check prerequisites ──────────────────────────────────────────

echo -e "${BOLD}  Checking prerequisites...${RESET}\n"

if ! command -v node &>/dev/null; then
  fail "Node.js not found. Install it from https://nodejs.org (v18+)"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  fail "Node.js v18+ required (found v$(node -v | sed 's/v//'))"
  exit 1
fi
ok "Node.js $(node -v)"

if ! command -v npm &>/dev/null; then
  fail "npm not found"
  exit 1
fi
ok "npm $(npm -v)"

if command -v tmux &>/dev/null; then
  ok "tmux $(tmux -V | awk '{print $2}')"
else
  info "tmux not found (optional — needed for hands-free mode)"
fi

# ── Install ──────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}  Installing chisel-for-claude...${RESET}\n"

npm install -g chisel-for-claude
ok "chisel-for-claude installed globally"

# ── Setup hook ───────────────────────────────────────────────────

echo ""
echo -e "${BOLD}  Running setup...${RESET}\n"

chisel setup

# ── Chrome extension ─────────────────────────────────────────────

EXT_PATH=$(npm root -g)/chisel-for-claude/extension

echo -e "${BOLD}  Last step — load the Chrome extension:${RESET}
"
echo -e "    1. Open ${CYAN}chrome://extensions${RESET} in Chrome"
echo -e "    2. Enable ${BOLD}Developer mode${RESET} (top right toggle)"
echo -e "    3. Click ${BOLD}Load unpacked${RESET}"
echo -e "    4. Select this folder:"
echo ""
echo -e "       ${GREEN}${EXT_PATH}${RESET}"
echo ""

# ── Done ─────────────────────────────────────────────────────────

echo -e "${ORANGE}${BOLD}  ╔═══════════════════════════════════════════════════╗
  ║  Done! Start using Chisel:                        ║
  ║                                                   ║
  ║    tmux new -s claude    # start tmux session      ║
  ║    claude                # launch Claude Code      ║
  ║    chisel start          # start Chisel server     ║
  ║                                                   ║
  ║  Then click the Chisel icon in Chrome.             ║
  ╚═══════════════════════════════════════════════════╝${RESET}
"
