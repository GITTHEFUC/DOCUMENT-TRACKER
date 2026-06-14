/* ============================================================
   DocTrack — Cloud accounts + real-time per-user sync
   ------------------------------------------------------------
   - `dt_users` is synced GLOBALLY so accounts created on one
     device can sign in on another device. Pushes are MERGED
     (never overwritten) so no device can wipe accounts.
   - `dt_docs`, `dt_logs`, `dt_notifs` are synced PER-USER
     (scoped to the signed-in user's id). New users start empty.
   - Device-local keys (NOT synced): dt_session, dt_theme, dt_seeded.

   This file does NOT modify any existing app logic. It only
   mirrors localStorage writes to the cloud and applies remote
   changes back into localStorage, then asks the app to re-render.
   ============================================================ */
(function () {
  const GLOBAL_KEYS = ["dt_users"];
  const USER_KEYS   = ["dt_docs", "dt_logs", "dt_notifs"];
  const ALL_KEYS    = GLOBAL_KEYS.concat(USER_KEYS);
  const TABLE = "app_state";

  const nativeSetItem    = Storage.prototype.setItem.bind(localStorage);
  const nativeRemoveItem = Storage.prototype.removeItem.bind(localStorage);

  const lastRemote = new Map(); // cloudKey -> serialized value (echo guard)
  let client = null;
  let ready = false;
  let queue = [];
  let currentUserId = null;
  let channel = null;

  function getClient() {
    if (client) return client;
    if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return null;
    client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    return client;
  }

  function readSessionUserId() {
    try {
      const s = JSON.parse(localStorage.getItem("dt_session") || "null");
      return s && s.id ? String(s.id) : null;
    } catch { return null; }
  }

  // cloud key naming: global keys keep their name; user keys get "::<userId>".
  function cloudKeyFor(localKey, userId) {
    if (GLOBAL_KEYS.includes(localKey)) return localKey;
    if (!userId) return null;
    return `${localKey}::${userId}`;
  }
  function localKeyFor(cloudKey) {
    const i = cloudKey.indexOf("::");
    return i === -1 ? cloudKey : cloudKey.slice(0, i);
  }
  function userIdOfCloudKey(cloudKey) {
    const i = cloudKey.indexOf("::");
    return i === -1 ? null : cloudKey.slice(i + 2);
  }

  function safeRerender() {
    try {
      const appEl = document.getElementById("app");
      if (!appEl || appEl.classList.contains("hidden")) return;
      if (typeof window.renderPage === "function") window.renderPage();
      if (typeof window.renderNotifBell === "function") window.renderNotifBell();
      const panel = document.getElementById("notifPanel");
      if (panel && !panel.classList.contains("hidden") && typeof window.renderNotifPanel === "function") {
        window.renderNotifPanel();
      }
    } catch (e) { /* ignore */ }
  }

  function applyRemote(localKey, value) {
    const serialized = JSON.stringify(value);
    const ck = cloudKeyFor(localKey, currentUserId);
    if (ck) lastRemote.set(ck, serialized);
    else    lastRemote.set(localKey, serialized);
    nativeSetItem(localKey, serialized);
    safeRerender();
  }

  // Merge two dt_users arrays by email. `local` wins for the same email
  // (covers password changes), everything else is kept (union).
  function mergeUsers(cloudUsers, localUsers) {
    const out = Array.isArray(cloudUsers) ? cloudUsers.slice() : [];
    const idx = new Map(out.map((u, i) => [String(u && u.email || "").toLowerCase(), i]));
    for (const u of (Array.isArray(localUsers) ? localUsers : [])) {
      const em = String(u && u.email || "").toLowerCase();
      if (!em) continue;
      if (idx.has(em)) out[idx.get(em)] = u;
      else { idx.set(em, out.length); out.push(u); }
    }
    return out;
  }

  async function upsertRow(cloudKey, parsed) {
    const c = getClient();
    if (!c) return { error: { message: "offline" } };
    return await c.from(TABLE).upsert(
      { key: cloudKey, value: parsed, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  }

  async function pushCloud(cloudKey, rawValue, attempt) {
    const c = getClient();
    if (!c) return;
    attempt = attempt || 0;
    let parsed;
    try { parsed = JSON.parse(rawValue); } catch { parsed = rawValue; }

    let error = null;
    if (cloudKey === "dt_users") {
      // SAFE MERGE: never let one device overwrite accounts created on
      // another device. Read cloud users, merge, write back, mirror locally.
      const { data, error: readErr } = await c.from(TABLE)
        .select("value").eq("key", cloudKey).maybeSingle();
      if (readErr) { error = readErr; }
      else {
        const merged = mergeUsers(data ? data.value : [], parsed);
        const res = await upsertRow(cloudKey, merged);
        error = res.error;
        if (!error) {
          const s = JSON.stringify(merged);
          if (s !== JSON.stringify(parsed)) {
            lastRemote.set(cloudKey, s);
            nativeSetItem("dt_users", s);
          }
        }
      }
    } else {
      const res = await upsertRow(cloudKey, parsed);
      error = res.error;
    }

    if (error) {
      console.warn("[sync] push failed", cloudKey, error.message);
      if (attempt < 3) {
        setTimeout(() => pushCloud(cloudKey, rawValue, attempt + 1), 1000 * Math.pow(2, attempt));
      }
    }
  }

  // Pull all rows for the given user (and global keys), apply to localStorage.
  async function loadForUser(userId) {
    const c = getClient();
    if (!c) return;
    const keys = GLOBAL_KEYS.concat(userId ? USER_KEYS.map(k => `${k}::${userId}`) : []);
    const { data, error } = await c.from(TABLE).select("key,value").in("key", keys);
    if (error) { console.warn("[sync] fetch failed", error.message); return; }
    const cloud = new Map((data || []).map(r => [r.key, r.value]));

    // Globals — merge cloud accounts with local ones (never lose either side)
    for (const k of GLOBAL_KEYS) {
      if (cloud.has(k)) {
        let local = [];
        try { local = JSON.parse(localStorage.getItem(k) || "[]"); } catch {}
        applyRemote(k, mergeUsers(cloud.get(k), local));
      }
    }
    // Per-user: empty by default for new users
    if (userId) {
      for (const k of USER_KEYS) {
        const ck = `${k}::${userId}`;
        if (cloud.has(ck)) {
          applyRemote(k, cloud.get(ck));
        } else {
          // Ensure local is clean for fresh accounts
          applyRemote(k, []);
        }
      }
    }
  }

  function resubscribe() {
    const c = getClient(); if (!c) return;
    if (channel) { try { c.removeChannel(channel); } catch {} channel = null; }
    channel = c.channel("app_state_" + (currentUserId || "anon"))
      .on("postgres_changes",
          { event: "*", schema: "public", table: TABLE },
          (payload) => {
            if (payload.eventType === "DELETE") return;
            const row = payload.new; if (!row || !row.key) return;
            const lk = localKeyFor(row.key);
            const owner = userIdOfCloudKey(row.key);
            if (GLOBAL_KEYS.includes(lk)) {
              applyRemote(lk, row.value);
            } else if (USER_KEYS.includes(lk) && owner && owner === currentUserId) {
              applyRemote(lk, row.value);
            }
          })
      .subscribe();
  }

  // Called when login/logout changes the active user.
  async function onSessionChanged(newUserId) {
    if (newUserId === currentUserId) return;
    currentUserId = newUserId;
    if (newUserId) {
      await loadForUser(newUserId);
    }
    resubscribe();
    safeRerender();
  }

  // ---- Hook localStorage ----
  Storage.prototype.setItem = function (key, value) {
    nativeSetItem(key, value);
    if (this !== localStorage) return;

    if (key === "dt_session") {
      // session changed (login or user-switch)
      const uid = readSessionUserId();
      onSessionChanged(uid);
      return;
    }

    if (!ALL_KEYS.includes(key)) return;
    const ck = cloudKeyFor(key, currentUserId);
    if (!ck) return; // per-user write with no session — skip
    if (lastRemote.get(ck) === value) { lastRemote.delete(ck); return; }
    if (!ready) { queue.push([ck, value]); return; }
    pushCloud(ck, value);
  };

  Storage.prototype.removeItem = function (key) {
    nativeRemoveItem(key);
    if (this === localStorage && key === "dt_session") {
      onSessionChanged(null);
    }
  };

  async function bootstrap() {
    const c = getClient();
    if (!c) { console.warn("[sync] Supabase not configured — running offline."); return; }

    currentUserId = readSessionUserId();

    // Pull globals + current user's data
    await loadForUser(currentUserId);

    ready = true;
    const pending = queue.splice(0);
    for (const [ck, v] of pending) {
      // If cloud already has data for this key, don't overwrite with
      // locally-seeded defaults. (dt_users pushes are merge-safe anyway.)
      if (ck !== "dt_users" && lastRemote.has(ck)) continue;
      pushCloud(ck, v);
    }

    resubscribe();
    safeRerender();
  }

  // Expose a readiness promise so the app/login can wait for cloud sync.
  window.DTSync = window.DTSync || {};
  window.DTSync.whenReady = function () {
    return new Promise((resolve) => {
      if (ready) return resolve();
      const t = setInterval(() => { if (ready) { clearInterval(t); resolve(); } }, 50);
      setTimeout(() => { clearInterval(t); resolve(); }, 5000); // fail-open after 5s
    });
  };
  window.DTSync.reloadUsers = async function () {
    const c = getClient(); if (!c) return;
    const { data } = await c.from(TABLE).select("key,value").in("key", GLOBAL_KEYS);
    for (const r of (data || [])) {
      if (r.key === "dt_users") {
        let local = [];
        try { local = JSON.parse(localStorage.getItem("dt_users") || "[]"); } catch {}
        applyRemote(r.key, mergeUsers(r.value, local));
      } else if (GLOBAL_KEYS.includes(r.key)) {
        applyRemote(r.key, r.value);
      }
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
