# Fix: "Manage" button does nothing on Client Portals page

## Root cause (confirmed by reading `src/pages/AdminClientPortals.tsx`)

In the portals table, each row is wrapped like this:

```
<AgentPortalDialog trigger={
  <TableRow ...>
    ...cells...
    <TableCell>
      <Button onClick={(e) => e.stopPropagation()}>Manage</Button>
    </TableCell>
  </TableRow>
} />
```

Two problems combine to make the Manage button a silent no-op:

1. The dialog's open trigger is the whole `<TableRow>` (Radix `DialogTrigger asChild` forwards its click handler onto the `<tr>`).
2. The Manage `<Button>` explicitly calls `e.stopPropagation()` in its `onClick`, so its click never bubbles up to the `<tr>` — and the button has no other handler that opens the dialog. Result: clicking Manage does absolutely nothing, no dialog, no network, no console error.

Clicking elsewhere on the row *does* open the dialog today, but the user (correctly) expects the explicit Manage button to be the primary affordance, and it's broken.

There is also a secondary structural smell: wrapping a `<TableRow>` as the `DialogTrigger asChild` child means the `<tr>` becomes the interactive element and receives ARIA props like `aria-haspopup`/`aria-expanded`, which is not ideal for a table row.

## Fix

Restructure the row so the **Manage button is the dialog trigger**, and the row itself is a plain row (still styled for hover, but no longer the click target). This makes the affordance match what the user clicks, and removes the stopPropagation trap.

Edit `src/pages/AdminClientPortals.tsx` only:

- In the `filtered.map((r) => …)` render, replace the current `<AgentPortalDialog trigger={<TableRow …>…</TableRow>} />` structure with:
  - A normal `<TableRow key={r.id} className={…}>` (no cursor-pointer, no dialog wrapping).
  - Inside the last cell, render `<AgentPortalDialog … trigger={<Button size="sm" variant="outline" className="gap-2"><Settings/> Manage</Button>} />`.
  - Remove `onClick={(e) => e.stopPropagation()}` from the Manage button — no longer needed.
- Drop the `clickable` variable and the `cursor-pointer hover:bg-muted/40` classes that only made sense when the whole row was the trigger. Keep the health-tone background (`h.tone`) and `border-border/50` styling so the visual health cue is preserved.
- Leave all data fetching, filters, health scoring, and `AgentPortalDialog` internals unchanged.

## Verification

- Click Manage on a portal row → `AgentPortalDialog` opens with the correct client prefilled (name, email, FUB id, client type).
- Clicking anywhere else on the row no longer opens the dialog (intentional; the Manage button is now the single, obvious entry point).
- No other pages or components change.
