// ============================================================
// Supabase Edge Function: send-notification-email
// Sends a single email via Resend and logs to notification_logs.
// Deploy:  supabase functions deploy send-notification-email --no-verify-jwt
// Secrets: supabase secrets set RESEND_API_KEY=... FROM_EMAIL="DocTrack <noreply@yourdomain.com>"
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL     = Deno.env.get("FROM_EMAIL") ?? "DocTrack <onboarding@resend.dev>";
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  to: string;
  user_id?: string;
  document_id?: string;
  notification_type: "due_soon" | "due_today" | "overdue";
  doc: {
    doc_number?: string;
    customer?: string;
    assignee?: string;
    due_date?: string;
    status?: string;
    days_overdue?: number;
  };
}

function buildEmail(p: Payload) {
  const t = p.notification_type;
  const titleMap = {
    due_soon:  "⏰ Document Due Within 24 Hours",
    due_today: "📅 Document Due Today",
    overdue:   "🚨 Document Overdue",
  };
  const subject = `[DocTrack] ${titleMap[t]} — ${p.doc.doc_number ?? ""}`;
  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#0f172a">
    <div style="background:#10b981;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0">
      <h2 style="margin:0">${titleMap[t]}</h2>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;padding:20px;background:#fff">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#64748b">Document #</td><td><b>${p.doc.doc_number ?? "—"}</b></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Customer</td><td>${p.doc.customer ?? "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Assigned</td><td>${p.doc.assignee ?? "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Due Date</td><td>${p.doc.due_date ?? "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Status</td><td>${p.doc.status ?? "—"}</td></tr>
        ${p.doc.days_overdue && p.doc.days_overdue > 0 ? `<tr><td style="padding:6px 0;color:#ef4444"><b>Days Overdue</b></td><td><b style="color:#ef4444">${p.doc.days_overdue}</b></td></tr>` : ""}
      </table>
      <p style="margin-top:18px;color:#64748b;font-size:12px">This is an automated SLA notification from DocTrack.</p>
    </div>
  </div>`;
  return { subject, html };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const p = (await req.json()) as Payload;
    if (!p?.to || !p?.notification_type) {
      return new Response(JSON.stringify({ error: "missing fields" }), { status: 400, headers: cors });
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { subject, html } = buildEmail(p);

    // Dedupe: insert pending row first; unique index blocks duplicates per (doc,type,day)
    const { data: logRow, error: insErr } = await supabase
      .from("notification_logs")
      .insert({
        user_id: p.user_id ?? null,
        document_id: p.document_id ?? null,
        email: p.to,
        notification_type: p.notification_type,
        subject,
        message: html,
        delivery_status: "pending",
      })
      .select()
      .single();

    if (insErr) {
      // duplicate => already sent today, treat as success no-op
      return new Response(JSON.stringify({ skipped: true, reason: insErr.message }), { headers: cors });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: [p.to], subject, html }),
    });
    const body = await res.text();

    await supabase
      .from("notification_logs")
      .update({
        delivery_status: res.ok ? "sent" : "failed",
        error: res.ok ? null : body.slice(0, 500),
        sent_at: new Date().toISOString(),
      })
      .eq("id", logRow.id);

    return new Response(JSON.stringify({ ok: res.ok, id: logRow.id }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
