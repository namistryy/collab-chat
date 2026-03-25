# Tandem — Browser Extension

Tandem is a live, remote design meeting where collaborators can work on their project while having a chat open on the same window. With AI assistance, chat logs are monitored for any tasks discussed and automatically extracted. 
Works universally on any website. No switching to Slack or Discord.

---

## Install (Chrome / Edge)

1. Download and **unzip** this folder to a permanent location on your computer
2. Open `chrome://extensions` in your browser
3. Enable **Developer mode** (toggle, top-right)
4. Click **Load unpacked** → select the `collab-chat-extension` folder
5. The Collab Chat icon appears in your toolbar ✓

---

## How to use

- The floating chat panel appears automatically on every page
- **Drag** it anywhere by its title bar
- **Minimize** to a small pill with `–`
- **Close** with `×` (restore via the toolbar icon)
- Type a message and press **Enter** to send
- If a message sounds like an action item, the AI auto-adds it to the **Tasks tab**
- Check off or delete tasks in the Tasks tab

---

## Toolbar popup

Click the extension icon to:
- Set your display name (shown in messages)
- See session stats
- Show/hide the widget on the current page
- Clear all messages and tasks

---

## File structure

```
collab-chat-extension/
├── manifest.json     — Extension config (permissions, scripts, icons)
├── background.js     — Service worker: state management, message routing
├── content.js        — Injected into every page: builds the floating widget
├── widget.css        — All floating widget styles (scoped, won't affect host page)
├── popup.html        — Toolbar popup UI
├── popup.js          — Toolbar popup logic
└── icons/            — 16px, 48px, 128px extension icons
```

---

## Roadmap

- **Step 2** — Real-time sync between collaborators (Firebase)
- **Step 3** — Anthropic API for smarter AI task detection
- **Step 4** — User presence, desktop notifications, task export
