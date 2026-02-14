// Chisel for Claude - Content Script
(function() {
  let annotationMode = false
  let hoveredElement = null
  let selectedElement = null
  let overlay = null
  let tooltip = null
  let voicePanel = null
  let recognition = null

  // Settings (persisted to localStorage)
  const STORAGE_KEY = 'chisel-settings'
  let settings = loadSettings()

  function loadSettings() {
    const defaults = { speakOnClick: false, cancelPhrase: 'cancel', sendPhrase: 'chisel', viewportMode: 'both', language: 'en-US' }
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        // Migrate old cancelWord key
        if (parsed.cancelWord && !parsed.cancelPhrase) {
          parsed.cancelPhrase = parsed.cancelWord
          delete parsed.cancelWord
        }
        // Migrate removed detect mode
        if (parsed.viewportMode === 'detect') {
          parsed.viewportMode = 'both'
        }
        return { ...defaults, ...parsed }
      }
    } catch {}
    return defaults
  }

  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) } catch {}
  }

  // ── Activity log ────────────────────────────────────────────────

  function logActivity(message, type = 'info') {
    if (!voicePanel) return
    const log = voicePanel.querySelector('.chisel-log')
    if (!log) return
    const entry = document.createElement('div')
    entry.className = `chisel-log-entry chisel-log-${type}`
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    entry.textContent = `${time}  ${message}`
    log.appendChild(entry)
    log.scrollTop = log.scrollHeight
  }

  // Create overlay for highlighting
  function createOverlay() {
    overlay = document.createElement('div')
    overlay.id = 'chisel-overlay'
    document.body.appendChild(overlay)

  }

  // Create voice input panel
  function createVoicePanel() {
    voicePanel = document.createElement('div')
    voicePanel.id = 'chisel-voice-panel'
    const logoUrl = chrome.runtime.getURL('icons/icon48.png')
    voicePanel.innerHTML = `
      <div class="chisel-header">
        <div class="chisel-header-left">
          <img src="${logoUrl}" class="chisel-logo" alt="">
          <span class="chisel-title">Chisel</span>
        </div>
        <button class="chisel-close">&times;</button>
      </div>
      <div class="chisel-element-info">
        <span class="chisel-element-placeholder">Click any element to select it</span>
      </div>
      <div class="chisel-settings">
        <div class="chisel-settings-row">
          <label class="chisel-toggle">
            <input type="checkbox" class="chisel-toggle-input" data-setting="speakOnClick">
            <span class="chisel-toggle-slider"></span>
            <span class="chisel-toggle-label">Start recording on click</span>
          </label>
        </div>
        <div class="chisel-settings-row">
          <div class="chisel-phrase-group">
            <span class="chisel-phrase-label">Send phrase:</span>
            <input type="text" class="chisel-phrase-input chisel-send-phrase-input" value="chisel" spellcheck="false">
          </div>
          <div class="chisel-phrase-group">
            <span class="chisel-phrase-label">Cancel phrase:</span>
            <input type="text" class="chisel-phrase-input chisel-cancel-phrase-input" value="cancel" spellcheck="false">
          </div>
        </div>
        <div class="chisel-settings-row">
          <span class="chisel-phrase-label">Voice language:</span>
          <select class="chisel-language-select">
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="es-ES">Spanish</option>
            <option value="fr-FR">French</option>
            <option value="de-DE">German</option>
            <option value="it-IT">Italian</option>
            <option value="pt-BR">Portuguese (BR)</option>
            <option value="pt-PT">Portuguese (PT)</option>
            <option value="nl-NL">Dutch</option>
            <option value="nb-NO">Norwegian</option>
            <option value="sv-SE">Swedish</option>
            <option value="da-DK">Danish</option>
            <option value="fi-FI">Finnish</option>
            <option value="pl-PL">Polish</option>
            <option value="ru-RU">Russian</option>
            <option value="uk-UA">Ukrainian</option>
            <option value="ja-JP">Japanese</option>
            <option value="ko-KR">Korean</option>
            <option value="zh-CN">Chinese (Simplified)</option>
            <option value="zh-TW">Chinese (Traditional)</option>
            <option value="hi-IN">Hindi</option>
            <option value="ar-SA">Arabic</option>
            <option value="tr-TR">Turkish</option>
          </select>
        </div>
        <div class="chisel-settings-row">
          <span class="chisel-viewport-label">Make changes in:</span>
          <div class="chisel-segmented">
            <button class="chisel-seg-btn active" data-mode="both">Both</button>
            <button class="chisel-seg-btn" data-mode="desktop">Desktop</button>
            <button class="chisel-seg-btn" data-mode="mobile">Mobile</button>
          </div>
        </div>
      </div>
      <div class="chisel-voice-status">
        <div class="chisel-mic-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/>
          </svg>
        </div>
        <span class="chisel-status-text">Press space to start voice recording</span>
      </div>
      <textarea class="chisel-transcript" placeholder="Your instruction will appear here..."></textarea>
      <div class="chisel-actions">
        <button class="chisel-btn chisel-btn-mic">Start Voice</button>
        <button class="chisel-btn chisel-btn-send" disabled>Send to Claude</button>
        <button class="chisel-btn chisel-btn-cancel">Cancel</button>
      </div>
      <div class="chisel-log"></div>
    `
    document.body.appendChild(voicePanel)

    // Event listeners
    voicePanel.querySelector('.chisel-close').onclick = () => {
      hideVoicePanel()
      if (annotationMode && !selectedElement) toggleAnnotationMode()
    }
    voicePanel.querySelector('.chisel-btn-cancel').onclick = () => {
      hideVoicePanel()
      if (annotationMode && !selectedElement) toggleAnnotationMode()
    }
    voicePanel.querySelector('.chisel-btn-mic').onclick = toggleVoiceRecording
    voicePanel.querySelector('.chisel-btn-send').onclick = sendAnnotation
    voicePanel.querySelector('.chisel-transcript').addEventListener('input', updateSendButton)

    // Speak on click toggle
    const speakToggle = voicePanel.querySelector('.chisel-toggle-input')
    speakToggle.checked = settings.speakOnClick
    speakToggle.onchange = () => {
      settings.speakOnClick = speakToggle.checked
      saveSettings()
    }

    // Cancel phrase input
    const cancelInput = voicePanel.querySelector('.chisel-cancel-phrase-input')
    cancelInput.value = settings.cancelPhrase
    cancelInput.onchange = () => {
      settings.cancelPhrase = cancelInput.value.trim().toLowerCase() || 'cancel'
      cancelInput.value = settings.cancelPhrase
      saveSettings()
    }

    // Send phrase input
    const sendInput = voicePanel.querySelector('.chisel-send-phrase-input')
    sendInput.value = settings.sendPhrase
    sendInput.onchange = () => {
      settings.sendPhrase = sendInput.value.trim().toLowerCase() || 'chisel'
      sendInput.value = settings.sendPhrase
      saveSettings()
    }

    // Language select
    const langSelect = voicePanel.querySelector('.chisel-language-select')
    langSelect.value = settings.language
    langSelect.onchange = () => {
      settings.language = langSelect.value
      saveSettings()
    }

    // Viewport segmented control
    const segBtns = voicePanel.querySelectorAll('.chisel-seg-btn')
    segBtns.forEach(btn => {
      if (btn.dataset.mode === settings.viewportMode) {
        btn.classList.add('active')
      } else {
        btn.classList.remove('active')
      }
      btn.onclick = () => {
        segBtns.forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        settings.viewportMode = btn.dataset.mode
        saveSettings()
      }
    })

    // Keyboard shortcut
    document.addEventListener('keydown', (e) => {
      if (voicePanel.classList.contains('visible') && e.code === 'Space' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
        e.preventDefault()
        toggleVoiceRecording()
      }
    })
  }

  // Get unique CSS selector for element
  function getSelector(el) {
    if (el.id) return `#${el.id}`

    const path = []
    while (el && el.nodeType === Node.ELEMENT_NODE) {
      let selector = el.tagName.toLowerCase()
      if (el.id) {
        selector = `#${el.id}`
        path.unshift(selector)
        break
      }
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.trim().split(/\s+/).filter(c => c && !c.startsWith('chisel'))
        if (classes.length) {
          selector += '.' + classes.slice(0, 2).join('.')
        }
      }
      const parent = el.parentElement
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName)
        if (siblings.length > 1) {
          const index = siblings.indexOf(el) + 1
          selector += `:nth-of-type(${index})`
        }
      }
      path.unshift(selector)
      el = parent
    }
    return path.slice(-4).join(' > ')
  }

  // Get computed styles
  function getRelevantStyles(el) {
    const computed = window.getComputedStyle(el)
    return {
      display: computed.display,
      position: computed.position,
      width: computed.width,
      height: computed.height,
      padding: computed.padding,
      margin: computed.margin,
      fontSize: computed.fontSize,
      color: computed.color,
      backgroundColor: computed.backgroundColor
    }
  }

  // Update overlay position
  function updateOverlay(el) {
    if (!el || !overlay) return
    const rect = el.getBoundingClientRect()
    overlay.style.top = `${rect.top + window.scrollY}px`
    overlay.style.left = `${rect.left + window.scrollX}px`
    overlay.style.width = `${rect.width}px`
    overlay.style.height = `${rect.height}px`
    overlay.style.display = 'block'

  }

  // Hide overlay
  function hideOverlay() {
    if (overlay) overlay.style.display = 'none'
    if (tooltip) tooltip.style.display = 'none'
  }

  // Update send button state based on whether there's an instruction
  function updateSendButton() {
    const btn = voicePanel.querySelector('.chisel-btn-send')
    const transcript = voicePanel.querySelector('.chisel-transcript').value.replace(/\s*\[.*?\]$/, '').trim()
    btn.disabled = !transcript
  }

  // Show voice panel (with or without a selected element)
  function showVoicePanel(element) {
    if (element) {
      selectedElement = element
      const selector = getSelector(element)
      const tag = element.tagName.toLowerCase()
      const classes = element.className && typeof element.className === 'string'
        ? element.className.split(' ').filter(c => !c.startsWith('chisel')).slice(0, 3).join(' ')
        : ''

      voicePanel.querySelector('.chisel-element-info').innerHTML = `
        <strong>Selected:</strong> <code>&lt;${tag}${classes ? ` class="${classes}"` : ''}&gt;</code>
        <br><strong>Selector:</strong> <code>${selector}</code>
      `
      updateSendButton()
      logActivity(`Selected <${tag}> ${selector}`)

      // Auto-start recording if speak-on-click is enabled
      if (settings.speakOnClick && !recognition) {
        setTimeout(() => toggleVoiceRecording(), 150)
      }
    } else {
      // No element — show placeholder
      voicePanel.querySelector('.chisel-element-info').innerHTML = `
        <span class="chisel-element-placeholder">Click any area on the page, then voice record the change you want to make. Say "Chisel" when done to send the instruction to Claude.</span>
      `
      updateSendButton()
    }

    voicePanel.classList.add('visible')
  }

  // Hide voice panel
  function hideVoicePanel() {
    voicePanel.classList.remove('visible')
    selectedElement = null
    if (recognition) {
      recognition.stop()
      recognition = null
    }
    updateMicButton(false)
  }

  // Cancel via voice — clear transcript and stop recording
  function voiceCancel() {
    logActivity('Cancel phrase detected — clearing', 'warn')
    if (recognition) {
      recognition.stop()
      recognition = null
    }
    voicePanel.querySelector('.chisel-transcript').value = ''
    updateMicButton(false)
    showNotification('Cancelled by voice')
  }

  // Send via voice — strip the send phrase from transcript and send
  function voiceSend() {
    logActivity('Send phrase detected — sending', 'ok')
    const transcript = voicePanel.querySelector('.chisel-transcript')
    const cleaned = transcript.value.replace(/\[.*?\]$/, '').trim()
    transcript.value = cleaned
    if (recognition) {
      recognition.stop()
      recognition = null
    }
    updateMicButton(false)
    sendAnnotation()
  }

  // Strip punctuation and normalize for phrase matching
  function normalize(text) {
    return text.toLowerCase().replace(/[.,!?;:'"]+/g, '').trim()
  }

  // Check if a spoken segment ends with a phrase (handles "make it bigger chisel")
  function endsWithPhrase(spoken, phrase) {
    if (!phrase) return false
    const norm = normalize(spoken)
    const target = normalize(phrase)
    if (!norm || !target) return false
    // Check: entire segment is the phrase, OR segment ends with the phrase as a separate word
    if (norm === target) return true
    return norm.endsWith(' ' + target)
  }

  // Remove trailing phrase from transcript text
  function stripTrailingPhrase(text, phrase) {
    const target = normalize(phrase)
    const norm = normalize(text)
    if (norm === target) return ''
    if (norm.endsWith(' ' + target)) {
      // Remove the phrase from the original text (preserve casing of the rest)
      // Find approximately where the phrase starts
      const idx = text.toLowerCase().lastIndexOf(phrase.toLowerCase().trim())
      if (idx > 0) return text.substring(0, idx).trim()
    }
    return text
  }

  // Toggle voice recording
  function toggleVoiceRecording() {
    if (recognition) {
      recognition.stop()
      recognition = null
      updateMicButton(false)
      logActivity('Recording stopped')
      return
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition not supported in this browser. Please type your instruction.')
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = settings.language

    const transcript = voicePanel.querySelector('.chisel-transcript')

    recognition.onresult = (event) => {
      let finalTranscript = ''
      let interimTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript
        } else {
          interimTranscript += event.results[i][0].transcript
        }
      }

      // Check for cancel/send phrases in final transcript segment
      if (finalTranscript) {
        const segment = finalTranscript.trim()
        logActivity(`Heard: "${segment}"`)

        if (endsWithPhrase(segment, settings.cancelPhrase)) {
          voiceCancel()
          return
        }
        if (endsWithPhrase(segment, settings.sendPhrase)) {
          // Add the text before the phrase to the transcript, then send
          const before = stripTrailingPhrase(segment, settings.sendPhrase)
          if (before) {
            const existing = transcript.value.replace(/\s*\[.*?\]$/, '').trimEnd()
            transcript.value = existing ? existing + ' ' + before.trim() : before.trim()
          }
          voiceSend()
          return
        }
      }

      // Build clean transcript: strip interim marker, add final text, add new interim
      let current = transcript.value.replace(/\s*\[.*?\]$/, '').trimEnd()
      if (finalTranscript) {
        const trimmed = finalTranscript.trim()
        if (trimmed) {
          current = current ? current + ' ' + trimmed : trimmed
        }
      }
      if (interimTranscript) {
        const trimmedInterim = interimTranscript.trim()
        if (trimmedInterim) {
          transcript.value = (current ? current + ' ' : '') + '[' + trimmedInterim + ']'
        } else {
          transcript.value = current
        }
      } else {
        transcript.value = current
      }
      updateSendButton()
    }

    recognition.onend = () => {
      updateMicButton(false)
      recognition = null
      logActivity('Mic stopped')
    }

    recognition.onerror = (event) => {
      logActivity(`Mic error: ${event.error}`, 'error')
      updateMicButton(false)
      recognition = null
    }

    recognition.start()
    updateMicButton(true)
    logActivity('Recording started')
  }

  function updateMicButton(isRecording) {
    const btn = voicePanel.querySelector('.chisel-btn-mic')
    const status = voicePanel.querySelector('.chisel-status-text')
    if (isRecording) {
      btn.textContent = 'Stop'
      btn.classList.add('recording')
      status.textContent = 'Listening...'
      voicePanel.querySelector('.chisel-mic-icon').classList.add('recording')
    } else {
      btn.textContent = 'Start Voice'
      btn.classList.remove('recording')
      status.textContent = settings.speakOnClick ? 'Voice starts on click' : 'Click mic or press Space to start'
      voicePanel.querySelector('.chisel-mic-icon').classList.remove('recording')
    }
  }

  // Resolve viewport mode to a prompt prefix
  function getViewportPrefix() {
    const mode = settings.viewportMode
    if (mode === 'desktop') return 'Apply these changes only to the desktop version (viewports >= 768px). '
    if (mode === 'mobile') return 'Apply these changes only to the mobile version (viewports < 768px). '
    return ''
  }

  // Send annotation to Claude
  function sendAnnotation() {
    const raw = voicePanel.querySelector('.chisel-transcript').value.trim().replace(/\s*\[.*?\]$/, '').trim()
    if (!raw) {
      alert('Please provide an instruction (type or use voice)')
      return
    }

    const instruction = getViewportPrefix() + raw
    logActivity(`Sending: "${raw.substring(0, 60)}${raw.length > 60 ? '...' : ''}"`)

    const data = {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      viewportWidth: window.innerWidth,
      viewportMode: settings.viewportMode,
      instruction: instruction
    }

    if (selectedElement) {
      data.selector = getSelector(selectedElement)
      data.tagName = selectedElement.tagName.toLowerCase()
      data.className = selectedElement.className
      data.id = selectedElement.id
      data.innerHTML = selectedElement.innerHTML.substring(0, 500)
      data.outerHTML = selectedElement.outerHTML.substring(0, 1000)
      data.styles = getRelevantStyles(selectedElement)
      data.rect = selectedElement.getBoundingClientRect().toJSON()
    }

    // Send to background script
    chrome.runtime.sendMessage({ action: 'sendAnnotation', data }, (response) => {
      if (response && response.success) {
        logActivity('Delivered to server', 'ok')
        showNotification('Sent to Claude Code!')
        // Reset for next annotation — keep panel open
        selectedElement = null
        hideOverlay()
        voicePanel.querySelector('.chisel-transcript').value = ''
        voicePanel.querySelector('.chisel-element-info').innerHTML = `
          <span class="chisel-element-placeholder">Click any element to select it</span>
        `
        updateSendButton()
      } else {
        logActivity('Server error — is chisel start running?', 'error')
        showNotification('Failed to send. Is the server running?', true)
      }
    })
  }

  // Show notification
  function showNotification(message, isError = false) {
    const notif = document.createElement('div')
    notif.className = `chisel-notification ${isError ? 'error' : 'success'}`
    notif.textContent = message
    document.body.appendChild(notif)
    setTimeout(() => notif.remove(), 3000)
  }

  // Mouse event handlers
  function onMouseMove(e) {
    if (!annotationMode) return

    const el = document.elementFromPoint(e.clientX, e.clientY)
    if (el && el !== hoveredElement && !el.id?.startsWith('chisel') && !el.closest('#chisel-voice-panel')) {
      hoveredElement = el
      updateOverlay(el)
    }
  }

  function onClick(e) {
    if (!annotationMode) return

    const el = document.elementFromPoint(e.clientX, e.clientY)
    if (el && !el.id?.startsWith('chisel') && !el.closest('#chisel-voice-panel')) {
      e.preventDefault()
      e.stopPropagation()
      showVoicePanel(el)
    }
  }

  // Toggle annotation mode
  function toggleAnnotationMode() {
    annotationMode = !annotationMode

    if (annotationMode) {
      document.body.classList.add('chisel-active')
      if (!overlay) createOverlay()
      if (!voicePanel) createVoicePanel()
      // Auto-select Mobile version if viewport is narrow (unless user already picked something)
      if (window.innerWidth < 768 && settings.viewportMode === 'both') {
        settings.viewportMode = 'mobile'
        saveSettings()
        const segBtns = voicePanel.querySelectorAll('.chisel-seg-btn')
        segBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === 'mobile'))
      }
      // Show the panel immediately so the user sees settings
      showVoicePanel(null)
      showNotification('Chisel ON — Click any element')
      logActivity('Chisel activated')
    } else {
      document.body.classList.remove('chisel-active')
      hideOverlay()
      hideVoicePanel()
      showNotification('Chisel OFF')
    }
  }

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'toggleAnnotationMode') {
      toggleAnnotationMode()
      sendResponse({ annotationMode })
    }
  })

  // Add event listeners
  document.addEventListener('mousemove', onMouseMove, true)
  document.addEventListener('click', onClick, true)

  // Escape to cancel
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (voicePanel && voicePanel.classList.contains('visible')) {
        hideVoicePanel()
        if (annotationMode) toggleAnnotationMode()
      } else if (annotationMode) {
        toggleAnnotationMode()
      }
    }
  })
})()
