// ============================================================
// Supabase Edge Function: notification-scheduler
// Runs hourly via pg_cron. Scans documents from app_state and
// triggers send-notification-email for due_soon / due_today / overdue.
// Deploy:  supabase functions deploy notification-scheduler --no-verify-jwt
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Fallback recipient if a doc/user has no email (per user's request)
const FALLBACK_EMAIL = Deno.env.get("FALLBACK_EMAIL") ?? "pauloestacio57@gmail.com";

function ymd(d: Date) { return d.toISOString().slice(0,10); }

function computeState(start: string, days: number, status?: string) {
  if (status === "completed") return { type: null as null | string, due: "", overdue: 0 };
  const due = new Date(start); due.setDate(due.getDate() + Number(days||0));
  const today = new Date(); today.setHours(0,0,0,0); due.setHours(0,0,0,0);
  const diff = Math.round((due.getTime()-today.getTime())/86400000);
  let type: string|null = null;
  if (diff < 0) type = "overdue";
  else if (diff === 0) type = "due_today";
  else if (diff === 1) type = "due_soon";
  return { type, due: ymd(due), overdue: diff < 0 ? -diff : 0 };
}

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Load all users + all per-user docs from app_state
  const { data: rows, error } = await supabase.from("app_state").select("key,value");
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const users: any[] = (rows.find(r => r.key === "dt_users")?.value as any[]) ?? [];
  const usersById = new Map(users.map(u => [String(u.id), u]));

  const checks: Array<{ user:any, doc:any }> = [];
  for (const r of rows) {
    if (!r.key.startsWith("dt_docs::")) continue;
    const userId = r.key.split("::")[1];
    const user = usersById.get(userId);
    const docs = (r.value as any[]) ?? [];
    for (const d of docs) checks.push({ user, doc: d });
  }

  let triggered = 0, skipped = 0, failed = 0;
  for (const { user, doc } of checks) {
    const st = computeState(doc.start, doc.days, doc.status);
    if (!st.type) { skipped++; continue; }
    const to = (user?.email && /@/.test(user.email)) ? user.email : FALLBACK_EMAIL;
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-notification-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({
          to,
          user_id: user?.id ?? null,
          document_id: String(doc.id ?? ""),
          notification_type: st.type,
          doc: {
            doc_number: doc.doc_number ?? doc.number ?? doc.id,
            customer:   doc.customer ?? doc.client ?? "",
            assignee:   doc.assignee ?? doc.assigned_to ?? "",
            due_date:   st.due,
            status:     st.type,
            days_overdue: st.overdue,
          },
        }),
      });
      if (res.ok) triggered++; else failed++;
    } catch { failed++; }
  }

  return new Response(JSON.stringify({ ok: true, triggered, skipped, failed, scanned: checks.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
