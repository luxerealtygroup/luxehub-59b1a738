# Abby's access — diagnosis and proposed fix

Nothing changed, nothing published. Findings below come from the live records.

## 1. What exists for marketing@luxerealtygroup.ca

| Row | State |
| --- | --- |
| Login account | Exists. Created today 2:55 PM Toronto, confirmed, last signed in 2:59 PM. |
| Profile record | Exists, but **empty**: no name, no email, **no team**. |
| Team membership | **Missing** — no team, no role. |
| Pending invitation | Exists: Luxe Realty Group, role admin, created 3:05 PM, expires Oct 1, never used, not revoked. |

Key detail on timing: she created her own account at **2:55 PM**, ten minutes **before** the invitation was created at 3:05 PM. So she signed up herself rather than arriving through the invitation link.

## 2. Why signing in did not consume the invitation

Signing in never consumes an invitation — by design. An invitation is only consumed when someone opens the invitation link (`/join?token=…`) and presses Accept.

Importantly, the acceptance flow **does** work for someone who already has an account: the join page detects an existing session and skips account creation, and the acceptance step attaches whoever is signed in to the invited team and grants the invited role. There is no check that blocks an existing account, and no email matching that could fail here.

So this is not a broken acceptance path. It is a delivery gap: **team invitations are not emailed.** They only produce a link that the inviting admin must copy and send. Abby never got that link, so she made her own account, which belongs to no team — hence the empty dashboard she is seeing.

## 3. Is she attached to another tenant?

No. Her profile has no team at all, and no stray organisation was created — the only organisations are Luxe Realty Group, Homes Into Reality, The Kirstine-Ellis Group, Roberto Real Estate, and one test org, none created today.

## 4. Proposed fix (not executed)

**Option A — no code, works now (recommended).** On the Team page, copy the invitation link for her pending invitation and send it to Abby. While signed in as herself, she opens it and presses Accept. That attaches her existing account to Luxe Realty Group, grants the invited role, marks the invitation used, and fills in her name. The team goes from 21 to 22. Reversible and uses the normal path.

**Option B — server-side attach.** If she cannot be reached with a link, run a one-off server-side attach that sets her team, grants the role, and marks the invitation used. Same end state as A, but it bypasses the audited flow, so A is preferable.

## 5. Which role

- **Admin** — full team management plus counted as a producing agent: she would appear in 4-1-1 accountability, goals, production rankings and coaching lists.
- **Operations** — the same reach inside the team for portals, transactions, dashboard and open houses, but deliberately excluded from 4-1-1, goals, production and rankings, and cannot manage owners or delete the team.

For creating and editing open houses on behalf of other agents, **either works** — open-house management is granted to any admin or owner in the team, and Operations inherits that. Since Abby is marketing staff and not a producing agent, **Operations** is the correct choice; it keeps her out of the agent accountability numbers.

Acting on this means revoking the pending admin invitation and issuing an Operations one, or attaching her with the Operations role directly.

## 6. The general fault

Three invitations are currently outstanding: Abby (Luxe, admin), Jeremy Ellis (The Kirstine-Ellis Group, owner), Roberto Carol (Roberto Real Estate, owner).

Only **one** — Abby's — is in the state you described, because she is the only one who already has a login account. Jeremy and Roberto have no accounts yet, so the normal link flow will work for them unaltered.

The underlying weakness is not that an existing account cannot accept; it is that **nothing tells a signed-in person that an invitation is waiting for their email address**, and team invitations are never emailed. Two additive improvements, for a later change (scope is frozen):

1. Email team invitations the way owner invitations are already emailed.
2. On sign-in, if the signed-in email has a valid unused invitation, show a banner offering to join that team in one click — which removes this failure mode permanently.
