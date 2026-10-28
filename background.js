// J.A.R.V.I.S. New Tab — background service worker
// Handles: daily reminders (attendance + DR data), persistent notifications,


importScripts("storage.js", "deadline.js", "cloud.js");

const PORTAL = "https://ljiet.pythonanywhere.com/";
const DEFAULTS = { reminderTime: "14:45", nagMinutes: 5 };
const ITEMS = {
  attendance: "Fill today's attendance",
  dr: "Enter DR data",
};

const pad = (n) => String(n).padStart(2, "0");
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

async function getState() {
  const { settings = {}, reminders = {} } = await JStore.get(["settings", "reminders"]);
  const { lastNotified = 0 } = await chrome.storage.local.get("lastNotified");
  const s = { ...DEFAULTS, ...settings };
  let r = reminders;
  if (r.date !== todayKey()) {
    r = { date: todayKey(), attendance: false, dr: false };
    await JStore.set({ reminders: r });
    await chrome.storage.local.set({ lastNotified: 0 });
    return { s, r, lastNotified: 0 };
  }
  return { s, r, lastNotified };
}


// ---------------- Deadlines: stored as tasks (todos) that carry a `due` time ----------------
let dlQueue = Promise.resolve();
const withTodos = (fn) => (dlQueue = dlQueue.then(async () => {
  // one-time: bring in anything saved by the earlier separate "deadlines" list
  const { deadlines = [], todos: t0 } = await JStore.get(["deadlines", "todos"]);
  let todos = t0 || [];
  let changed = false;
  if (deadlines.length) {
    deadlines.forEach((d) => { if (!todos.some((x) => x.id === d.id)) { todos.push({ id: d.id, text: d.text, done: !!d.done, due: d.due, assumed: !!d.assumed }); } });
    await JStore.set({ deadlines: [] });
    changed = true;
  }
  const out = await fn(todos);
  if (out || changed) await JStore.set({ todos: out || todos });
}).catch((e) => console.warn("deadline update failed", e)));

async function addDeadline(item, msgId) {
  await withTodos((todos) => {
    if (todos.some((t) => t.id === item.id || (msgId && t.msgId === msgId))) return null;
    todos.push({ id: item.id, text: item.text, done: false, due: item.due, assumed: item.assumed, msgId: msgId || "" });
    chrome.notifications.create("dladd-" + item.id, {
      type: "basic", iconUrl: "icons/icon128.png",
      title: "J.A.R.V.I.S. — Deadline added to Task Queue",
      message: `${item.text}\nAlerts on ${JDeadline.label(item.due)}${item.assumed ? " (no date found, assumed today)" : ""}`,
    });
    return todos;
  });
  check();
}
async function completeDeadline(id) {
  await withTodos((todos) => {
    const t = todos.find((x) => x.id === id);
    if (!t || t.done) return null;
    t.done = true;
    return todos;
  });
  chrome.notifications.clear("dl-" + id);
}

// Alert only on the due DATE, at the due TIME, then keep nagging until the task is ticked.
async function checkDeadlines(s) {
  const { todos = [] } = await JStore.get(["todos"]);
  const { dlState = {} } = await chrome.storage.local.get("dlState");
  const gap = Math.max(1, Number(s.nagMinutes) || 5) * 60000;
  const now = Date.now();
  let dirty = false;
  const live = new Set();
  for (const t of todos) {
    if (!t.due) continue;
    live.add(t.id);
    if (t.done) { chrome.notifications.clear("dl-" + t.id); continue; }
    const st = dlState[t.id] || (dlState[t.id] = {});
    if (now >= t.due && now >= (st.snooze || 0) && now - (st.last || 0) >= gap - 5000) {
      st.last = now; dirty = true;
      const late = now - t.due > 30 * 60000;
      chrome.notifications.create("dl-" + t.id, {
        type: "basic", iconUrl: "icons/icon128.png", priority: 2, requireInteraction: true,
        title: late ? "⚠ DEADLINE OVERDUE" : "⏰ Deadline due now",
        message: `${t.text}\n${late ? "Was due" : "Due"} ${JDeadline.label(t.due)}. Stays until marked complete.`,
        buttons: [{ title: "Mark complete" }, { title: "Snooze 1 hour" }],
      });
    }
  }
  Object.keys(dlState).forEach((k) => { if (!live.has(k)) { delete dlState[k]; dirty = true; } });
  if (dirty) await chrome.storage.local.set({ dlState });
}

