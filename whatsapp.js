// Runs inside WhatsApp Web. Watches ONLY your "Message yourself" chat for messages
// containing the word "deadline". Everything is processed locally in your browser.
(() => {
  "use strict";
  if (window.__jarvisWA) return; // avoid double injection
  window.__jarvisWA = true;

  // Tell the new tab page right away that the watcher is loaded on this WhatsApp page.
  try { chrome.storage.local.set({ waDebug: { ts: Date.now(), self: false, title: "", rows: 0, keyword: 0, sent: 0, loaded: true } }); } catch (e) {}

  // Small badge on WhatsApp Web itself so you can see the extension is running here.
  const badge = document.createElement("div");
  badge.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483647;font:12px/1.3 system-ui,sans-serif;padding:6px 12px;border-radius:999px;background:#031018;color:#00e5ff;border:1px solid #00e5ff;box-shadow:0 0 12px rgba(0,229,255,.4);pointer-events:none;opacity:.92";
  const setBadge = (txt, ok) => { badge.textContent = "J.A.R.V.I.S. · " + txt; badge.style.color = ok ? "#3dffa6" : "#00e5ff"; badge.style.borderColor = badge.style.color; };
  setBadge("loading…", false);
  (document.body || document.documentElement).appendChild(badge);

  let settings = {};
  let seen = new Set();
  let timer;
  let lastDebug = 0;

  const SELF_WORDS = ["you", "message yourself", "(you)", "tú", "vous", "você", "du", "आप", "أنت"];

  // Every piece of text that could be the open chat's name (header layouts differ between versions).
  function headerNames() {
    const h = document.querySelector("#main header") || document.querySelector('[data-testid="conversation-header"]') || document.querySelector("#main > div > header");
    if (!h) return [];
    const names = new Set();
    h.querySelectorAll("[title]").forEach((e) => names.add((e.getAttribute("title") || "").trim()));
    h.querySelectorAll('span[dir="auto"], span[dir="ltr"]').forEach((e) => names.add((e.textContent || "").trim()));
    (h.innerText || "").split("\n").forEach((l) => names.add(l.trim()));
    return [...names].filter((n) => n && n.length < 80);
  }
  const looksSelf = (n) => {
    const t = n.toLowerCase();
    return /\((you|tú|vous|você|du|आप|أنت)\)\s*$/.test(t) || SELF_WORDS.includes(t);
  };
  function detectChat() {
    const names = headerNames();
    const extra = (settings.waChat || "").trim().toLowerCase();
    const hit = names.find((n) => looksSelf(n) || (extra && n.toLowerCase() === extra));
    return { self: !!hit, title: hit || names[0] || "" };
  }

  function messageText(row) {
    let parts = row.querySelectorAll("span.selectable-text");
    if (!parts.length) parts = row.querySelectorAll(".copyable-text");
    let text = Array.from(parts).map((p) => p.innerText).join(" ").trim();
    if (!text && /deadline/i.test(row.innerText || "")) text = (row.innerText || "").replace(/\n?\d{1,2}:\d{2}\s?(am|pm)?\s*$/i, "").trim();
    return text.replace(/^forwarded\s*/i, "").trim();
  }

  async function scan() {
    if (!chrome.runtime || !chrome.runtime.id) return; // extension was reloaded: this page needs a refresh
    const chat = detectChat();
    const rows = document.querySelectorAll("#main [data-id], [data-testid='conversation-panel-messages'] [data-id]");
    let kw = 0, sent = 0;
    if (chat.self) {
      for (const row of rows) {
        const id = row.getAttribute("data-id");
        if (!id) continue;
        const text = messageText(row);
        if (!JDeadline.hasKeyword(text)) continue;
        kw++;
        if (seen.has(id)) continue;
        seen.add(id);
        const item = JDeadline.makeItem(text);
        if (item.due < Date.now() - 60000) continue; // already in the past
        sent++;
        chrome.runtime.sendMessage({ type: "addDeadline", item, msgId: id });
      }
      if (sent) chrome.storage.local.set({ waSeenIds: Array.from(seen).slice(-400) });
    }
    setBadge(chat.self ? `watching your self-chat (${kw} deadline msg)` : (chat.title ? "open “Message yourself” to watch" : "open a chat"), chat.self);
    if (Date.now() - lastDebug > 4000 || sent) { // diagnostics shown on the new tab page
      lastDebug = Date.now();
      chrome.storage.local.set({ waDebug: { ts: Date.now(), self: chat.self, title: chat.title, rows: rows.length, keyword: kw, sent } });
      if (chat.self) chrome.storage.local.set({ waSeen: Date.now() });
    }
  }

  const schedule = () => { clearTimeout(timer); timer = setTimeout(scan, 700); };

  async function start() {
    const local = await chrome.storage.local.get("waSeenIds");
    seen = new Set(local.waSeenIds || []);
    settings = (await JStore.get(["settings"])).settings || {};
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === "sync" && ch.settings) settings = ch.settings.newValue || {};
    });
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    setInterval(scan, 5000);
    scan();
  }
  start().catch((e) => { setBadge("error: " + (e && e.message), false); console.warn("JARVIS watcher failed", e); });
})();
