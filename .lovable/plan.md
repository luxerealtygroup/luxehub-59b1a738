# Apple App Store demo account

## What I found first

- **"Demo Admin (Example)"** already exists in your Luxe Realty Group team, already marked as a demo account, already kept out of coaching, and has no Follow Up Boss link. But its email is a real person's address (`kyrsten@kyrstenfeere.com`), and it was seeded long ago with sample data under a different name. I'll reuse this account and change its email to `demo@luxerealtyhub.com` and its name to "Demo Agent (Sample)".
- **"Test User"** has no email and no role at all — it's a leftover fixture. I'll leave it alone (it's already marked as a system account, so it's out of reporting).

## One login or two?

Two. The app decides who you are by whether a client record is attached to the login: the "I'm a Client" door refuses anyone without one, and the realtor side expects a team profile. Attaching both to one login would create an account that behaves unlike any real user. So:

- `demo@luxerealtyhub.com` — the realtor login
- `demo.client@luxerealtyhub.com` — the sample client, linked to the demo agent

You set both passwords yourself (details at the end). I won't set or print one.

## Sample data (all fictional)

Everything goes under the demo agent, in your tenant, using invented names and addresses (Sample Ave, Fictional Ontario towns) and round, obviously-made-up dollar figures.

- **Pipeline** — 7 clients spread across the stages, mixed buyers and sellers, varied timelines and sources.
- **Transactions** — 3 deals (one firm, one conditional, one closed) with key dates, conditions, and 2–3 placeholder documents each.
- **Weekly Accountability** — goals plus actuals for the current and prior week, so the tab shows progress, not an empty state.
- **Open House Tracker** — one sample open house with four sign-ins, marked so it never leaves the app.
- **Dashboard** — populates from the above.
- **Client portal** — a matching portal for the sample client: property, key dates, conditions, documents, photos, and the demo agent as "My Agent".

## Keeping it out of your live systems

- **Weekly Follow Up Boss sync** — already skips anything that isn't a real agent, and this account is a demo account, so it's excluded today. I'll re-confirm after seeding.
- **Open house push** — this one is *not* safe yet. The automatic push picks up every guest with a phone or email, regardless of whose open house it is, so a reviewer signing someone in would create a contact in your live CRM. I'll add a demo check to both the automatic sweep and the manual send: guests on an open house owned by a demo account are never sent, and the button says so.

## Technical notes

- Reuse profile `21f27748-…`: set `email='demo@luxerealtyhub.com'`, `full_name`, keep `member_type='demo'`, `include_in_team_coaching=false`, `fub_user_id` null, `agent` role.
- Change the auth user's email via the admin API; do not set a password.
- Seed with service-role SQL scoped to the two demo user ids only — no existing row is read or written.
- Open-house guard: in `supabase/functions/_shared/fubOpenHouse.ts` / `openhouse-fub-sweep` / `openhouse-fub`, join the house owner's profile and skip when `member_type='demo'`; surface it in `GuestCard`/FUB settings as "Demo account — never sent".
- Delete the old seeded rows attached to this profile before reseeding so it's idempotent.

## Passwords

Once built, you set each password from the sign-in screen's "Forgot password" link, or I can trigger a reset email to each address on request.
