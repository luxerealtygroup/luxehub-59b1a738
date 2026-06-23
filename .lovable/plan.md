## 2026 Closings Calendar — Audit Findings

Scope: `src/hooks/useFubClosingsCalendar.ts`, `src/components/admin/ClosingsCalendar.tsx`, and their dependencies (`follow-up-boss` edge function, `useFubDealMetrics`, `dealWeight`).

---

### 1. Data correctness

**🔴 Critical: duplicate deals from double pagination.**
The edge function `get_deals` already paginates server-side and returns ALL deals in a single response (`supabase/functions/follow-up-boss/index.ts:102-162`, safety cap 10 000). The client hook then loops up to 10 more pages of 100:

```ts
// useFubClosingsCalendar.ts:46-50
for (let page = 0; page < maxPages; page++) {
  const resp = await followUpBossApi.getDeals(pageSize, page * pageSize);
  ...
  if (resp.data.deals.length < pageSize) break;
}
```

Page 0 already returns e.g. 2 000 deals → length ≥ 100 → loop continues. Page 1 sends `offset=100`, edge function paginates from offset 100 and again returns all deals from 100 onward → those rows get appended a second time. The loop only stops once a page is < 100 deals (the tail). Net effect: deals from offset 100 onward are duplicated, often many times over.

Same bug exists in `useFubDealMetrics.ts:222-228`. Fix in both places: drop the client loop and just do a single `getDeals(100, 0)` call (server returns the full set), or pass `all: false` and paginate yourself.

**🟡 `projectedCloseDate` fallback for closed deals.**
`resolveCloseDate` uses `closedDate → closeDate → projectedCloseDate`. For a stage-classified-closed deal that's missing `closedDate`/`closeDate`, this can pull a *projected* (often past or stale) date into the 2026 grid. Matches `useFubDealMetrics` precedence so it's intentional, but worth surfacing in the popover (already shown via `dateSource` — good).

**🟢 Stage filter.** `classifyStage(d.stageName) === 'closed'` correctly excludes pending/conditional. `CLOSED_STAGES = ['closed','won','sold','settled','completed']` is consistent with the rest of the app.

**🟢 Date range filter.** `.slice(0,10)` on date strings handles ISO timestamps cleanly; lexicographic comparison against `2026-01-01` / `2026-12-31` is safe for YYYY-MM-DD.

---

### 2. Lease weighting & totals

**🟢 Weight math is correct.** Footer totals call `sumWeightedDeals(monthDeals, dealMetadataMap)` — sales = 1.0, leases = 0.333, consistent with `LEASE_WEIGHT = 1/3`. `weight_override` from `deal_metadata` is honored via `getDealWeight`.

**🟢 Metadata map adapter is fine.** The component strips `DealMetadataRow` down to `{ deal_category, weight_override }` — that's exactly what `inferDealCategory` / `getDealWeight` consume.

**🟡 Category inferred twice.** Hook computes `entry.category` once via `inferDealCategory`, but the footer's `sumWeightedDeals` re-infers from the raw deal. They agree today, but if you ever set `entry.category` from a different source you'd get drift. Minor — could pass `entry.category` straight to a weight reducer instead.

**🟡 Price heuristic ($4 000 threshold).** `inferDealCategory` flags any deal under $4 000 as a lease (`dealWeight.ts:80-83`). For a *closed* deal that's missing all lease keywords, an unusually small commission-only or referral deal could be miscategorized as a lease. Same behavior as Dashboard/Pipeline, so consistent, but worth being aware of when validating totals.

**🟢 Sales / Leases counts** in the footer derive from `entry.category`, which is set from `inferDealCategory(d, dealMetadataMap)` — admin manual overrides via `deal_metadata` take precedence. Good.

---

### 3. Agent attribution

**🟡 `users[0]` is arbitrary.** FUB returns `deal.users` as an array; the first entry isn't guaranteed to be the primary/listing agent (could be a co-list or partner). For multi-agent deals you'll attribute GCI to whichever user FUB returned first.

**🔴 Inconsistent fallback for unassigned deals.**
```ts
const user = Array.isArray(d.users) && d.users.length > 0 ? d.users[0] : null;
...
agentFubUserId: user?.id ?? d.assignedUserId ?? d.userId ?? null,
agentName: user?.name || 'Unassigned',
```
If `users` is empty but `assignedUserId` is set, the chip shows "Unassigned" while `agentFubUserId` resolves to a real user. The name should fall back to a lookup against the agent map (or at minimum say `Agent #${id}` so admins can find them).

**🟡 No `assignedUserId`/`userId` agent name resolution.** The hook never looks up `profiles` by `fub_user_id`, so the chip can't render the firm's display name when FUB returns only the numeric `assignedUserId`. (`AdminDashboard` already loads agent profiles — passing an `agentEmailByFubId` / `agentNameByFubId` map to the calendar would close the gap and was in the original plan but isn't wired up.)

**🟢 View-as-Agent.** The edge function honors `x-view-as-user-id` only for picking the FUB API key (primary vs secondary), not for filtering deals — so a View-as-Agent session still sees the full company calendar. That matches Admin Dashboard intent; just confirming nothing scopes it down unexpectedly.

---

### Recommended fixes (priority order)

1. **Stop double-paginating** in `useFubClosingsCalendar` and `useFubDealMetrics`. Single `getDeals(100, 0)` call. This is causing inflated counts and GCI.
2. **Resolve agent name from `assignedUserId`/`userId`** when `users` is empty — accept an optional `agentNameByFubId` map from `AdminDashboard` (which already has it).
3. (Optional) De-dupe `users[]` selection — prefer the user whose `id === assignedUserId` when present, falling back to `users[0]`.
4. (Optional) Document/expose the $4 000 price heuristic in the popover ("Type: lease (inferred from price)") so admins know when to override via `deal_metadata`.

No schema changes required. Items 1 and 2 are the only behavior fixes worth doing now; the rest are quality-of-life.
