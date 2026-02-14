// Chisel for Claude - Background Service Worker

// Toggle annotation mode when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'toggleAnnotationMode' })
  } catch {
    // Content script not yet injected — inject it now, then send the message
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    })
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['content.css']
    })
    await chrome.tabs.sendMessage(tab.id, { action: 'toggleAnnotationMode' })
  }
})

// Listen for annotation data from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sendAnnotation') {
    fetch('http://localhost:3847/annotate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message.data)
    })
      .then(res => res.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }))

    return true // Keep channel open for async response
  }
})