async function check() {
  const { settings = {} } = await JStore.get(["settings"]);
  await withTodos(() => null); // runs the one-time migration if needed
  await checkDeadlines({ ...DEFAULTS, ...settings });
  await checkDaily();
}

async function checkDaily() {
  if (new Date().getDay() === 0) { // Sunday: no reminders
    Object.keys(ITEMS).forEach((k) => chrome.notifications.clear("rem-" + k));
    return;
  }
  const { s, r, lastNotified } = await getState();
  const [h, m] = (s.reminderTime || DEFAULTS.reminderTime).split(":").map(Number);
  const now = new Date();
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;

  const pending = Object.keys(ITEMS).filter((k) => !r[k]);

  // Clear notifications for items that are already done
  for (const k of Object.keys(ITEMS)) {
    if (r[k]) chrome.notifications.clear("rem-" + k);
  }
  if (!pending.length) return;

  const gap = Math.max(1, Number(s.nagMinutes) || 5) * 60000;
  if (Date.now() - lastNotified < gap - 5000) return;

  for (const key of pending) {
    chrome.notifications.create("rem-" + key, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "J.A.R.V.I.S. — Reminder",
      message: `${ITEMS[key]}. This alert stays until you mark it complete.`,
      priority: 2,
      requireInteraction: true,
      buttons: [{ title: "Mark complete" }, { title: key === "dr" ? "Open sheet" : "Open portal" }],
    });
  }
  await chrome.storage.local.set({ lastNotified: Date.now() });
}

async function markDone(key) {
  const { r } = await getState();
  r[key] = true;
  await JStore.set({ reminders: r });
  chrome.notifications.clear("rem-" + key);
}

async function targetFor(key) {
  if (key === "dr") {
    const { settings = {} } = await JStore.get(["settings"]);
    return settings.drSheet || "https://docs.google.com/spreadsheets/";
  }
  return PORTAL;
}

chrome.notifications.onButtonClicked.addListener(async (id, btn) => {
  if (id.startsWith("dl-")) {
    const did = id.slice(3);
    if (btn === 0) return completeDeadline(did);
    const { dlState = {} } = await chrome.storage.local.get("dlState");
    dlState[did] = { ...(dlState[did] || {}), snooze: Date.now() + 3600000 };
    await chrome.storage.local.set({ dlState });
    return chrome.notifications.clear(id);
  }
  if (!id.startsWith("rem-") || id === "rem-test") return chrome.notifications.clear(id);
  const key = id.slice(4);
  if (btn === 0) markDone(key);
  else chrome.tabs.create({ url: await targetFor(key) });
});

chrome.notifications.onClicked.addListener(async (id) => {
  if (id.startsWith("dl")) return chrome.tabs.create({ url: "chrome://newtab" });
  if (id.startsWith("rem-") && id !== "rem-test") chrome.tabs.create({ url: await targetFor(id.slice(4)) });
});

// Clean up the iframe header rule from v1.0 (sites now open in normal tabs)
async function setupFrameRules() {
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [1] });
}

function ensureAlarm() {
  chrome.alarms.get("tick", (a) => {
    if (!a) chrome.alarms.create("tick", { periodInMinutes: 1 });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  setupFrameRules();
  check();
});
chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  setupFrameRules();
  check();
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "tick") { check(); JCloud.sync(); }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes.settings || changes.reminders || changes.links || Object.keys(changes).some(JStore.isTodoKey))) JCloud.soon();
  if (area === "sync" && (changes.settings || changes.reminders || Object.keys(changes).some(JStore.isTodoKey))) check();
});

ensureAlarm();

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || sender.id !== chrome.runtime.id) return;
  if (msg.type === "addDeadline" && msg.item) {
    addDeadline(msg.item, msg.msgId).then(() => reply({ ok: true }));
    return true;
  }
  if (msg.type === "cloudSync") {
    JCloud.sync().then(reply);
    return true;
  }
});
