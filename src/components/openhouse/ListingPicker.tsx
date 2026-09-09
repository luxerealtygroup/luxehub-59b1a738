import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Home, Loader2, Plus, Trash2 } from 'lucide-react';
import { followUpBossApi, FUBDeal } from '@/lib/api/followUpBoss';
import { isActiveListingDeal } from '@/hooks/useFubDealMetrics';
import { ReportListing, money } from '@/lib/openHouse/reports';

/**
 * Pick a few listings to show on a report — either from our own active listings
 * or typed in by hand, so a report is useful even without a search-site link.
 */
export function ListingPicker({
  value,
  onChange,
  max = 6,
  saving,
}: {
  value: ReportListing[];
  onChange: (next: ReportListing[]) => void;
  max?: number;
  saving?: boolean;
}) {
  const [active, setActive] = useState<FUBDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [manual, setManual] = useState({ address: '', price: '', photo_url: '', link: '' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await followUpBossApi.getDeals(200, 0);
        const deals: FUBDeal[] = res.success && res.data?.deals ? res.data.deals : [];
        if (!cancelled) setActive(deals.filter(isActiveListingDeal));
      } catch {
        if (!cancelled) setActive([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const add = (listing: ReportListing) => {
    if (value.length >= max) return;
    if (value.some((l) => l.address.toLowerCase() === listing.address.toLowerCase())) return;
    onChange([...value, listing]);
  };

  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-4">
      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((l, i) => (
            <Card key={`${l.address}-${i}`} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{l.address}</p>
                <p className="text-xs text-muted-foreground">{money(l.price)}</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(i)} aria-label="Remove listing">
                <Trash2 className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          From our active listings
        </p>
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : active.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active listings found — add one by hand below.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {active.slice(0, 20).map((d) => (
              <button
                key={d.id}
                type="button"
                disabled={value.length >= max}
                onClick={() => add({
                  address: d.name || 'Listing',
                  price: typeof d.price === 'number' ? d.price : null,
                  photo_url: null,
                  link: null,
                })}
                className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:border-gold/60 disabled:opacity-50"
              >
                <Home className="h-3.5 w-3.5 text-gold" />
                <span className="max-w-[220px] truncate">{d.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2 rounded-lg border border-border p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Add one by hand</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Address</Label>
            <Input value={manual.address} onChange={(e) => setManual({ ...manual, address: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Price</Label>
            <Input inputMode="numeric" value={manual.price} onChange={(e) => setManual({ ...manual, price: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Photo link</Label>
            <Input value={manual.photo_url} onChange={(e) => setManual({ ...manual, photo_url: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Listing link</Label>
            <Input value={manual.link} onChange={(e) => setManual({ ...manual, link: e.target.value })} />
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!manual.address.trim() || value.length >= max}
          onClick={() => {
            add({
              address: manual.address.trim(),
              price: manual.price ? Number(manual.price.replace(/[^\d.]/g, '')) || null : null,
              photo_url: manual.photo_url.trim() || null,
              link: manual.link.trim() || null,
            });
            setManual({ address: '', price: '', photo_url: '', link: '' });
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" /> Add listing
        </Button>
      </div>

      {saving && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Saving…
        </p>
      )}
    </div>
  );
}
