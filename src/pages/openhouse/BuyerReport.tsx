import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Printer, Search } from 'lucide-react';
import { tenant } from '@/config/tenant';
import {
  BuyerReport as Report, asListings, fillSearchTemplate,
  isHttpsUrlTemplate, money, priceBand,
} from '@/lib/openHouse/reports';

/** "Homes like this one" — the page a visitor gets after an open house. */
export default function BuyerReport() {
  const { token = '' } = useParams();
  const [report, setReport] = useState<Report | null>(null);
  const [searchTemplate, setSearchTemplate] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.rpc('public_open_house_buyer_report', { _token: token });
      if (!alive) return;
      const row = Array.isArray(data) ? (data[0] as any) : null;
      setReport(row ? { ...row, featured_listings: asListings(row.featured_listings) } : null);
      setSearchTemplate(((row?.search_url_template as string) || '').trim());
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-gold">{tenant.brokerageName}</p>
          <h1 className="mt-4 font-display text-2xl font-semibold">This page isn't available</h1>
          <p className="mt-2 text-muted-foreground">Ask your agent for a fresh link.</p>
        </div>
      </div>
    );
  }

  const band = priceBand(report.list_price);
  const searchUrl = isHttpsUrlTemplate(searchTemplate)
    ? fillSearchTemplate(searchTemplate, {
        minPrice: band?.min ?? null,
        maxPrice: band?.max ?? null,
        beds: null,
        city: report.city,
      })
    : null;

  return (
    <div className="min-h-screen bg-background px-5 py-10 print:py-0">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        <header className="text-center">
          <p className="text-xs uppercase tracking-[0.28em] text-gold">{tenant.brokerageName}</p>
          <h1 className="mt-3 font-display text-3xl font-semibold">Homes like this one</h1>
          <p className="mt-2 text-muted-foreground">
            {report.first_name}, thanks for coming through — here's more in the same vein.
          </p>
        </header>

        <section className="overflow-hidden rounded-xl border border-border">
          {report.cover_photo_url && (
            <img src={report.cover_photo_url} alt={report.address} className="h-56 w-full object-cover" />
          )}
          <div className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">The home you visited</p>
            <p className="mt-1 text-lg font-medium">{report.address}{report.city ? `, ${report.city}` : ''}</p>
            <p className="text-muted-foreground">{money(report.list_price)}</p>
          </div>
        </section>

        {searchUrl && (
          <a
            href={searchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[64px] w-full items-center justify-center gap-3 rounded-xl bg-gold px-6 text-lg font-semibold text-background print:hidden"
          >
            <Search className="h-5 w-5" /> See more homes like this
          </a>
        )}

        {report.featured_listings.length > 0 && (
          <section className="space-y-4">
            <h2 className="font-display text-lg font-semibold">Hand-picked for you</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {report.featured_listings.map((l, i) => (
                <div key={`${l.address}-${i}`} className="overflow-hidden rounded-lg border border-border">
                  {l.photo_url && <img src={l.photo_url} alt={l.address} className="h-40 w-full object-cover" />}
                  <div className="p-3">
                    <p className="font-medium">{l.address}</p>
                    <p className="text-sm text-muted-foreground">{money(l.price)}</p>
                    {l.link && (
                      <a href={l.link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm text-gold underline">
                        View listing
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="border-t border-border pt-6 text-center text-sm text-muted-foreground">
          {report.hosting_agent_name && <p className="text-foreground">{report.hosting_agent_name}</p>}
          {report.hosting_agent_email && (
            <a href={`mailto:${report.hosting_agent_email}`} className="text-gold underline">
              {report.hosting_agent_email}
            </a>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-foreground print:hidden"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
        </footer>
      </div>
    </div>
  );
}
