const http = require('http')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')

const ANNOTATIONS_FILE = path.join(os.homedir(), '.claude', 'annotations.json')

// ANSI colors
const O = '\x1b[38;5;208m'
const B = '\x1b[1m'
const D = '\x1b[2m'
const R = '\x1b[0m'
const G = '\x1b[32m'
const Y = '\x1b[33m'

function ensureAnnotationsFile() {
  const dir = path.dirname(ANNOTATIONS_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (!fs.existsSync(ANNOTATIONS_FILE)) {
    fs.writeFileSync(ANNOTATIONS_FILE, JSON.stringify({ annotations: [] }, null, 2))
  }
}

function getAnnotations() {
  try {
    return JSON.parse(fs.readFileSync(ANNOTATIONS_FILE, 'utf8'))
  } catch {
    return { annotations: [] }
  }
}

function saveAnnotations(data) {
  fs.writeFileSync(ANNOTATIONS_FILE, JSON.stringify(data, null, 2))
}

function formatForClaude(annotation) {
  let text = `
## Annotation from ${new Date(annotation.timestamp).toLocaleString()}

**Page:** ${annotation.url}
`

  if (annotation.tagName) {
    text += `
**Element:** \`<${annotation.tagName}${annotation.className ? ` class="${annotation.className}"` : ''}${annotation.id ? ` id="${annotation.id}"` : ''}>\`

**Selector:** \`${annotation.selector}\`

**Current Styles:**
\`\`\`json
${JSON.stringify(annotation.styles, null, 2)}
\`\`\`
`
  }

  text += `
**Instruction:** ${annotation.instruction}
`

  if (annotation.outerHTML) {
    text += `
**Element HTML (truncated):**
\`\`\`html
${annotation.outerHTML}
\`\`\`
`
  }

  return text
}

function sendToClaudeCode(annotation, tmuxSession) {
  try {
    execSync(`tmux has-session -t ${tmuxSession} 2>/dev/null`)
  } catch {
    console.log(`\n  No tmux session "${tmuxSession}" found.`)
    console.log(`  Start one with: tmux new -s ${tmuxSession} && claude`)
    return false
  }

  // Include URL for context
  const urlContext = annotation.url ? ` (on ${annotation.url})` : ''
  const prompt = `New annotation${urlContext}: ${annotation.instruction}`

  try {
    execSync(`tmux send-keys -t ${tmuxSession} -l ${JSON.stringify(prompt)}`)
    execSync(`tmux send-keys -t ${tmuxSession} Enter`)
    console.log(`  -> Sent to tmux session "${tmuxSession}"`)
    // Start auto-accepting edits
    autoAcceptEdits(tmuxSession)
    return true
  } catch (e) {
    console.log(`  -> Failed to send to tmux: ${e.message}`)
    return false
  }
}

// ── Auto-accept edits ────────────────────────────────────────────
//
// After sending a prompt, polls the tmux pane for Claude Code's
// permission prompts and auto-sends 'y' to accept them.

let acceptWatcher = null

function autoAcceptEdits(tmuxSession) {
  // Cancel any existing watcher
  if (acceptWatcher) clearInterval(acceptWatcher)

  const startTime = Date.now()
  const MAX_DURATION = 5 * 60 * 1000 // 5 minutes
  const POLL_INTERVAL = 1500 // 1.5 seconds
  let lastAcceptTime = 0

  console.log(`  -> ${Y}Auto-accept ON${R} (watching for permission prompts)`)

  acceptWatcher = setInterval(() => {
    // Stop after max duration
    if (Date.now() - startTime > MAX_DURATION) {
      console.log(`  -> Auto-accept timed out after 5 min`)
      clearInterval(acceptWatcher)
      acceptWatcher = null
      return
    }

    try {
      // Capture the last 10 lines of the tmux pane
      const pane = execSync(
        `tmux capture-pane -t ${tmuxSession} -p -S -10 2>/dev/null`,
        { encoding: 'utf8', timeout: 3000 }
      )
      const content = pane.toLowerCase()

      // Detect Claude Code permission prompts
      // Common patterns: "Allow?", "(y)es", "allow edit", "allow write", "allow bash"
      const hasPrompt = (
        (content.includes('allow') && (content.includes('(y)') || content.includes('yes') || content.includes('y/n'))) ||
        content.includes('do you want to') ||
        content.includes('proceed?')
      )

      // Don't spam — wait at least 2s between accepts
      if (hasPrompt && Date.now() - lastAcceptTime > 2000) {
        execSync(`tmux send-keys -t ${tmuxSession} y`)
        execSync(`tmux send-keys -t ${tmuxSession} Enter`)
        lastAcceptTime = Date.now()
        console.log(`  -> ${G}Auto-accepted${R} edit in Claude Code`)
      }
    } catch {
      // tmux pane read failed — session may be gone
    }
  }, POLL_INTERVAL)
}

// Stop auto-accept (called when a new annotation comes in, or server shuts down)
function stopAutoAccept() {
  if (acceptWatcher) {
    clearInterval(acceptWatcher)
    acceptWatcher = null
  }
}

function createServer(options = {}) {
  const port = options.port || 3847
  const tmuxSession = options.tmuxSession || 'claude'

  ensureAnnotationsFile()

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }

    if (req.method === 'POST' && req.url === '/annotate') {
      let body = ''
      req.on('data', chunk => body += chunk)
      req.on('end', () => {
        try {
          const annotation = JSON.parse(body)
          const data = getAnnotations()
          data.annotations.unshift(annotation)
          data.annotations = data.annotations.slice(0, 20)
          saveAnnotations(data)

          console.log('\n' + '='.repeat(60))
          console.log('NEW ANNOTATION RECEIVED')
          console.log('='.repeat(60))
          console.log(formatForClaude(annotation))
          console.log('='.repeat(60))
          console.log(`\nFile saved to: ${ANNOTATIONS_FILE}`)

          sendToClaudeCode(annotation, tmuxSession)

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, message: 'Annotation saved' }))
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid JSON' }))
        }
      })
      return
    }

    if (req.method === 'GET' && req.url === '/annotations') {
      const data = getAnnotations()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(data))
      return
    }

    if (req.method === 'GET' && req.url === '/latest') {
      const data = getAnnotations()
      if (data.annotations.length === 0) {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('No annotations yet.')
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(formatForClaude(data.annotations[0]))
      return
    }

    if (req.method === 'DELETE' && req.url === '/annotations') {
      saveAnnotations({ annotations: [] })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, message: 'Annotations cleared' }))
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
  })

  // Clean up on shutdown
  process.on('SIGINT', () => {
    stopAutoAccept()
    process.exit(0)
  })
  process.on('SIGTERM', () => {
    stopAutoAccept()
    process.exit(0)
  })

  server.listen(port, () => {
    let tmuxReady = false
    try {
      execSync(`tmux has-session -t ${tmuxSession} 2>/dev/null`)
      tmuxReady = true
    } catch {}

    console.log(`
${O}${B}╔═══════════════════════════════════════════════════════════════╗
║                    Chisel for Claude                          ║
╠═══════════════════════════════════════════════════════════════╣${R}
  Server:      ${G}http://localhost:${port}${R}
  File:        ${D}${ANNOTATIONS_FILE}${R}
  tmux:        ${tmuxReady ? `${G}"${tmuxSession}" session found — auto-send ON${R}` : `No "${tmuxSession}" session — start one (see below)`}
  Auto-accept: ${G}ON${R} ${D}(will approve Claude Code edits automatically)${R}
${O}${B}╠═══════════════════════════════════════════════════════════════╣${R}
${D}
  Hands-free mode (recommended):
    tmux new -s ${tmuxSession}    ${D}# in new terminal${R}
${D}    claude                      # start Claude Code${R}

${D}  Annotations will be sent automatically to Claude Code.${R}
${D}  Permission prompts will be auto-accepted.${R}
${O}${B}╚═══════════════════════════════════════════════════════════════╝${R}
`)
  })

  return server
}

module.exports = { createServer }
