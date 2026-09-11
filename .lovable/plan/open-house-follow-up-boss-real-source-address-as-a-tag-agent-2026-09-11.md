# Open house → Follow Up Boss: real source, address as a tag, agent-picked stage

## What changes for the agent

- Every open house guest lands in Follow Up Boss with the source **Open House** — one label, not one per property.
- The property becomes a tag: **Open House - 195 Green Vista Drive**, alongside the existing temperature and home-to-sell tags.
- Next to **Send to Follow Up Boss** on each guest row there is a **Stage** dropdown, filled with the real stage list from the connected Follow Up Boss account.
- The stage last used is remembered as the default, so sending is one tap. Sending is blocked with a clear message if no stage is picked.
- **Send all** asks for one stage for the batch; any guest who already has their own choice on their row keeps it.
- Assignment still goes to the hosting agent. Notes, tags and the duplicate check are unchanged.

## The guard on people already in Follow Up Boss

If the person is already in the database, the chosen stage is applied **only** when they are sitting in an unworked/default stage (or have no stage at all). If they are in a real working stage, the stage is left untouched and the guest row shows a small note: *"Stage left as Under Contract — already being worked."*

"Unworked" means: no stage, the account's first stage in the pipeline order, or a name matching the usual entry stages (Lead, New Lead, Contact, Contacted, Inquiry, Unworked, New). Everything else counts as worked and is left alone. Source, assigned agent and existing tags on an existing person stay exactly as they are today — tags merge, nothing is overwritten.

## Technical detail

**Migration** — two nullable text columns on `open_house_visitors`:
- `fub_stage` — the stage we asked for
- `fub_stage_result` — short outcome text shown on the row (`Stage set to Warm` / `Stage left as Under Contract — already being worked`)

**Edge function `supabase/functions/openhouse-fub/index.ts`**
- New action `stages`: `GET /stages` from the Follow Up Boss API, returns `[{id, name}]` in account order. Cached in module memory per org for 5 minutes. Staff-readable; the key never leaves the function.
- `push` / `push_all` accept a `stage` string; reject with 400 when missing or not in the live stage list.
- New person: `source: 'Open House'`, `stage: <chosen>`, tags `['Open House', 'Open House - <address>', temperature, home-to-sell]`.
- Existing person: fetch their current stage from the search result, merge tags as today; include `stage` in the PUT only when the current stage is unworked. Record the outcome in `fub_stage_result`.

**UI**
- `src/components/openhouse/FubStageSelect.tsx` (new) — loads stages once via the `stages` action, remembers the last pick in `localStorage` under `openhouse_fub_stage`.
- `src/components/openhouse/GuestCard.tsx` — stage dropdown beside the send button; shows `fub_stage_result` under the sent badge.
- `src/components/openhouse/GuestList.tsx` — Send all opens a small dialog with one stage picker and the count; per-row choices win.
- `src/lib/openHouse/guests.ts` — add the two new fields to `Guest` and `GUEST_COLUMNS`.

Nothing outside the open house tracker is touched.
