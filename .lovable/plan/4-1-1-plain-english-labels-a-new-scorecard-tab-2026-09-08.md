# 4-1-1: plain-English labels + a new Scorecard tab

Rename every field label on the Weekly tab to plain English so agents read it themselves instead of internal Follow Up Boss jargon. **Display labels only** — the underlying `weekly_411` column names stay exactly as they are, so nothing breaks and no data moves. No migration, no type changes, no save-path change.

## Label map (column → new display label)

Activity card (read-only, from Follow Up Boss):

| Column | Old label | New label |
| --- | --- | --- |
| `leads_received` | Leads Received | **New Leads** |
| `dials` | Dials | **Calls Made** |
| `connects` | Connects | **Calls Answered** |
| `conversations` | Conversations | **Real Conversations** |
| `texts_sent` | Texts Sent | Texts Sent (unchanged) |
| `talk_time_minutes` | Talk Time (min) | **Time on the Phone** |
| `speed_to_first_touch_minutes` | Speed to First Touch (min) | **Time to First Contact** |
| `appointments_set` | Appointments Set | **Appointments Booked** |

Database Health card (read-only, from Follow Up Boss):

| Column | Old label | New label |
| --- | --- | --- |
| `contacts_held` | Contacts Held | **Database Size** |
| `contacts_unstaged` | Contacts Unstaged | **Unsorted Records** |
| `contacts_per_live_deal` | Contacts / Live Deal | **Records per Live Deal** |

Weekly Activity Tracking card (manual):

| Field | Old label | New label |
| --- | --- | --- |
| `appointments_held` (auto-calc) | Appointments Held | **Appointments That Happened** |

## Call-funnel caption

Under **Calls Made**, **Calls Answered** and **Real Conversations** add a single shared caption:

> The funnel of a phone call — calls placed, calls someone picked up, and calls that became a real exchange. The drop between them is the point.

## Deleted / single-source fields

- **Contacts Made** — deleted entirely from the Weekly tab. It already isn't rendered there; the `contacts_made` column and its history stay untouched. Calls Answered and Real Conversations already cover what it measured.
- **Database Size** — the old manual Database Size input is already gone from the Weekly Activity Tracking card. The automated `contacts_held` value is the single Database Size shown (now relabeled). Confirm the manual input stays removed; only the automated one renders.

## Caption updates that reference renamed labels

The existing line "Set = booked, counted by Follow Up Boss. Held = actually happened, counted from your appointment records (below)." becomes:

> Booked = booked, counted by Follow Up Boss. That Happened = actually happened, counted from your appointment records (below).

The two read-only cards keep their "Measured by Follow Up Boss — updates weekly" caption, and the manual card keeps "Things Follow Up Boss can't see — enter these yourself." Every automated field still shows an em dash until the weekly run writes it, and the greyed "entered by hand — before automation" note for legacy un-stamped weeks is unchanged.

## New Scorecard tab

The Weekly tab is doing too much, so the two read-only Follow Up Boss cards move out of it into a third tab in the existing 4-1-1 tab strip, alongside Weekly and Monthly, with the same styling as those triggers.

- **Weekly tab** keeps only what the agent plans and enters by hand: goals, priorities, wins/challenges/next steps, Doors Knocked, Pipeline Additions, Contracts Signed, Firm Sales, the Goal Tracking card, the appointment records, and the auto-calculated **Appointments That Happened**.
- **Scorecard tab** holds only the automated numbers, all read-only, with a caption at the top: "Updates every Sunday from Follow Up Boss. Shows a dash until the first run." Inside it, the two cards stay separate and in this order:
  1. **Activity** — New Leads, Calls Made, Calls Answered, Real Conversations, Texts Sent, Time on the Phone, Time to First Contact, Appointments Booked — with the phone-call funnel caption under the three call fields.
  2. **Database Health** — Database Size, Unsorted Records, Records per Live Deal.

The Scorecard reads the same week as the Weekly tab (the same week picker selection and the same loaded record), so it behaves identically whether an agent is viewing their own 4-1-1 or an owner is viewing an agent's through View as Agent — no separate query, no separate permissions. The em dash rule and the greyed "entered by hand — before automation" note for legacy un-stamped weeks move across unchanged.

Because the Appointments Booked / Appointments That Happened pair is now split across two tabs, each side carries a short pointer instead of the single shared line: Scorecard says "Booked = booked, counted by Follow Up Boss. See Appointments That Happened on the Weekly tab." and the Weekly tab says "That Happened = actually happened, counted from your appointment records. Booked is on the Scorecard tab."

## Team Coaching labels (`Team411.tsx`)

The admin Team Coaching view gets the same plain-English names so coaching conversations use one vocabulary. Space is tighter there, so the labels are the same words, shortened only where the grid demands it:

- Contacts Held → **Database Size**, Unstaged → **Unsorted**, Per Live Deal → **Per Live Deal**
- Leads → **New Leads**, Connects → **Calls Answered**, Convos → **Real Conversations**, Talk (min) → **Time on Phone**, Speed (min) → **Time to First Contact**
- Dials → **Calls Made**, Appts Set → **Appts Booked**, Appts Held → **Appts Happened**
- **Contacts** (`contacts_made`) and **DB Size** (`database_size`, the old manual column) are removed from the Team Coaching grid — Calls Answered / Real Conversations and the automated Database Size replace them.

Keys and columns are untouched here too; this is label text and two removed tiles.

## Files touched

- `src/pages/FourOneOne.tsx` — new Scorecard tab trigger and panel, the two read-only cards moved into it, label strings, captions.
- `src/components/Team411.tsx` — label strings and the two removed tiles.

Unchanged: the `weekly_411` table, the `record_weekly_411_actuals` RPC, `get-my-weekly-411.ts`, `weekly411Fallback.ts`, the save payload, and all reports.

No migration. No type regeneration. This is a UI-only change.
