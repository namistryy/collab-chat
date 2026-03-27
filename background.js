// background.js — Tandem service worker
const FB_API_KEY = "AIzaSyAEjXVnVLYwQPAHyMWiN8gF1L4cs9GxDVE";

let currentUser = null;

async function restoreSession() {
  const data = await chrome.storage.local.get(['user']);
  if (data.user) currentUser = data.user;
}

chrome.runtime.onInstalled.addListener(restoreSession);
chrome.runtime.onStartup.addListener(restoreSession);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_AUTH') {
    sendResponse({ user: currentUser });
  } else if (msg.type === 'SIGN_IN') {
    handleSignIn(msg, sendResponse);
    return true; 
  } else if (msg.type === 'SIGN_UP') {
    handleSignUp(msg, sendResponse);
    return true;
  } else if (msg.type === 'SIGN_OUT') {
    currentUser = null;
    chrome.storage.local.clear(() => sendResponse({ ok: true }));
    return true;
  }
});

async function handleSignIn(msg, sendResponse) {
  try {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FB_API_KEY}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: msg.email, password: msg.password, returnSecureToken: true })
    });
    const data = await res.json();
    if (data.error) return sendResponse({ ok: false, error: data.error.message });
    
    currentUser = { uid: data.localId, email: msg.email, idToken: data.idToken };
    await chrome.storage.local.set({ user: currentUser });
    sendResponse({ ok: true, user: currentUser });
  } catch (e) {
    sendResponse({ ok: false, error: e.message });
  }
}

async function handleSignUp(msg, sendResponse) {
  try {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FB_API_KEY}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: msg.email, password: msg.pass, returnSecureToken: true })
    });
    const data = await res.json();
    if (data.error) return sendResponse({ ok: false, error: data.error.message });
    
    currentUser = { uid: data.localId, email: msg.email, name: msg.name, idToken: data.idToken };
    await chrome.storage.local.set({ user: currentUser });
    sendResponse({ ok: true, user: currentUser });
  } catch (e) {
    sendResponse({ ok: false, error: e.message });
  }
}
