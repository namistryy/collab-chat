// content.js — Injected into every webpage by the Collab Chat extension
// Builds and manages the persistent floating chat widget

(function () {
  'use strict';

  // Prevent double-injection on navigations
  if (document.getElementById('collab-chat-root')) return;

  // ── Action item detection patterns ────────────────────────────────────────
  const ACTION_PATTERNS = [
    /\blet'?s\b.{0,60}\b(change|update|swap|fix|move|add|remove|make|set|replace|adjust|switch|redesign|rework|refactor|clean|check|review|test|build|create|write|send|schedule|book|call|draft|publish|deploy|rename|delete|archive|assign|migrate)\b/i,
    /\b(change|update|swap|fix|add|remove|replace|adjust|switch|rename|move)\b.{0,50}(later|eventually|at some point|soon|next|this week|tomorrow|today)/i,
    /\bwe (should|need to|have to|must|ought to)\b/i,
    /\bdon'?t forget\b/i,
    /\bneed to\b.{0,60}/i,
    /\bremember to\b/i,
    /\bcould (you|we|someone)\b.{0,60}\?/i,
    /\bcan (you|we|someone)\b.{0,60}\?/i,
    /\b(todo|to-do|action item|follow.?up):?\s/i,
    /\bassign(ed)?\b.{0,40}\bto\b/i,
    /\bdeadline\b/i,
    /\bby (monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|eow|tomorrow|next week)\b/i,
  ];

  // ── State ─────────────────────────────────────────────────────────────────
  let state = {
    messages: [],
    todos: [],
    settings: {
      username: '',
      widgetMinimized: false,
      widgetHidden: false,
    },
    activeTab: 'chat',
    aiDetecting: false,
  };

  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  async function init() {
    const data = await sendToBackground({ type: 'GET_STATE' });
    state.messages = data.messages || [];
    state.todos    = data.todos    || [];
    state.settings = { ...state.settings, ...data.settings };

    if (state.settings.widgetHidden) return; // user closed it last session

    injectWidget();
  }

  // ── Inject DOM ────────────────────────────────────────────────────────────
  function injectWidget() {
    const root = document.createElement('div');
    root.id = 'collab-chat-root';
    root.innerHTML = buildHTML();
    document.body.appendChild(root);

    applyPosition();
    bindEvents();
    renderMessages();
    renderTodos();

    if (state.settings.widgetMinimized) setMinimized(true);
  }

  function buildHTML() {
    return `
      <div id="cc-shell">

        <!-- Title bar -->
        <div id="cc-titlebar">
          <div id="cc-titlebar-left">
            <div class="cc-dot"></div>
            <span class="cc-title">Collab Chat</span>
          </div>
          <div id="cc-titlebar-right">
            <span class="cc-live-badge">● Live</span>
            <button class="cc-ctrl-btn" id="cc-min-btn" title="Minimize">&#8211;</button>
            <button class="cc-ctrl-btn" id="cc-close-btn" title="Close">&#215;</button>
          </div>
        </div>

        <!-- Minimized pill -->
        <div id="cc-pill">
          <div class="cc-dot"></div>
          <span>Collab Chat</span>
          <span id="cc-pill-badge" class="cc-pill-badge" style="display:none"></span>
        </div>

        <!-- Tabs -->
        <div id="cc-tabs">
          <button class="cc-tab active" data-panel="chat">Chat</button>
          <button class="cc-tab" data-panel="todos">
            Tasks <span id="cc-todo-badge" class="cc-badge">0</span>
          </button>
        </div>

        <!-- Chat panel -->
        <div class="cc-panel active" id="cc-panel-chat">
          <div id="cc-messages"></div>
          <div id="cc-ai-bar">
            <span class="cc-spinner"></span>
            AI is extracting an action item…
          </div>
          <div id="cc-input-row">
            <input
              type="text"
              id="cc-input"
              placeholder="Message your team…"
              autocomplete="off"
            />
            <button id="cc-send-btn" title="Send">
              <svg viewBox="0 0 24 24" fill="white" width="13" height="13">
                <path d="M2 21l21-9L2 3v7l15 2-15 2z"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Tasks panel -->
        <div class="cc-panel" id="cc-panel-todos">
          <div id="cc-todos"></div>
        </div>

      </div>
    `;
  }

  // ── Position ──────────────────────────────────────────────────────────────
  function applyPosition() {
    const shell = qs('#cc-shell');
    const p = state.settings.widgetPosition || {};
    if (p.top != null) {
      shell.style.top    = p.top  + 'px';
      shell.style.left   = p.left + 'px';
      shell.style.bottom = 'auto';
      shell.style.right  = 'auto';
    } else {
      shell.style.bottom = (p.bottom ?? 24) + 'px';
      shell.style.right  = (p.right  ?? 24) + 'px';
    }
  }

  function savePosition() {
    const rect = qs('#cc-shell').getBoundingClientRect();
    updateSettings({ widgetPosition: { top: rect.top, left: rect.left } });
  }

  // ── Drag ──────────────────────────────────────────────────────────────────
  function onDragStart(e) {
    if (e.target.closest('.cc-ctrl-btn')) return;
    isDragging = true;
    const rect = qs('#cc-shell').getBoundingClientRect();
    dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup',   onDragEnd);
    e.preventDefault();
  }

  function onDragMove(e) {
    if (!isDragging) return;
    const shell = qs('#cc-shell');
    const vw = window.innerWidth, vh = window.innerHeight;
    const left = Math.max(0, Math.min(e.clientX - dragOffset.x, vw - shell.offsetWidth));
    const top  = Math.max(0, Math.min(e.clientY - dragOffset.y, vh - shell.offsetHeight));
    shell.style.left   = left + 'px';
    shell.style.top    = top  + 'px';
    shell.style.right  = 'auto';
    shell.style.bottom = 'auto';
  }

  function onDragEnd() {
    if (!isDragging) return;
    isDragging = false;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup',   onDragEnd);
    savePosition();
  }

  // ── Events ────────────────────────────────────────────────────────────────
  function bindEvents() {
    qs('#cc-titlebar').addEventListener('mousedown', onDragStart);
    qs('#cc-min-btn').addEventListener('click',   e => { e.stopPropagation(); toggleMinimize(); });
    qs('#cc-close-btn').addEventListener('click',  e => { e.stopPropagation(); hideWidget(); });
    qs('#cc-pill').addEventListener('click', () => toggleMinimize());

    qsa('.cc-tab').forEach(tab =>
      tab.addEventListener('click', () => switchTab(tab.dataset.panel))
    );

    qs('#cc-send-btn').addEventListener('click', sendMessage);
    qs('#cc-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
  }

  // ── Minimize / hide ───────────────────────────────────────────────────────
  function toggleMinimize() {
    const minimized = !state.settings.widgetMinimized;
    state.settings.widgetMinimized = minimized;
    setMinimized(minimized);
    updateSettings({ widgetMinimized: minimized });
  }

  function setMinimized(on) {
    qs('#cc-shell').classList.toggle('minimized', on);
    if (!on) qs('#cc-pill-badge').style.display = 'none';
  }

  function hideWidget() {
    document.getElementById('collab-chat-root').style.display = 'none';
    updateSettings({ widgetHidden: true });
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────
  function switchTab(panel) {
    state.activeTab = panel;
    qsa('.cc-tab').forEach(t => t.classList.toggle('active', t.dataset.panel === panel));
    qsa('.cc-panel').forEach(p => p.classList.toggle('active', p.id === `cc-panel-${panel}`));
  }

  // ── Send message ──────────────────────────────────────────────────────────
  function sendMessage() {
    const input = qs('#cc-input');
    const text  = input.value.trim();
    if (!text) return;
    input.value = '';

    const username = state.settings.username || 'You';
    const msg = {
      id:     Date.now(),
      text,
      sender: username,
      self:   true,
      time:   formatTime(),
    };

    state.messages.push(msg);
    appendMessage(msg);
    sendToBackground({ type: 'SAVE_MESSAGE', payload: msg });

    if (isActionItem(text)) detectActionItem(text, username);
  }

  // ── AI action item detection ──────────────────────────────────────────────
  function isActionItem(text) {
    return ACTION_PATTERNS.some(p => p.test(text));
  }

  function detectActionItem(text, sender) {
    if (state.aiDetecting) return;
    state.aiDetecting = true;

    const bar = qs('#cc-ai-bar');
    bar.classList.add('visible');

    setTimeout(() => {
      bar.classList.remove('visible');
      state.aiDetecting = false;

      const todo = {
        id:   Date.now(),
        text: sanitizeTaskText(text),
        who:  sender,
        time: formatTime(),
        done: false,
      };

      state.todos.unshift(todo);
      sendToBackground({ type: 'SAVE_TODO', payload: todo });
      renderTodos();

      // Flash the Tasks tab
      const tasksTab = qs('.cc-tab[data-panel="todos"]');
      tasksTab.classList.add('flash');
      setTimeout(() => tasksTab.classList.remove('flash'), 1400);

      // Unread dot on pill if minimized
      if (state.settings.widgetMinimized) {
        qs('#cc-pill-badge').style.display = 'inline-block';
      }
    }, 1600);
  }

  function sanitizeTaskText(text) {
    let t = text.trim();
    if (t.length > 100) t = t.slice(0, 97) + '…';
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // ── Render: messages ──────────────────────────────────────────────────────
  function renderMessages() {
    qs('#cc-messages').innerHTML = '';
    state.messages.forEach(m => appendMessage(m, false));
  }

  function appendMessage(msg, scroll = true) {
    const container = qs('#cc-messages');
    const isSelf    = msg.self || msg.sender === (state.settings.username || 'You');
    const initial   = (msg.sender || '?')[0].toUpperCase();
    const color     = isSelf ? '#4f6ef7' : senderColor(msg.sender);

    const el = document.createElement('div');
    el.className = 'cc-msg-group';
    el.innerHTML = `
      <div class="cc-msg-meta ${isSelf ? 'self' : ''}">${esc(msg.sender)} · ${esc(msg.time)}</div>
      <div class="cc-msg-row ${isSelf ? 'self' : ''}">
        <div class="cc-avatar" style="background:${color}">${initial}</div>
        <div class="cc-bubble ${isSelf ? 'self' : 'other'}">${esc(msg.text)}</div>
      </div>
    `;
    container.appendChild(el);
    if (scroll) container.scrollTop = container.scrollHeight;
  }

  // ── Render: todos ─────────────────────────────────────────────────────────
  function renderTodos() {
    const container = qs('#cc-todos');
    const badge     = qs('#cc-todo-badge');
    const open      = state.todos.filter(t => !t.done).length;
    badge.textContent = state.todos.length;
    container.innerHTML = '';

    if (state.todos.length === 0) {
      container.innerHTML = `
        <div class="cc-empty">
          <div class="cc-empty-icon">◎</div>
          <p>Action items detected in chat will appear here automatically.</p>
        </div>`;
      return;
    }

    const header = document.createElement('div');
    header.className = 'cc-todos-header';
    header.innerHTML = `
      <span>${open} open · ${state.todos.length - open} done</span>
      <span class="cc-ai-label">AI extracted</span>`;
    container.appendChild(header);

    state.todos.forEach(todo => {
      const el = document.createElement('div');
      el.className = `cc-todo${todo.done ? ' done' : ''}`;
      el.innerHTML = `
        <button class="cc-check ${todo.done ? 'checked' : ''}" data-id="${todo.id}" title="Toggle"></button>
        <div class="cc-todo-body">
          <div class="cc-todo-text">${esc(todo.text)}</div>
          <div class="cc-todo-meta">
            <span class="cc-tag cc-tag-who">${esc(todo.who)}</span>
            <span class="cc-tag cc-tag-time">${esc(todo.time)}</span>
          </div>
        </div>
        <button class="cc-delete-btn" data-id="${todo.id}" title="Remove">&#215;</button>
      `;
      el.querySelector('.cc-check').addEventListener('click',      () => toggleTodo(todo.id));
      el.querySelector('.cc-delete-btn').addEventListener('click', () => deleteTodo(todo.id));
      container.appendChild(el);
    });
  }

  function toggleTodo(id) {
    const t = state.todos.find(t => t.id === id);
    if (t) { t.done = !t.done; }
    sendToBackground({ type: 'TOGGLE_TODO', payload: { id } });
    renderTodos();
  }

  function deleteTodo(id) {
    state.todos = state.todos.filter(t => t.id !== id);
    sendToBackground({ type: 'DELETE_TODO', payload: { id } });
    renderTodos();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function sendToBackground(msg) {
    return new Promise(res => chrome.runtime.sendMessage(msg, res));
  }

  function updateSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    sendToBackground({ type: 'SAVE_SETTINGS', payload: state.settings });
  }

  function qs(sel)       { return document.querySelector(`#collab-chat-root ${sel}`); }
  function qsa(sel)      { return document.querySelectorAll(`#collab-chat-root ${sel}`); }
  function esc(str)      { return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function formatTime() {
    const d = new Date();
    let h = d.getHours(), m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2,'0')} ${ampm}`;
  }

  function senderColor(name) {
    const palette = ['#e05c5c','#d4841a','#2e9e6b','#6b57d4','#1a8fc9','#c45295'];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return palette[Math.abs(h) % palette.length];
  }

  // ── Start ─────────────────────────────────────────────────────────────────
  init();

})();
