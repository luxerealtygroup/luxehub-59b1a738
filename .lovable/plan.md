# Deal source capture and reporting — proposal

## 1. The tabs: not broken on the current build

I clicked all five tabs on the current preview build. Each one switches and renders:

- Performance — 2,852 characters
- Goal Coverage — 422
- Recruiting Need — 227
- Execution Plan — 216
- Deal Sources — 682 (empty-state, because there is no data — see below)

The "five panels, four with zero characters" you saw in the DOM is normal: the tab library
keeps empty placeholder panels for the inactive tabs and only fills the active one. So that
observation on its own does not indicate a fault. Clicking not switching on the live site is
consistent with the stale-bundle problem we fixed this week — the live site needs the new
build before it behaves like preview.

All four tabs are implemented, not placeholders:

- **Goal Coverage** — company goal vs the sum of agent goals, coverage %, deal gap, GCI gap,
  per-agent goal table, and the pipeline deficit work from today.
- **Recruiting Need** — deal gap ÷ average production per agent = agents needed, per month
  and per quarter.
- **Execution Plan** — recruiting targets plus a saved recruiting pipeline tracker.
- **Deal Sources** — a source breakdown with filters, per-source targets and an add dialog.
  It renders, but has nothing to show.

## 2. Are we capturing deal source today? Partly, and not where it matters

**On transactions: no.** There is a `deal_sources` table built for exactly this (source
category, deal type, status, GCI, close date, optional FUB deal link). It has **zero rows**.
Ten source categories were seeded for Luxe in March 2026 — Sphere/Past Clients, Referrals,
Open House, Online Leads, Social/Content, Farming, Cold Outreach, Agent-to-Agent Referral,
Walk-in/Sign Call, Other — and never used. The Deal Sources tab reads this table, which is
why it is blank. **Zero of our closed deals carry a source.**

**On client records: partly, and messily.** `pipeline_clients.source` is filled on about
two-thirds of records (69 of 189 blank). The values are free-form and inconsistent —
"sphere" 24 and "Sphere" 5, "referral" 16 and "Referral" 2, "Open House" vs "open_house",
plus one-offs like "FUB", "Facebook", "Website Lead". It is also on the client, not the deal,
so a couple who buys and sells produces two rows and no clean deal-level answer.

Closed deals themselves come from Follow Up Boss; `client_transactions` is empty and `deals`
holds 7 rows. So there is no local transaction record on which a source currently lives.

## 3. Proposed capture — one place, feeding both reports

**Where:** on the deal, keyed by the FUB deal id, in the existing `deal_sources` table
(extended, not replaced). The natural entry point is the same place an agent already works
with a deal — the pipeline client drawer / deal detail — plus a prompt when a deal moves into
a signed stage.

**Rules:**
- One source per deal, chosen from the tenant's own category list (categories are already
  per-tenant and editable, so each hub can run its own list).
- Optional free-text note for detail ("Ylopo", "Kristen's referral").
- Optional at first, then **required to mark a deal closed** — that is the point at which
  the answer is known and the data is worth having. Existing closed deals stay uncategorised
  and show as "Not recorded" rather than being guessed at.
- Defaults suggested, never applied silently: if the client record already has a source, the
  dialog pre-selects the matching category and the agent confirms.

**Starting list** — the ten already seeded are a sound real-estate list. I would add
*Repeat Client* as distinct from *Sphere*, and split *Online Leads* into named vendors
(Ylopo, Realtor.ca, Zillow-style) so spend can be judged per vendor.

**Backfill:** a one-off screen listing closed deals with no source, newest first, with the
client record's existing source offered as a suggestion. Agent confirms or corrects; nothing
auto-assigned.

**Both reports read the same rows:**
- Agent report — their own closings by source, units and GCI, with a cost-per-closing column
  if spend is entered.
- Company roll-up — the Deal Sources tab, same breakdown across the team, per-source targets
  already supported by `deal_source_targets`.

## 4. Size

- Database: additive only — link `deal_sources` to deals/clients by id, add tenant-scoped
  indexes. Small.
- Capture UI: one dialog reused in two places, plus the closing-stage prompt. Medium.
- Backfill screen: small.
- Agent report: medium — new section in agent reports.
- Company roll-up: mostly exists; needs wiring to real deals rather than manual entry.

Overall: a solid week of work, most of it in capture rather than reporting. Nothing here is
urgent for the App Store launch, and none of it should start before the freeze lifts.
