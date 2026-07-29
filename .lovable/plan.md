## Root cause — confirmed by database read

**Terra White and Kristen Schulz (Owner) both have `fub_user_id = 1`.**

| Agent | fub_user_id |
|---|---|
| Kristen Schulz (Owner) | **1** |
| **Terra White** | **1** |
| Lexi Vanderwerf-Mcneil | 2 |
| Hana Karimi | 3 |
| Marie Zinger | 8 |
| Nick Dertinger | 10 |
| Melissa Carter | 11 |

### Why the note is wrong

The generator's scoping is otherwise correct — `CoachingNotes.tsx` sends the selected agent's id, and every DB query in `generate-coaching-notes/index.ts` (profile, weekly goals, annual goals, pipeline clients, gap settings) filters on that `agent_id`. Nothing comes from the admin's own session.

The leak is entirely in the Follow Up Boss deal step:

1. The function fetches the **entire company-wide** FUB deal list (`get_deals`, all: true).
2. It narrows with `dealBelongsToAgent(deal, profile.fub_user_id)`, which keeps any deal whose assigned FUB `users` array contains that id.
3. Since Terra's profile carries the Owner's id (1), **every one of Kristen's deals matches Terra** — which is exactly why the closed/pending GCI totals equal the Owner's company-wide numbers.
4. "117 Mary Street" (Nick's deal) appears because FUB deals can have multiple assigned users; the Owner is also on that deal, so id 1 matches and it sweeps in.

The note is effectively the Owner's book of business with Terra's name on it.

## Two things need fixing

**A. Data** — Terra's FUB mapping is wrong. It must be her real FUB user id, or `NULL` if she has no FUB seat. (When NULL the function already degrades safely to "Agent has no fub_user_id set on profile" rather than leaking.)

**B. Code** — nothing prevents the collision recurring on the next agent onboarding.

## Proposed fix (pending approval)

1. **Correct Terra's mapping** — I need her real FUB user id from you, or confirmation to set it to `NULL`.
2. **Partial unique index** on `profiles.fub_user_id` (where not null) so two profiles can never share an id again.
3. **Guard in the generator** — before filtering deals, check whether the agent's `fub_user_id` is shared by another profile; if so, skip FUB deals and record a warning instead of attributing someone else's book.
4. **Regenerate Terra's Jul 27 note** once the mapping is correct, and review any earlier notes generated for her.

## Technical notes

- Files: `supabase/functions/generate-coaching-notes/index.ts` (the `dealBelongsToAgent` filter and the `get_deals` fetch). `src/pages/CoachingNotes.tsx` needs no change.
- Secondary latent issue, **not** the cause here: `follow-up-boss` resolves its API key from the caller's JWT, and the generator calls it with the service-role key, so the `x-view-as-user-id` header is ignored and the primary FUB account is always queried. Every agent is on `primary` today, so this has no current effect.
