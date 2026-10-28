// Optional cloud sync through a PRIVATE GitHub Gist, so two Chrome profiles (personal / work)
// can share tasks, links, settings and daily ticks. Off until a token is saved in Settings.
// The token and passphrase live only in this browser's local storage and are never synced or uploaded.
(function (g) {
  const FILE = "jarvis-newtab.json";
  const API = "https://api.github.com";
  const KEYS = ["todos", "links", "settings", "reminders"];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  /* ---------- 3-way merge (base = last synced copy) ---------- */
  // If only one side changed an item, take that side; if both did, this device (local) wins.
  // With no earlier sync record (noBase), the cloud copy wins. A completed task never gets un-completed by a stale copy.
  const pick = (b, l, r, noBase) => {
    const lch = !same(l, b), rch = !same(r, b);
    if (!lch) return r;
    if (!rch) return l;
    if (l && r && typeof l === "object" && "done" in l && l.done !== r.done) return l.done ? l : r;
    return noBase ? r : l;
  };
  function mergeList(base, local, remote, noBase) {
    const idx = (a) => new Map((a || []).map((x) => [x.id, x]));
    const bm = idx(base), lm = idx(local), rm = idx(remote);
    const out = [], used = new Set();
    const take = (id) => {
      if (used.has(id)) return;
      used.add(id);
      const v = pick(bm.get(id), lm.get(id), rm.get(id), noBase);
      if (v !== undefined) out.push(v);
    };
    (local || []).forEach((x) => take(x.id));
    (remote || []).forEach((x) => take(x.id));
    return out;
  }
  function mergeObj(base, local, remote, noBase) {
    base = base || {}; local = local || {}; remote = remote || {};
    const out = {};
    new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]).forEach((k) => {
      const v = pick(base[k], local[k], remote[k], noBase);
      if (v !== undefined) out[k] = v;
    });
    return out;
  }
  function mergeReminders(base, l, r) {
    l = l || {}; r = r || {};
    if (!l.date) return r;
    if (!r.date) return l;
    if (l.date > r.date) return l;
    if (r.date > l.date) return r;
    if (base && base.date === l.date) return mergeObj(base, l, r); // same day: allow un-ticking too
    return { date: l.date, attendance: !!(l.attendance || r.attendance), dr: !!(l.dr || r.dr) };
  }
  function merge(base, local, remote) {
    const b = base || {}, nb = !base;
    return {
      todos: mergeList(b.todos, local.todos, remote.todos, nb),
      links: mergeList(b.links, local.links, remote.links, nb),
      settings: mergeObj(b.settings, local.settings, remote.settings, nb),
      reminders: mergeReminders(b.reminders, local.reminders, remote.reminders),
    };
  }

  /* ---------- optional end-to-end encryption (passphrase) ---------- */
  const te = new TextEncoder(), td = new TextDecoder();
  const b64 = (buf) => { const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const keyCache = new Map();
  async function deriveKey(pass, salt) {
    const id = pass + "|" + b64(salt);
    if (keyCache.has(id)) return keyCache.get(id);
    const km = await crypto.subtle.importKey("raw", te.encode(pass), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, km, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    keyCache.set(id, key);
    return key;
  }
  async function encode(data, pass) {
    if (!pass) return JSON.stringify({ v: 1, enc: false, data });
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pass, salt);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, te.encode(JSON.stringify(data)));
    return JSON.stringify({ v: 1, enc: true, salt: b64(salt), iv: b64(iv), data: b64(ct) });
  }
  async function decode(text, pass) {
    const doc = JSON.parse(text);
    if (!doc.enc) return doc.data || {};
    if (!pass) throw new Error("This sync data is encrypted — enter the passphrase you used on the other profile.");
    try {
      const key = await deriveKey(pass, unb64(doc.salt));
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(doc.iv) }, key, unb64(doc.data));
      return JSON.parse(td.decode(pt));
    } catch { throw new Error("Wrong passphrase for the synced data."); }
  }

  /* ---------- GitHub Gist ---------- */
  const gh = (token, path, opts = {}) => fetch(API + path, {
    ...opts,
    headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28",
      ...(opts.body ? { "Content-Type": "application/json" } : {}) },
  });
  function httpError(res) {
    if (res.status === 401) return new Error("GitHub rejected the token (use a classic token with only the “gist” scope).");
    if (res.status === 403 || res.status === 429) return new Error("GitHub refused the request (rate limit or token permissions).");
    return new Error("GitHub error " + res.status);
  }
  async function findGist(token) {
    for (let page = 1; page <= 3; page++) {
      const res = await gh(token, `/gists?per_page=100&page=${page}`);
      if (!res.ok) throw httpError(res);
      const list = await res.json();
      const hit = list.find((x) => x.files && x.files[FILE]);
      if (hit) return hit.id;
      if (list.length < 100) break;
    }
    return "";
  }

  /* ---------- the sync run ---------- */
  const L = chrome.storage.local;
  let busy = null, timer;
  async function setStatus(ok, msg, extra) {
    const s = { ts: Date.now(), ok, msg, ...(extra || {}) };
    await L.set({ cloudStatus: s });
    return s;
  }
  async function run() {
    const c = await L.get(["cloudToken", "cloudPass", "cloudGist", "cloudBase"]);
    if (!c.cloudToken) return { ok: false, off: true, msg: "Cloud sync is off" };
    const token = c.cloudToken, pass = c.cloudPass || "";
    try {
      let id = c.cloudGist || (await findGist(token));
      let remote = null, remoteEnc = false;
      if (id) {
        const res = await gh(token, "/gists/" + id);
        if (res.status === 404) { id = ""; }
        else if (!res.ok) throw httpError(res);
        else {
          const j = await res.json();
          const f = j.files && j.files[FILE];
          if (f) {
            let text = f.content;
            if (f.truncated && f.raw_url) text = await (await fetch(f.raw_url)).text();
            remote = await decode(text, pass);
            remoteEnc = !!JSON.parse(text).enc;
          }
        }
      }
      const got = await JStore.get(KEYS);
      const local = { todos: got.todos || [], links: got.links || [], settings: got.settings || {}, reminders: got.reminders || {} };
      const merged = remote ? merge(c.cloudBase, local, remote) : local;
      const write = {};
      KEYS.forEach((k) => { if (!same(merged[k], local[k])) write[k] = merged[k]; });
      if (Object.keys(write).length) await JStore.set(write);
      if (!remote || !same(merged, remote) || remoteEnc !== !!pass) {
        const content = await encode(merged, pass);
        if (!id) {
          const res = await gh(token, "/gists", { method: "POST", body: JSON.stringify({ description: "JARVIS New Tab sync (private)", public: false, files: { [FILE]: { content } } }) });
          if (!res.ok) throw httpError(res);
          id = (await res.json()).id;
        } else {
          const res = await gh(token, "/gists/" + id, { method: "PATCH", body: JSON.stringify({ files: { [FILE]: { content } } }) });
          if (!res.ok) throw httpError(res);
        }
      }
      await L.set({ cloudGist: id, cloudBase: merged });
      return setStatus(true, "Synced", { gist: id, changed: Object.keys(write).length > 0 });
    } catch (e) {
      const offline = e instanceof TypeError;
      return setStatus(false, offline ? "Offline — will retry" : e.message);
    }
  }
  function sync() {
    if (!busy) busy = run().finally(() => { busy = null; });
    return busy;
  }
  function soon(ms = 4000) {
    clearTimeout(timer);
    timer = setTimeout(sync, ms);
  }
  g.JCloud = { sync, soon, merge, encode, decode };
})(typeof self !== "undefined" ? self : window);
