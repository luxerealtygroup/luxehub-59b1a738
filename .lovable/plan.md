# Weekly 4-1-1 tab: plain-English field labels

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

## Files touched

- `src/pages/FourOneOne.tsx` — label strings only (the `activityFields`, `healthFields`, and manual-card arrays, plus the two caption lines). No keys, no save payload, no column references change.

Unchanged: the `weekly_411` table, the `record_weekly_411_actuals` RPC, `get-my-weekly-411.ts`, `Team411.tsx` (admin Team Coaching keeps its own labels), `weekly411Fallback.ts`, and all reports. The admin Team Coaching view is out of scope for this pass; it can be aligned in a follow-up if you want.

No migration. No type regeneration. This is a pure UI-label change.
