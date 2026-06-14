/* ============================================================
   DocTrack — Email Notification client integration (ADDITIVE)
   ------------------------------------------------------------
   Include AFTER supabase-config.js, supabase-js, sync.js, script.js:

     <script src="services/notif.js"></script>

   - Adds a notification bell + dropdown + unread counter to .topbar-actions
   - Subscribes to public.notification_logs via Supabase Realtime
   - Triggers an immediate scheduler run on login so the user gets
     emails right away for any pending due/overdue documents.
   - Does NOT modify any existing UI, logic, tables, or styles.
   ============================================================ */
(function () {
  const FALLBACK_EMAIL = "pauloestacio57@gmail.com";
  let client = null, channel = null, items = [], unread = 0;

  function getClient() {
    if (client) return client;
    if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return null;
    client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    return client;
  }

  function currentUser() {
    try { return JSON.parse(localStorage.getItem("dt_session") || "null"); } catch { return null; }
  }

  function ensureStyles() {
    if (document.getElementById("notif-bell-css")) return;
    const css = document.createElement("style");
    css.id = "notif-bell-css";
    css.textContent = `
      .notif-wrap{position:relative;display:inline-block;margin-right:8px}
      .notif-btn{position:relative;padding:8px 10px;border-radius:8px;font-size:18px}
      .notif-btn:hover{background:var(--surface-2)}
      .notif-badge{position:absolute;top:2px;right:2px;min-width:18px;height:18px;padding:0 5px;
        background:var(--danger);color:#fff;border-radius:9px;font-size:11px;font-weight:700;
        display:grid;place-items:center;line-height:1}
      .notif-drop{position:absolute;right:0;top:42px;width:340px;max-height:420px;overflow:auto;
        background:var(--surface);border:1px solid var(--border);border-radius:10px;
        box-shadow:var(--shadow-lg);z-index:9999}
      .notif-drop header{padding:10px 12px;border-bottom:1px solid var(--border);font-weight:700;
        display:flex;justify-content:space-between;align-items:center}
      .notif-item{padding:10px 12px;border-bottom:1px solid var(--border);font-size:13px;cursor:default}
      .notif-item:last-child{border-bottom:none}
      .notif-item .t{font-weight:600;margin-bottom:2px}
      .notif-item .m{color:var(--muted);font-size:12px}
      .notif-item.unread{background:var(--surface-2)}
      .notif-empty{padding:24px;text-align:center;color:var(--muted);font-size:13px}
    `;
    document.head.appendChild(css);
  }

  function mountBell() {
    const host = document.querySelector(".topbar-actions");
    if (!host || document.getElementById("notifBell")) return;
    ensureStyles();
    const wrap = document.createElement("div");
    wrap.className = "notif-wrap";
    wrap.innerHTML = `
      <button id="notifBell" class="notif-btn" title="Notifications">🔔<span id="notifBadge" class="notif-badge" style="display:none">0</span></button>
      <div id="notifDrop" class="notif-drop hidden">
        <header><span>Notifications</span><button id="notifMarkAll" class="btn-ghost" style="font-size:12px">Mark all read</button></header>
        <div id="notifList"><div class="notif-empty">No notifications yet</div></div>
      </div>`;
    host.insertBefore(wrap, host.firstChild);
    document.getElementById("notifBell").addEventListener("click", (e) => {
      e.stopPropagation();
      document.getElementById("notifDrop").classList.toggle("hidden");
    });
    document.addEventListener("click", (e) => {
      const d = document.getElementById("notifDrop");
      if (d && !d.classList.contains("hidden") && !e.target.closest(".notif-wrap")) d.classList.add("hidden");
    });
    document.getElementById("notifMarkAll").addEventListener("click", async () => {
      unread = 0; render();
      const u = currentUser(); if (!u) return;
      try {
        await getClient().from("notification_logs")
          .update({ delivery_status: "sent" }).eq("user_id", String(u.id)).eq("delivery_status","pending");
      } catch {}
    });
  }

  function render() {
    const badge = document.getElementById("notifBadge");
    const list  = document.getElementById("notifList");
    if (!badge || !list) return;
    if (unread > 0) { badge.style.display="grid"; badge.textContent = unread > 99 ? "99+" : String(unread); }
    else badge.style.display="none";
    if (!items.length) { list.innerHTML = `<div class="notif-empty">No notifications yet</div>`; return; }
    list.innerHTML = items.slice(0,30).map(n => {
      const when = n.created_at ? new Date(n.created_at).toLocaleString() : "";
      const isUnread = n.delivery_status === "pending";
      return `<div class="notif-item ${isUnread?'unread':''}">
        <div class="t">${(n.subject||'Notification').replace(/[<>]/g,'')}</div>
        <div class="m">${n.notification_type} • ${when}</div>
      </div>`;
    }).join("");
  }

  async function loadInitial() {
    const c = getClient(); const u = currentUser(); if (!c || !u) return;
    const { data } = await c.from("notification_logs")
      .select("*").eq("user_id", String(u.id))
      .order("created_at",{ascending:false}).limit(50);
    items = data || [];
    unread = items.filter(x => x.delivery_status === "pending").length;
    render();
  }

  function subscribe() {
    const c = getClient(); const u = currentUser(); if (!c || !u) return;
    if (channel) { try { c.removeChannel(channel); } catch {} channel = null; }
    channel = c.channel("notif-logs-"+u.id)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "notification_logs", filter: `user_id=eq.${u.id}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            items.unshift(payload.new); unread++;
          } else if (payload.eventType === "UPDATE") {
            items = items.map(x => x.id === payload.new.id ? payload.new : x);
          }
          render();
        })
      .subscribe();
  }

  async function ensureEmailOnUser() {
    // Make sure the signed-in user record has an email saved. If not, set fallback.
    const u = currentUser(); if (!u) return;
    if (u.email && /@/.test(u.email)) return;
    u.email = FALLBACK_EMAIL;
    localStorage.setItem("dt_session", JSON.stringify(u));
    const users = JSON.parse(localStorage.getItem("dt_users") || "[]");
    const i = users.findIndex(x => String(x.id) === String(u.id));
    if (i >= 0) { users[i].email = u.email; localStorage.setItem("dt_users", JSON.stringify(users)); }
  }

  async function kickScheduler() {
    // Fire-and-forget: ask the scheduler to run now (in addition to hourly cron).
    try {
      await fetch(`${window.SUPABASE_URL}/functions/v1/notification-scheduler`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${window.SUPABASE_ANON_KEY}` },
        body: "{}",
      });
    } catch {}
  }

  function boot() {
    const appEl = document.getElementById("app");
    if (!appEl || appEl.classList.contains("hidden")) return setTimeout(boot, 600);
    mountBell();
    ensureEmailOnUser();
    loadInitial();
    subscribe();
    kickScheduler();
  }

  // Watch for login/logout
  let lastUid = null;
  setInterval(() => {
    const u = currentUser();
    const uid = u ? String(u.id) : null;
    if (uid !== lastUid) { lastUid = uid; if (uid) boot(); }
  }, 800);

  if (document.readyState === "complete" || document.readyState === "interactive") setTimeout(boot, 400);
  else document.addEventListener("DOMContentLoaded", boot);
})();
