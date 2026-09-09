# Open house reports: seller recap and buyer "Homes like this one"

Two shareable, printable, LUXE-branded report pages reachable from an open house's detail
page in the Open House Tracker. Nothing outside the tracker changes.

## 1. Seller report

- Appears on the detail page automatically once the open house's end time has passed
  (before that, a muted line says it unlocks when the open house ends).
- Public link `/oh/report/:slug` — no login, printable, safe to forward to a seller.
- Contents, all aggregate:
  - visitors through the door (one number, the unified guest count)
  - how many were already working with an agent
  - how many need to sell before they can buy
  - how many have spoken to a lender
  - the hot / warm / cold mix
  - price feedback themes and condition feedback themes, counted from the guest rows
  - doors knocked in the neighbourhood (from the prep checklist)
  - the hand-logged notes already on the open house
- **Privacy line:** no visitor name, phone or email is ever loaded into or rendered on
  this page. The database function behind it returns counts only — the names are not
  merely hidden in the UI, they never leave the server.
- "What you're competing with": the agent picks a few listings to show alongside — from
  their own active listings, or added by hand (address, price, photo link, listing link).
- "Send to seller" opens the agent's own email app with the report link and a short
  pre-written note. No email service, no cost.

## 2. Buyer report — "Homes like this one"

- One per guest, opened on demand from that guest's row. Public link
  `/oh/homes/:guestToken`, printable, branded.
- Shows the home they visited (photo, address, price), then the main event: a large
  **See more homes like this** button that deep-links into the Ylopo search site,
  pre-filtered to the price range, city and bedrooms implied by what the guest told us.
- The search link comes from a template an admin sets, not from code. One field, with
  the placeholders `{minPrice}` `{maxPrice}` `{beds}` `{city}`, validated as https and
  stored as an app setting. Until it is set the button is hidden entirely rather than
  broken, and the settings area tells the admin the buyer report is waiting on it.
- The agent can also hand-pick two or three specific listings to feature on that guest's
  report — chosen from active listings or typed in manually — so the report is worth
  sending even before the Ylopo template exists.
- The guest's Text and Email follow-up buttons now include that guest's buyer report link
  in the pre-written message.

## Technical notes

**Migration**
- `open_houses.competing_listings jsonb default '[]'` — the seller report's picked listings.
- `open_house_visitors.featured_listings jsonb default '[]'` — the buyer report's picked listings.
- `open_house_visitors.report_token text unique` — unguessable id for the public buyer link,
  backfilled for existing rows and defaulted for new ones.
- New security-definer functions, both `SECURITY DEFINER ... SET search_path = public`,
  granted to `anon` and `authenticated`:
  - `public_open_house_seller_report(_slug text)` — returns the open house header, the
    aggregate counts, feedback tallies, doors knocked, notes, competing listings. It
    selects no identifying visitor column at all.
  - `public_open_house_buyer_report(_token text)` — returns the visited home, the guest's
    first name only, their price/city/bed hints and featured listings.
- Both refuse to return anything for an open house that is not active/found.

**Files**
- `src/lib/openHouse/reports.ts` (new) — report types, feedback tallies, the Ylopo
  template fill (`{minPrice}` `{maxPrice}` `{beds}` `{city}`) and https validation,
  buyer-report URL helper, app-setting keys.
- `src/pages/openhouse/SellerReport.tsx` (new) — public seller page + print styles.
- `src/pages/openhouse/BuyerReport.tsx` (new) — public buyer page + print styles.
- `src/components/openhouse/ListingPicker.tsx` (new) — shared picker: choose from active
  listings (same FUB source as the dashboard's Active Listings card) or add manually.
- `src/components/openhouse/SellerReportSection.tsx` (new) — the detail-page block:
  unlock state, link/copy, print, competing-listings picker, Send to seller.
- `src/components/openhouse/GuestCard.tsx` — buyer report link on the row; Text/Email
  messages carry it.
- `src/lib/openHouse/guests.ts` — `{report_link}` placeholder in the follow-up templates.
- `src/components/openhouse/GuestList.tsx` — mention the new placeholder in the wording
  dialog; pass the report link down.
- `src/pages/MyOpenHouse.tsx` — render the seller report section on the detail page.
- `src/App.tsx` — the two public routes.
- Ylopo template field added to the existing admin settings surface for open houses.

**Not touched:** the 4-1-1, the Practice tab, the client portal, the public sign-in form,
kiosk mode, the offline queue and the QR codes.
