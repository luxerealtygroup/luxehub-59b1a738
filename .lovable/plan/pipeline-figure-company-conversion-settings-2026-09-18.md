# Pipeline figure + company conversion settings

## 1. Diagnosis — the two numbers count different things (your hypothesis is right)

**Performance tab, "Pipeline (weighted) 24.3 from 25 raw"**
Counts Follow Up Boss *deals* — every deal pulled from FUB whose stage is not a closed stage. Real deals with a property and a commission. Weighting: lease = 0.33, everything else 1.0.

**Goal Coverage tab, "Team Pipeline 182.7 from 188 raw · 8 leases"**
Counts rows in the pipeline client list — one row per client record, no stage filter at all. The only weighting applied is the lease rule (0.33 for tenant/landlord), which is why 188 raw barely shrinks to 182.7. There is no stage probability anywhere.

Confirmed against the live data for this team (189 client records):

| Stage | Records |
|---|---|
| 1 Lead | 103 |
| 2 Active on MLS | 14 |
| 3 Exclusive Listing | 4 |
| 4 BRA Signed | 6 |
| 5 Appointment Held | 13 |
| 6 Appointment Set | 21 |
| 7 Showing | 7 |
| 8 Offer | 11 |
| 9 Pending | 7 |
| 10 (closed/archived) | 3 |

So 103 of 189 — more than half — are Leads with no signed agreement and no transaction, and 3 are already finished. That is the whole of the inflation.

**Which is honest:** neither as labelled, but 24.3 is far closer to the truth. It counts live deals; its weakness is that it only sees clients who reached Follow Up Boss as a deal, so it under-counts signed clients not yet pushed to FUB. The 182.7 is not a pipeline measure at all — it is a contact-list size.

This is what makes the deficit analysis read "+108.7 ahead". With an honest pipeline the same maths comes out far tighter.

## 2. Fix — one meaning of "deal unit"

Qualified pipeline = client records with a signed agreement or a live deal in progress: stages 2–9 (Active on MLS, Exclusive Listing, BRA Signed, Appointment Held, Appointment Set, Showing, Offer, Pending). Excluded: stage 1 Lead (no commitment) and stage 10 (already finished).

Weighting stays exactly the platform rule already in use — leases 0.33, everything else 1.0. **No stage-probability weights.** The conversion rate already accounts for fallout; applying stage probabilities as well would discount the same risk twice. Instead the panel will show the stage mix behind the number so it is inspectable.

Both tabs will state what they count:
- Performance tab: "Live FUB deals (weighted)".
- Goal Coverage: "Qualified pipeline (signed + in progress, weighted)", with a line reading e.g. "83 qualified of 189 client records · 106 leads and closed excluded".

Also fixing while in there: the pipeline query has no team filter (the database scopes it today, but it is the same defence-in-depth gap fixed last round).

## 3. Company conversion rate as a setting

Additive column on the company goal record: `conversion_rate` (nullable). Fallout is simply 100% − conversion, not stored separately.

- Added to the existing **Set/Edit company goal** dialog: "Conversion rate (%)" with the fallout shown live beneath it.
- Default when unset: 30% (today's hardcoded value), and the panel labels it "platform default" versus "company setting" so it is never ambiguous.
- Suggestion, never auto-applied: computed from the team's own 4‑1‑1 history for the year (firm deals ÷ pipeline additions), shown as "Your team's measured rate: X% — use this" with a button. Ignoring it changes nothing.

## Constraints honoured
Additive database only (one nullable column). No publish. Account deletion and /support untouched.
