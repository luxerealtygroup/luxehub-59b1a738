# 2026 Closings Calendar — Admin Dashboard

Add a month-grid calendar to `src/components/AdminDashboard.tsx` that plots every FUB deal closed in 2026, day-by-day, across all agents.

## Data source
- FUB deals only (no manual or pipeline_clients data).
- Stage filter: closed only (`classifyStage(stageName) === 'closed'`).
- Date field: `deal.closedDate || deal.closeDate || deal.projectedCloseDate` (same precedence as `getCloseDate` in `useFubDealMetrics.ts`). Only include deals whose resolved date falls within `2026-01-01..2026-12-31`.
- Agent label: first entry of `deal.users[]` → `name`. Resolve email via `profiles.fub_user_id → email` lookup already loaded by `AdminDashboard`.
- GCI per deal: `commissionValue ?? agentCommission ?? 0` (matches `getDealGci`).

## UI
- New section on the Admin Dashboard titled "2026 Closings Calendar", placed below the existing company metrics cards.
- Month selector (Jan–Dec 2026) with prev/next chevrons; defaults to current month if inside 2026, else January.
- 7-column month grid (Sun–Sat header), one cell per day:
  - Day number top-left.
  - Up to 3 deal chips per cell showing agent first name + GCI (e.g. "Sara · $12k"). Sale = primary color chip, lease = muted chip (use `inferDealCategory` from `dealWeight.ts`).
  - "+N more" chip when overflow.
- Each chip is a popover/tooltip showing: deal name, full agent name, stage, price, GCI, resolved close date, source of date field (closedDate vs projectedCloseDate).
- Footer row under the grid: month totals — # deals (weighted), sales count, lease count, total GCI.
- Empty days render dimmed; days outside the selected month render disabled.

## Implementation
1. **New hook** `src/hooks/useFubClosingsCalendar.ts`:
   - Input: `{ year: number }`.
   - Internally calls `followUpBossApi.getDeals` paginated (same loop as `useFubDealMetrics`, up to 10 pages of 100).
   - Returns `{ deals: ClosingEntry[], loading, refetch }` where `ClosingEntry = { id, date: string (YYYY-MM-DD), dateSource: 'closedDate'|'closeDate'|'projectedCloseDate', agentFubUserId, agentName, stageName, price, gci, category: 'sale'|'lease' }`.
   - Filters to closed stage + date inside the year. No per-agent restriction (admin view).
2. **New component** `src/components/admin/ClosingsCalendar.tsx`:
   - Props: `{ year: number; agentEmailByFubId?: Record<number, string> }`.
   - Uses `useFubClosingsCalendar({ year })` and `useDealMetadata()` (already used elsewhere) to pass `dealMetadataMap` into `inferDealCategory` for sale/lease classification.
   - Local state: `selectedMonth` (0–11).
   - Renders the month grid using plain CSS grid + Tailwind tokens, shadcn `Popover` for chip details, `Button` for month nav.
   - Memoize `dealsByDay: Map<string, ClosingEntry[]>` keyed by `YYYY-MM-DD`.
3. **Integrate into `AdminDashboard.tsx`**:
   - Import and render `<ClosingsCalendar year={2026} agentEmailByFubId={...} />` after the existing KPI cards.
   - Pass through the `fub_user_id → email` map already built for the agent table.

## Design tokens
Use existing semantic tokens (`bg-card`, `border-border`, `text-muted-foreground`, `bg-primary/10`, etc.). Sale chip = `bg-primary/15 text-primary`, lease chip = `bg-muted text-muted-foreground`. Today's cell gets `ring-1 ring-primary`.

## Out of scope
- No schema changes.
- No drag/drop or editing.
- No pending/conditional deals on the calendar (separate request if needed later).
- No iCal export.
