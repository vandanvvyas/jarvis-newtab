// Shared storage layer: synced across devices via chrome.storage.sync.
// settings, reminders, links and todos are synced; lastNotified stays per-device.
(function (g) {
  const hasSync = typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync;
  const SIMPLE = ["settings", "reminders", "links", "deadlines"];
  const CHUNK = 2000; // chars per sync item (8 KB item limit, JSON escaping)

  const LS = {
    async get(keys) {
      const o = {};
      keys.forEach((k) => { const v = localStorage.getItem(k); if (v !== null) o[k] = JSON.parse(v); });
      return o;
    },
    async set(o) { Object.entries(o).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v))); },
  };

  async function readTodos() {
    const { todos_n } = await chrome.storage.sync.get("todos_n");
    if (!todos_n) return undefined;
    const keys = Array.from({ length: todos_n }, (_, i) => "todos_" + i);
    const parts = await chrome.storage.sync.get(keys);
    try { return JSON.parse(keys.map((k) => parts[k] || "").join("")); } catch { return []; }
  }

  async function writeTodos(todos) {
    const str = JSON.stringify(todos);
    const n = Math.ceil(str.length / CHUNK);
    const { todos_n: old = 0 } = await chrome.storage.sync.get("todos_n");
    const o = { todos_n: n };
    for (let i = 0; i < n; i++) o["todos_" + i] = str.slice(i * CHUNK, (i + 1) * CHUNK);
    await chrome.storage.sync.set(o);
    const stale = [];
    for (let i = n; i < old; i++) stale.push("todos_" + i);
    if (stale.length) await chrome.storage.sync.remove(stale);
  }

  // One-time copy of data saved by older (local-only) versions, never overwriting synced data.
  async function migrate() {
    const have = await chrome.storage.sync.get([...SIMPLE, "todos_n"]);
    const local = await chrome.storage.local.get([...SIMPLE, "todos"]);
    const add = {};
    SIMPLE.forEach((k) => { if (have[k] === undefined && local[k] !== undefined) add[k] = local[k]; });
    if (Object.keys(add).length) await chrome.storage.sync.set(add);
    if (!have.todos_n && Array.isArray(local.todos) && local.todos.length) await writeTodos(local.todos);
  }
  let migrated;

  g.JStore = {
    async get(keys) {
      if (!hasSync) return LS.get(keys);
      migrated = migrated || migrate().catch(() => {});
      await migrated;
      const out = await chrome.storage.sync.get(keys.filter((k) => k !== "todos"));
      if (keys.includes("todos")) {
        const t = await readTodos();
        if (t !== undefined) out.todos = t;
      }
      return out;
    },
    async set(o) {
      if (!hasSync) return LS.set(o);
      const { todos, ...rest } = o;
      try {
        if (Object.keys(rest).length) await chrome.storage.sync.set(rest);
        if (todos !== undefined) await writeTodos(todos);
      } catch (e) { console.warn("Sync save failed (quota?)", e); }
    },
    isTodoKey: (k) => k === "todos_n" || k.startsWith("todos_"),
  };
})(typeof self !== "undefined" ? self : window);
