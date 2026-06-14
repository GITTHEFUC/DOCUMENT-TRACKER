# Email Notification Module — DocTrack

Adds automatic SLA email notifications (Due Within 24 Hours, Due Today, Overdue),
an in-app notification bell with realtime unread counter, and an hourly
background scheduler — **without modifying any of your existing code**.

Emails are sent via **Resend** (preferred). Recipient defaults to the
account email; if a user has no email, the system falls back to
`pauloestacio57@gmail.com`.

```
/email-notification-module
├── sql/
│   ├── 001_notification_logs.sql       # additive table + RLS + realtime
│   └── 002_pg_cron_hourly.sql          # hourly cron job
├── supabase/functions/
│   ├── send-notification-email/        # sends one email + logs
│   └── notification-scheduler/         # scans docs, triggers sends
├── services/
│   └── notif.js                        # client bell/dropdown + realtime
├── email-templates/                    # HTML template lives inside the edge fn
├── types/
└── README.md
```

## 1. Database

In the Supabase SQL editor, run:

1. `sql/001_notification_logs.sql`
2. `sql/002_pg_cron_hourly.sql` (replace `<PROJECT_REF>` and `<SERVICE_ROLE_KEY>`)

## 2. Secrets (environment variables)

```
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set FROM_EMAIL="DocTrack <noreply@yourdomain.com>"
supabase secrets set FALLBACK_EMAIL="pauloestacio57@gmail.com"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

Get a Resend API key at https://resend.com (free tier OK).
If you don't have a verified domain yet, use `onboarding@resend.dev` as FROM_EMAIL
for testing.

## 3. Deploy edge functions

```
supabase functions deploy send-notification-email --no-verify-jwt
supabase functions deploy notification-scheduler   --no-verify-jwt
```

## 4. Integrate into the frontend (one line)

Copy `services/notif.js` next to your `index.html` and add ONE line at the
bottom of `index.html`, AFTER `script.js`:

```html
<script src="services/notif.js"></script>
```

That's it. No other file changes are needed.

## What you get

- 🔔 Notification bell in the topbar with unread counter (realtime).
- Dropdown listing the latest 30 notifications, "Mark all read" action.
- Hourly cron scans every user's documents and emails
  Due-Soon (≤24h), Due-Today, and Overdue items.
- Per-day dedupe — each (document, type) sends at most one email per day.
- On login, the scheduler is kicked once immediately so urgent emails go
  out without waiting for the next hour.

## Email content

Every email contains: Document Number, Customer Name, Assigned Personnel,
Due Date, Current Status, and Days Overdue (when applicable).

## Testing

1. Sign in to DocTrack.
2. Add a document with **start = yesterday** and **days = 0** (will be Overdue).
3. Within a few seconds (we kick the scheduler on login) you should:
   - receive an email at your account email (or the fallback),
   - see a new entry in the 🔔 dropdown with the unread badge incrementing.

## Rollback

Nothing in your existing app was modified. To remove the module:

- Delete the `<script src="services/notif.js"></script>` line.
- `supabase functions delete send-notification-email notification-scheduler`
- `select cron.unschedule('doctrack-notif-hourly');`
- `drop table public.notification_logs;`
