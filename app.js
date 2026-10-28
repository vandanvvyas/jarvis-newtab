/* J.A.R.V.I.S. New Tab — page logic */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const pad = (n) => String(n).padStart(2, "0");
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const hasChrome = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
  const store = JStore;

  const PORTAL = "https://ljiet.pythonanywhere.com/";
  const SITES = [
    { id: "gmail", name: "Gmail", url: "https://mail.google.com/", host: "mail.google.com",
      icon: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7.5 8 6 8-6"/>' },
    { id: "claude", name: "Claude", url: "https://claude.ai/", host: "claude.ai",
      icon: '<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/>' },
    { id: "whatsapp", name: "WhatsApp", url: "https://web.whatsapp.com/", host: "web.whatsapp.com",
      icon: '<path d="M4 20l1.3-4.2A8 8 0 1 1 8.4 18.8L4 20z"/><path d="M9.2 9.3c.3 2.4 2.4 4.5 4.8 4.8l1.1-1.2-1.7-.9-.8.8c-.8-.4-1.5-1.1-1.9-1.9l.8-.8-.9-1.7-1.4.9z"/>' },
  ];
  const REM_ITEMS = [
    { key: "attendance", title: "Fill attendance", sub: "Mark today's attendance on the portal", site: "portal" },
    { key: "dr", title: "Enter DR data", sub: "Enter today's DR data in the Google Sheet", site: "dr" },
  ];
  const DEFAULTS = { name: "Sir", reminderTime: "14:45", nagMinutes: 5, hour12: "12", accent: "arc", drSheet: "https://docs.google.com/spreadsheets/", waChat: "" };

  let settings = { ...DEFAULTS };
  let todos = [];
  let reminders = { date: todayKey(), attendance: false, dr: false };

  /* ---------------- Settings / theme ---------------- */
  function applyTheme() {
    document.body.dataset.accent = settings.accent;
    accentRGB = hexToRGB(getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#00e5ff");
  }
  const hexToRGB = (h) => {
    h = h.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  let accentRGB = [0, 229, 255];

  /* ---------------- Clock ---------------- */
  function tickClock() {
    const d = new Date();
    let h = d.getHours();
    let suffix = "";
    if (settings.hour12 === "12") {
      suffix = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
    }
    $("#time").textContent = `${settings.hour12 === "12" ? h : pad(h)}:${pad(d.getMinutes())}`;
    $("#sec").textContent = pad(d.getSeconds());
    $("#ampm").textContent = suffix;
    $("#date").textContent = d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    if (reminders.date !== todayKey()) {
      reminders = { date: todayKey(), attendance: false, dr: false };
      store.set({ reminders });
      renderReminders();
    }
    updateReminderStatus();
  }

  /* ---------------- Greeting (typewriter + voice) ---------------- */
  let typeTimer;
  function typeText(el, text, speed = 28) {
    clearInterval(typeTimer);
    el.textContent = "";
    let i = 0;
    typeTimer = setInterval(() => {
      el.textContent = text.slice(0, ++i);
      if (i >= text.length) clearInterval(typeTimer);
    }, speed);
  }
  function greetingText() {
    const h = new Date().getHours();
    const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    return `${part}, ${settings.name || "Sir"}.`;
  }
  function sublineText() {
    const left = todos.filter((t) => !t.done).length;
    const pend = REM_ITEMS.filter((r) => !reminders[r.key]).length;
    const bits = [`${left} task${left === 1 ? "" : "s"} in queue`];
    const dlc = todos.filter((t) => t.due && !t.done).length;
    if (dlc) bits.push(`${dlc} deadline${dlc === 1 ? "" : "s"} pending`);
    if (!isWorkday()) bits.push("Sunday — protocol off");
    else if (afterReminderTime()) bits.push(pend ? `${pend} protocol item${pend === 1 ? "" : "s"} pending` : "daily protocol complete");
    else bits.push(`next alert at ${settings.reminderTime}`);
    return "All systems nominal · " + bits.join(" · ");
  }
  function greet(speak) {
    typeText($("#greeting"), greetingText());
    $("#subline").textContent = sublineText();
    if (speak && "speechSynthesis" in window) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(`${greetingText()} ${sublineText().replace(/·/g, ",")}`);
      u.lang = "en-GB";
      u.rate = 0.95;
      u.pitch = 0.9;
      speechSynthesis.speak(u);
    }
  }

  /* ---------------- To-do ---------------- */
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const saveTodos = () => store.set({ todos });

  function renderTodos() {
    const ul = $("#todoList");
    ul.innerHTML = "";
    if (!todos.length) {
      const e = document.createElement("li");
      e.className = "empty";
      e.textContent = "Queue is empty. Type above to add a task.";
      ul.append(e);
    }
    // Open deadline tasks first, soonest due on top; everything else keeps its order below.
    const rank = (t) => (t.due && !t.done ? 0 : 1);
    const shown = [...todos].sort((x, y) => rank(x) - rank(y) || (rank(x) === 0 ? x.due - y.due : 0));
    shown.forEach((t) => {
      const li = document.createElement("li");
      li.className = t.done ? "done" : "";

      const chk = document.createElement("button");
      chk.className = "check";
      chk.setAttribute("aria-label", "Toggle complete");
      chk.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
      chk.onclick = () => {
        t.done = !t.done;
        li.classList.toggle("done", t.done);
        saveTodos();
        updateCount();
        $("#subline").textContent = sublineText();
      };

      const txt = document.createElement("span");
      txt.className = "txt";
      txt.textContent = t.text;
      txt.contentEditable = "plaintext-only";
      txt.spellcheck = false;
      txt.onkeydown = (e) => {
        if (e.key === "Enter") { e.preventDefault(); txt.blur(); }
      };
      txt.onblur = () => {
        const v = txt.textContent.trim();
        if (!v) return remove(t.id, li);
        if (v !== t.text) { t.text = v; saveTodos(); }
      };

      const del = document.createElement("button");
      del.className = "del";
      del.setAttribute("aria-label", "Delete task");
      del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      del.onclick = () => remove(t.id, li);

      const body = document.createElement("div");
      body.className = "tbody";
      body.append(txt);
      li.append(chk, body);
      if (t.due) {
        const b = document.createElement("span");
        b.className = "due" + (!t.done && t.due < Date.now() ? " over" : "");
        b.textContent = "⏰ " + JDeadline.label(t.due);
        b.title = "Deadline — moves to Daily Protocol on the due date";
        body.append(b);
      }
      li.append(del);
      ul.append(li);
    });
    updateCount();
  }
  function remove(id, li) {
    li.classList.add("removing");
    setTimeout(() => {
      todos = todos.filter((t) => t.id !== id);
      saveTodos();
      renderTodos();
      $("#subline").textContent = sublineText();
    }, 250);
  }
  function updateCount() {
    const left = todos.filter((t) => !t.done).length;
    $("#todoCount").textContent = `${left} left`;
  }
  function initTodo() {
    const inp = $("#todoInput");
    inp.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const v = inp.value.trim();
      if (!v) return;
      const t = { id: uid(), text: v, done: false };
      if (JDeadline.hasKeyword(v)) { const it = JDeadline.makeItem(v); Object.assign(t, { id: it.id, due: it.due, assumed: it.assumed }); }
      if (!todos.some((x) => x.id === t.id)) todos.push(t);
      inp.value = "";
      saveTodos();
      renderTodos();
      $("#subline").textContent = sublineText();
    });
    $("#clearDone").onclick = () => {
      todos = todos.filter((t) => !t.done);
      saveTodos();
      renderTodos();
    };
    document.addEventListener("keydown", (e) => {
      const tag = (document.activeElement || {}).tagName;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag) && !document.activeElement.isContentEditable) {
        e.preventDefault();
        inp.focus();
      }
    });
  }

  /* ---------------- Reminders UI ---------------- */
  const isWorkday = () => new Date().getDay() !== 0; // Mon–Sat only
  const afterReminderTime = () => {
    const [h, m] = settings.reminderTime.split(":").map(Number);
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes() >= h * 60 + m;
  };
  function renderReminders() {
    $("#remTimeChip").textContent = settings.reminderTime;
    const ul = $("#remList");
    ul.innerHTML = "";
    REM_ITEMS.forEach((r) => {
      const li = document.createElement("li");
      li.className = reminders[r.key] ? "done" : "";
      const chk = document.createElement("button");
      chk.className = "check";
      chk.setAttribute("aria-label", "Mark " + r.title + " complete");
      chk.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
      chk.onclick = () => {
        reminders[r.key] = !reminders[r.key];
        reminders.date = todayKey();
        store.set({ reminders });
        if (reminders[r.key] && hasChrome) chrome.notifications.clear("rem-" + r.key);
        renderReminders();
        $("#subline").textContent = sublineText();
      };
      const label = document.createElement("div");
      label.className = "label";
      label.innerHTML = "<strong></strong><small></small>";
      label.firstChild.textContent = r.title;
      label.lastChild.textContent = r.sub;
      const go = document.createElement("button");
      go.className = "go";
      go.textContent = "Open ↗";
      go.onclick = () => window.open(r.key === "dr" ? (settings.drSheet || DEFAULTS.drSheet) : PORTAL, "_blank", "noopener");
      li.append(chk, label, go);
      ul.append(li);
    });
    updateReminderStatus();
  }
  /* ---------------- Deadlines (tasks with a due time) ---------------- */
  const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  // Daily Protocol shows a deadline task from its due DATE onward, until it is ticked in either place.
  const dueNow = () => todos.filter((t) => t.due && !t.done && startOfDay(t.due) <= startOfDay(Date.now()))
    .sort((x, y) => x.due - y.due);
  function renderDeadlines() {
    const ul = $("#dlList");
    ul.innerHTML = "";
    const list = dueNow();
    $("#dlHead").hidden = !list.length;
    list.forEach((t) => {
      const li = document.createElement("li");
      const chk = document.createElement("button");
      chk.className = "check";
      chk.setAttribute("aria-label", "Mark deadline complete");
      chk.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
      chk.onclick = () => {
        t.done = true;
        saveTodos();
        if (hasChrome) chrome.notifications.clear("dl-" + t.id);
        renderTodos();
        renderDeadlines();
        updateReminderStatus();
        $("#subline").textContent = sublineText();
      };
      const label = document.createElement("div");
      label.className = "label";
      label.innerHTML = "<strong></strong><small></small>";
      label.firstChild.textContent = t.text;
      const over = t.due < Date.now();
      label.lastChild.textContent = (over ? "ALERT ACTIVE · " : "Alerts at ") + JDeadline.label(t.due) + (t.assumed ? " (assumed)" : "");
      if (over) label.lastChild.classList.add("over");
      li.append(chk, label);
      ul.append(li);
    });
  }
  async function updateWaStatus() {
    const el = $("#waStatus");
    if (!hasChrome) { el.textContent = ""; return; }
    const { waDebug } = await chrome.storage.local.get("waDebug");
    const fresh = waDebug && Date.now() - waDebug.ts < 60000;
    el.className = "wa";
    if (!waDebug) {
      el.textContent = "○ WhatsApp watcher has not run yet — see the badge at the bottom-left of WhatsApp Web; if there is none, use the same Chrome profile and refresh that tab (F5)";
    } else if (!fresh) {
      el.textContent = "○ WhatsApp watcher last active " + Math.max(1, Math.round((Date.now() - waDebug.ts) / 60000)) + " min ago — keep WhatsApp Web open, or refresh that tab (F5)";
    } else if (!waDebug.self && waDebug.loaded && !waDebug.title) {
      el.textContent = "○ WhatsApp watcher is running but no chat is open — open your “Message yourself” chat";
    } else if (waDebug.self) {
      el.className = "wa on";
      el.textContent = `● WhatsApp link active — self-chat found, ${waDebug.rows} messages visible, ${waDebug.keyword} with “deadline”`;
    } else {
      el.textContent = `○ WhatsApp open on “${waDebug.title || "no chat open"}” — not recognised as your self-chat. Open “Message yourself”, or type that chat's exact name in Settings → Extra WhatsApp chat.`;
    }
  }

  function updateReminderStatus() {
    const work = isWorkday();
    const dl = dueNow();
    const card = $("#remCard");
    const chip = $("#remTimeChip");
    const banner = $("#banner");
    const st = $("#remStatus");
    card.hidden = !work && !dl.length;
    $("#remList").hidden = !work;
    const urgent = dl.filter((d) => d.due <= Date.now());
    const pending = work ? REM_ITEMS.filter((r) => !reminders[r.key]) : [];
    const dailyLate = work && afterReminderTime() && pending.length;
    const msgs = [];
    if (dailyLate) pending.forEach((p) => msgs.push(p.title));
    urgent.forEach((d) => msgs.push("Deadline: " + d.text.slice(0, 36)));
    banner.hidden = !msgs.length;
    if (msgs.length) banner.textContent = "⚠ Pending: " + msgs.join(" · ");
    if (!work) {
      st.textContent = "Sunday — daily items are off. Deadlines due today still alert.";
      chip.className = "chip";
      return;
    }
    if (afterReminderTime()) {
      if (pending.length) {
        st.innerHTML = `ALERT ACTIVE — <b>${pending.length} pending</b>. Notifications repeat until you mark each complete.`;
        chip.className = "chip warn";
      } else {
        st.textContent = "All protocol items complete for today ✓";
        chip.className = "chip done";
      }
    } else {
      const [h, m] = settings.reminderTime.split(":").map(Number);
      const t = new Date();
      t.setHours(h, m, 0, 0);
      const mins = Math.max(0, Math.round((t - new Date()) / 60000));
      st.innerHTML = `Next alert in <b>${Math.floor(mins / 60)}h ${mins % 60}m</b>`;
      chip.className = "chip";
    }
  }

  /* ---------------- Site tabs (open in a normal tab = your saved logins) ---------------- */
  function openSite(site) {
    window.open(site.url, "_blank", "noopener");
  }
  let links = [];
  const saveLinks = () => store.set({ links });
  const normUrl = (u) => {
    u = u.trim();
    if (!u) return "";
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = "https://" + u;
    try { return new URL(u).href; } catch { return ""; }
  };
  function addTab(nav, { name, host, url, icon, letter, onDelete }) {
    const b = document.createElement("button");
    b.className = "glass tab";
    b.innerHTML = `<span class="glow"></span><span class="ico"></span><span><span class="name"></span><span class="host"></span></span>`;
    const ico = b.querySelector(".ico");
    if (icon) ico.innerHTML = `<svg viewBox="0 0 24 24">${icon}</svg>`;
    else ico.textContent = letter;
    b.querySelector(".name").textContent = name;
    b.querySelector(".host").textContent = host;
    b.addEventListener("click", () => url ? window.open(url, "_blank", "noopener") : $("#linkDlg").showModal());
    b.addEventListener("pointermove", (e) => {
      const r = b.getBoundingClientRect();
      b.style.setProperty("--mx", e.clientX - r.left + "px");
      b.style.setProperty("--my", e.clientY - r.top + "px");
    });
    if (onDelete) {
      b.title = "Right-click to remove";
      b.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (confirm(`Remove "${name}" from your links?`)) onDelete();
      });
    }
    nav.append(b);
  }
  function buildTabs() {
    const nav = $("#tabs");
    nav.innerHTML = "";
    SITES.forEach((s) => addTab(nav, s));
    links.forEach((l) => addTab(nav, {
      name: l.name, host: new URL(l.url).host, url: l.url, letter: (l.name[0] || "?").toUpperCase(),
      onDelete: () => { links = links.filter((x) => x.id !== l.id); saveLinks(); buildTabs(); },
    }));
    addTab(nav, { name: "Add link", host: "save a shortcut", icon: '<path d="M12 5v14M5 12h14"/>' });
  }
  function initLinkDialog() {
    const dlg = $("#linkDlg");
    $("#lCancel").onclick = () => dlg.close();
    $("#linkForm").addEventListener("submit", (e) => {
      const url = normUrl($("#lUrl").value);
      if (!url) { e.preventDefault(); $("#lUrl").setCustomValidity("Enter a valid link"); $("#lUrl").reportValidity(); return; }
      const name = $("#lName").value.trim() || new URL(url).host.replace(/^www\./, "");
      links.push({ id: uid(), name, url });
      saveLinks();
      buildTabs();
      $("#linkForm").reset();
    });
    $("#lUrl").addEventListener("input", () => $("#lUrl").setCustomValidity(""));
  }

  /* ---------------- Google apps menu ---------------- */
  const G = (n, u, i) => ({ name: n, url: u, icon: i });
  const GOOGLE_APPS = [
    G("Search", "https://www.google.com/", '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/>'),
    G("Gmail", "https://mail.google.com/", '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7.5 8 6 8-6"/>'),
    G("Drive", "https://drive.google.com/", '<path d="M8 4h8l5 9-4 7H7l-4-7z"/><path d="M8 4l5 9M16 4l-5 9M3 13h18"/>'),
    G("Docs", "https://docs.google.com/document/", '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>'),
    G("Sheets", "https://docs.google.com/spreadsheets/", '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16"/>'),
    G("Slides", "https://docs.google.com/presentation/", '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4-2.5z"/>'),
    G("Calendar", "https://calendar.google.com/", '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
    G("Meet", "https://meet.google.com/", '<rect x="3" y="7" width="12" height="10" rx="2"/><path d="m15 11 6-3v8l-6-3"/>'),
    G("Maps", "https://maps.google.com/", '<path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
    G("YouTube", "https://www.youtube.com/", '<rect x="3" y="6" width="18" height="12" rx="4"/><path d="M10 9.5v5l4.5-2.5z"/>'),
    G("Photos", "https://photos.google.com/", '<circle cx="12" cy="7" r="3.2"/><circle cx="17" cy="12" r="3.2"/><circle cx="12" cy="17" r="3.2"/><circle cx="7" cy="12" r="3.2"/>'),
    G("Keep", "https://keep.google.com/", '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>'),
    G("Translate", "https://translate.google.com/", '<path d="M4 6h9M8.5 4v2M6 6c.5 3 2.5 5.500 5.500 7M11 6c-.5 3-3 6-6.500 8"/><path d="m13 20 4-9 4 9M14.500 17h5"/>'),
    G("Contacts", "https://contacts.google.com/", '<circle cx="12" cy="9" r="3.500"/><path d="M5 20c.8-3.500 3.500-5 7-5s6.200 1.500 7 5"/>'),
    G("Chat", "https://chat.google.com/", '<path d="M4 5h16v11H9l-5 4z"/>'),
    G("News", "https://news.google.com/", '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h4"/>'),
    G("Gemini", "https://gemini.google.com/", '<path d="M12 3c.6 5 4 8.400 9 9-5 .6-8.400 4-9 9-.6-5-4-8.400-9-9 5-.6 8.400-4 9-9z"/>'),
    G("My Account", "https://myaccount.google.com/", '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.500 18c1.200-2 3-3 5.500-3s4.300 1 5.500 3"/>'),
  ];
  function initApps() {
    const grid = $("#appsGrid");
    GOOGLE_APPS.forEach((a) => {
      const el = document.createElement("a");
      el.className = "app";
      el.href = a.url;
      el.target = "_blank";
      el.rel = "noopener";
      el.innerHTML = `<span class="ico"><svg viewBox="0 0 24 24">${a.icon}</svg></span><span></span>`;
      el.lastChild.textContent = a.name;
      grid.append(el);
    });
    const menu = $("#appsMenu"), btn = $("#btnApps");
    const set = (open) => { menu.hidden = !open; btn.setAttribute("aria-expanded", open); };
    btn.addEventListener("click", (e) => { e.stopPropagation(); set(menu.hidden); });
    document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) set(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") set(false); });
  }

  /* ---------------- Settings dialog ---------------- */
  /* ---------------- Cloud sync (optional) ---------------- */
  const ago = (ts) => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : Math.round(m / 60) + " h ago"; };
  function cloudText(s, on) {
    if (!on) return "Off — data stays on this profile.";
    if (!s) return "Connecting…";
    return (s.ok ? "✓ Synced " : "⚠ " + s.msg + " · ") + ago(s.ts) + (s.ok && s.changed ? " (received changes)" : "");
  }
  async function saveCloudConfig() {
    if (!hasChrome) return;
    const token = $("#cToken").value.trim(), pass = $("#cPass").value;
    const old = await chrome.storage.local.get(["cloudToken", "cloudPass"]);
    if (!token) {
      await chrome.storage.local.remove(["cloudToken", "cloudPass", "cloudGist", "cloudBase", "cloudStatus"]);
    } else {
      const changed = token !== old.cloudToken;
      await chrome.storage.local.set({ cloudToken: token, cloudPass: pass });
      if (changed) await chrome.storage.local.remove(["cloudGist", "cloudBase"]);
      chrome.runtime.sendMessage({ type: "cloudSync" });
    }
    updateCloudChip();
  }
  async function updateCloudChip() {
    const el = $("#cloudChip");
    if (!hasChrome) return;
    const c = await chrome.storage.local.get(["cloudToken", "cloudStatus"]);
    if (!c.cloudToken) { el.textContent = ""; return; }
    const s = c.cloudStatus;
    el.textContent = !s ? "  ·  ☁ connecting" : s.ok ? "  ·  ☁ synced " + ago(s.ts) : "  ·  ☁ sync problem";
    el.className = "cloud-chip" + (s && !s.ok ? " bad" : "");
    el.title = s ? s.msg : "";
  }

  function initSettings() {
    const dlg = $("#settings");
    $("#btnSettings").onclick = () => {
      $("#sName").value = settings.name;
      $("#sTime").value = settings.reminderTime;
      $("#sNag").value = settings.nagMinutes;
      $("#sHour").value = settings.hour12;
      $("#sAccent").value = settings.accent;
      $("#sSheet").value = settings.drSheet;
      $("#sWa").value = settings.waChat;
      if (hasChrome) chrome.storage.local.get(["cloudToken", "cloudPass", "cloudStatus"]).then((c) => {
        $("#cToken").value = c.cloudToken || "";
        $("#cPass").value = c.cloudPass || "";
        $("#cStatus").textContent = cloudText(c.cloudStatus, !!c.cloudToken);
      });
      dlg.showModal();
    };
    $("#sCancel").onclick = () => dlg.close();
    $("#cSync").onclick = async () => {
      if (!hasChrome) return;
      $("#cStatus").textContent = "Syncing…";
      await saveCloudConfig();
      await new Promise((r) => setTimeout(r, 1500));
      const c = await chrome.storage.local.get(["cloudToken", "cloudStatus"]);
      $("#cStatus").textContent = cloudText(c.cloudStatus, !!c.cloudToken);
    };
    $("#settingsForm").addEventListener("submit", () => {
      settings = {
        name: $("#sName").value.trim() || "Sir",
        reminderTime: $("#sTime").value || "14:45",
        nagMinutes: Math.min(60, Math.max(1, Number($("#sNag").value) || 5)),
        hour12: $("#sHour").value,
        accent: $("#sAccent").value,
        drSheet: $("#sSheet").value.trim() || DEFAULTS.drSheet,
        waChat: $("#sWa").value.trim(),
      };
      store.set({ settings });
      saveCloudConfig();
      if (hasChrome) chrome.storage.local.set({ lastNotified: 0 });
      applyTheme();
      renderReminders();
      tickClock();
      greet(false);
    });
    $("#testAlert").onclick = () => {
      if (hasChrome && chrome.notifications) {
        chrome.notifications.create("rem-test", {
          type: "basic",
          iconUrl: "icons/icon128.png",
          title: "J.A.R.V.I.S. — Test alert",
          message: "Notifications are working. Real reminders stay until marked complete.",
        });
      } else alert("Notifications work only when loaded as a Chrome extension.");
    };
  }

  /* ---------------- Interactive background ---------------- */
  const cvs = $("#bg");
  const ctx = cvs.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W, H, parts = [], sparks = [];
  const mouse = { x: -9999, y: -9999 };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    cvs.width = W * dpr;
    cvs.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round((W * H) / (reduce ? 30000 : 15000));
    parts = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.6 + 0.6,
    }));
  }
  function frame() {
    ctx.clearRect(0, 0, W, H);
    const [r, g, b] = accentRGB;
    for (const p of parts) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = W; else if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; else if (p.y > H) p.y = 0;
      const dx = p.x - mouse.x, dy = p.y - mouse.y;
      const d = Math.hypot(dx, dy);
      if (d < 140 && d > 0) {
        const f = (140 - d) / 140;
        p.x += (dx / d) * f * 2.2;
        p.y += (dy / d) * f * 2.2;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 6.283);
      ctx.fillStyle = `rgba(${r},${g},${b},0.75)`;
      ctx.fill();
      if (d < 190) {
        ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - d / 190) * 0.55})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(mouse.x, mouse.y);
        ctx.stroke();
      }
    }
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i], c = parts[j];
        const dx = a.x - c.x, dy = a.y - c.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < 11000) {
          ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - dist2 / 11000) * 0.22})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(c.x, c.y);
          ctx.stroke();
        }
      }
    }
    sparks = sparks.filter((s) => s.life > 0);
    for (const s of sparks) {
      s.x += s.vx; s.y += s.vy; s.vx *= 0.95; s.vy *= 0.95; s.life--;
      ctx.fillStyle = `rgba(255,${140 + (s.life % 60)},40,${s.life / 50})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2, 0, 6.283);
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }
  function burst(x, y) {
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * 6.283, sp = Math.random() * 5 + 1;
      sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 50 });
    }
    const rp = document.createElement("div");
    rp.className = "ripple";
    rp.style.left = x + "px";
    rp.style.top = y + "px";
    document.body.append(rp);
    setTimeout(() => rp.remove(), 800);
  }
  function initInteraction() {
    resize();
    addEventListener("resize", resize);
    addEventListener("pointermove", (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      const rx = (e.clientY / H - 0.5) * -10;
      const ry = (e.clientX / W - 0.5) * 12;
      const re = $("#reactor");
      re.style.setProperty("--rx", rx + "deg");
      re.style.setProperty("--ry", ry + "deg");
    });
    addEventListener("pointerleave", () => { mouse.x = mouse.y = -9999; });
    addEventListener("pointerdown", (e) => { if (!reduce) burst(e.clientX, e.clientY); });
    $("#reactor").addEventListener("click", () => greet(true));
    requestAnimationFrame(frame);
  }

  /* ---------------- Init ---------------- */
  async function init() {
    const data = await store.get(["settings", "todos", "reminders", "links"]);
    settings = { ...DEFAULTS, ...(data.settings || {}) };
    todos = data.todos || [];
    links = Array.isArray(data.links) ? data.links : [];
    if (data.reminders && data.reminders.date === todayKey()) reminders = data.reminders;
    else store.set({ reminders });

    applyTheme();
    buildTabs();
    initApps();
    initTodo();
    initSettings();
    initLinkDialog();
    renderTodos();
    renderDeadlines();
    renderReminders();
    initInteraction();
    tickClock();
    setInterval(tickClock, 1000);
    setInterval(() => { renderDeadlines(); if (!document.activeElement.classList.contains("txt")) renderTodos(); }, 30000);
    updateWaStatus();
    updateCloudChip();
    setInterval(() => { updateWaStatus(); updateCloudChip(); }, 15000);
    greet(false);

    // Keep multiple new tabs and notification buttons in sync
    if (hasChrome && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(async (ch, area) => {
        if (area !== "sync") return;
        if (ch.reminders && ch.reminders.newValue && JSON.stringify(ch.reminders.newValue) !== JSON.stringify(reminders)) {
          reminders = ch.reminders.newValue;
          renderReminders();
          $("#subline").textContent = sublineText();
        }
        if (Object.keys(ch).some(JStore.isTodoKey)) {
          const d = await store.get(["todos"]);
          const t = d.todos || [];
          if (JSON.stringify(t) !== JSON.stringify(todos) && !(document.activeElement && document.activeElement.classList.contains("txt"))) {
            todos = t;
            renderTodos();
            renderDeadlines();
            updateReminderStatus();
            $("#subline").textContent = sublineText();
          }
        }
        if (ch.links && JSON.stringify(ch.links.newValue || []) !== JSON.stringify(links)) {
          links = ch.links.newValue || [];
          buildTabs();
        }
        if (ch.settings && ch.settings.newValue) {
          settings = { ...DEFAULTS, ...ch.settings.newValue };
          applyTheme();
          renderReminders();
          tickClock();
        }
      });
    }
  }
  init();
})();
