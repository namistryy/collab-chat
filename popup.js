// popup.js — Toolbar popup logic for Collab Chat

function getState() {
  return new Promise(res => chrome.runtime.sendMessage({ type: 'GET_STATE' }, res));
}

document.addEventListener('DOMContentLoaded', async () => {
  const data     = await getState();
  const settings = data.settings  || {};
  const messages = data.messages  || [];
  const todos    = data.todos     || [];

  // Populate fields
  document.getElementById('name-input').value = settings.username || '';
  document.getElementById('s-msgs').textContent  = messages.length;
  document.getElementById('s-tasks').textContent = todos.length;

  // Save name
  document.getElementById('save-btn').addEventListener('click', async () => {
    const name = document.getElementById('name-input').value.trim();
    if (!name) return;
    const current = (await getState()).settings || {};
    chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      payload: { ...current, username: name, widgetHidden: false },
    });
    const msg = document.getElementById('saved-msg');
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 2000);
  });

  // Toggle widget on active tab
  document.getElementById('toggle-btn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const root = document.getElementById('collab-chat-root');
          if (root) {
            const hidden = root.style.display === 'none';
            root.style.display = hidden ? '' : 'none';
          }
        },
      });
    }
    window.close();
  });

  // Clear all data
  document.getElementById('clear-btn').addEventListener('click', () => {
    if (!confirm('Clear all messages and tasks? This cannot be undone.')) return;
    chrome.runtime.sendMessage({ type: 'CLEAR_ALL' }, () => {
      document.getElementById('s-msgs').textContent  = '0';
      document.getElementById('s-tasks').textContent = '0';
    });
  });
});
