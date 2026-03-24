// background.js — Service worker for Collab Chat extension
// Manages persistent state, message storage, and routes messages between scripts

const DEFAULT_SETTINGS = {
  username: '',
  widgetPosition: { bottom: 24, right: 24 },
  widgetMinimized: false,
  widgetHidden: false,
};

// ── Install: set defaults ─────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get('settings');
  if (!existing.settings) {
    await chrome.storage.local.set({
      settings: DEFAULT_SETTINGS,
      messages: [],
      todos: [],
    });
    console.log('[CollabChat] Installed — defaults set.');
  }
});

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === 'GET_STATE') {
    chrome.storage.local.get(['settings', 'messages', 'todos'], (data) => {
      sendResponse({
        settings: data.settings || DEFAULT_SETTINGS,
        messages: data.messages || [],
        todos:    data.todos    || [],
      });
    });
    return true;
  }

  if (message.type === 'SAVE_MESSAGE') {
    chrome.storage.local.get('messages', (data) => {
      const messages = data.messages || [];
      messages.push(message.payload);
      // Cap at 500 messages to avoid unbounded growth
      chrome.storage.local.set({ messages: messages.slice(-500) });
    });
    return true;
  }

  if (message.type === 'SAVE_TODO') {
    chrome.storage.local.get('todos', (data) => {
      const todos = data.todos || [];
      todos.unshift(message.payload);
      chrome.storage.local.set({ todos });
    });
    return true;
  }

  if (message.type === 'TOGGLE_TODO') {
    chrome.storage.local.get('todos', (data) => {
      const todos = data.todos || [];
      const item = todos.find(t => t.id === message.payload.id);
      if (item) item.done = !item.done;
      chrome.storage.local.set({ todos });
      sendResponse({ todos });
    });
    return true;
  }

  if (message.type === 'DELETE_TODO') {
    chrome.storage.local.get('todos', (data) => {
      const todos = (data.todos || []).filter(t => t.id !== message.payload.id);
      chrome.storage.local.set({ todos });
      sendResponse({ todos });
    });
    return true;
  }

  if (message.type === 'SAVE_SETTINGS') {
    chrome.storage.local.set({ settings: message.payload });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'CLEAR_ALL') {
    chrome.storage.local.set({ messages: [], todos: [] }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

});
