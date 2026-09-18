# Required Activity from the pipeline gap — with honest rates

## Part 1: the warning, answered from the data

**Which number is wrong: appointments held.** Year to date the team shows 72 appointments held and 89 contracts. Neither figure is what its label claims.

- Appointments held: only 50 were actually logged as "appointments held". The other 22 were borrowed from a different field when the real one was blank. Only 6 of the 18 people with weekly records ever log appointments at all, and only 27 of 176 agent-weeks carry a number.
- Contracts: only 46 were logged by hand. The other 43 came from the deal system. So more than half the numerator is measured automatically and nearly complete, while the denominator is hand-entered and mostly blank.
- Proof it cannot be a real rate: 32 of the 89 contracts fall in weeks where appointments held was recorded as zero. Contracts with no appointment at all.

**The other appointment rates share the fault.** Appointments set is 82 (76 logged, 6 borrowed), present in 52 of 176 weeks and from the same handful of people. Dials, by contrast, are synced from the phone system — 4,577 across every active agent. Dials to Appt Set 1.7% and Contact to Appt Set 6.9% are therefore a near-complete denominator over a mostly-missing numerator: they understate by roughly the same factor the held rate overstates. All four appointment-based rates are unusable as they stand.

**Contact to Pipeline and Dials to Pipeline** are the two comparatively safe rates: pipeline additions appear in 61 of 176 weeks, still hand-entered, but numerator and denominator at least move together and the result is plausible.

## Part 2: how the page should behave with an unreliable rate

Introduce one shared reliability check, applied to every rate on the panel:

1. **Paired basis.** Compute each rate only over agent-weeks where *both* inputs are present. Mixing a fully synced meter with a sparsely logged one is what produced 123.6%.
2. **Sample floor.** Require at least 12 qualifying agent-weeks and a denominator of at least 30 before showing a number.
3. **Sanity ceiling.** Any rate over 100% is suppressed outright.
4. **Mixed-source flag.** If a large share of either side came from the fallback field rather than the logged one, mark the rate as unverified.

A rate failing any check displays "Not enough data" with a one-line reason ("appointments logged in 27 of 176 weeks"), never a number. Nothing downstream is allowed to consume a failed rate.

## Part 3: Required Activity panel

New card on Goal Coverage, below the deficit analysis. Starts from the same pipeline gap the deficit panel already produces and works backwards:

```text
Pipeline units needed        -> from the deficit panel (everyone entered this year)
  / Contact -> Pipeline      => conversations needed (population: everyone entered)
  / Dials  -> Contact        => dials needed
  x Contact -> Appt Set      => appointments needed
```

Each line shows, in three columns: total needed for the rest of the quarter, per week (divided by whole weeks left in the quarter), and per agent per week (divided by active producing agents — the same agent-only filter used elsewhere, operations and clients excluded).

Beside each required pace, the current actual pace over the last 8 weeks, from the same weekly records, with the shortfall or surplus stated plainly.

Any step whose rate fails the reliability check shows "Cannot calculate — appointments are not logged consistently enough" instead of a target. The pipeline and conversation lines will work today; the appointment line will honestly refuse until logging improves.

## Part 4: editable assumptions

Extend the existing "Edit company goal" dialog, which already holds the conversion rate, with optional overrides for Contact to Pipeline, Dials to Contact and Contact to Appt Set. Each field shows the team's measured rate as a suggestion with a "Use this" button when it passes the reliability check, and is left blank otherwise. Blank means the platform default and the panel labels it "platform default"; a set value labels it "company setting". Nothing is ever applied silently.

## Technical notes

- Reliability logic lives in a new `src/lib/funnelRates.ts` alongside the existing weekly-411 fallback helper, so the Conversion Report can adopt it later.
- Rate overrides are stored as additional keys in the existing company goal record's JSON, so no new table and no schema change beyond one additive column if the record has no room — checked first.
- Team Conversion Rates panel on the Performance tab switches to the same reliability check, so the 123.6% disappears there too.
- No change to what is counted anywhere; no publish.
