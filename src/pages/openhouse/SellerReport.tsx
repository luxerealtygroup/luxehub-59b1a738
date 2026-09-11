import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Printer } from 'lucide-react';
import { tenant } from '@/config/tenant';
import { CONDITION_LABEL, PRICE_LABEL } from '@/lib/openHouse/guests';
import { SellerReport as Report, money } from '@/lib/openHouse/reports';

/**
 * The seller's recap of their own open house. Aggregate only — the function
 * behind this page never returns a visitor's name, phone or email.
 */
export default function SellerReport() {
  const { slug = '' } = useParams();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    supabase.rpc('public_open_house_seller_report', { _slug: slug }).then(({ data }) => {
      if (!alive) return;
      const row = Array.isArray(data) ? (data[0] as any) : null;
      setReport(row ?? null);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [slug]);

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
          <h1 className="mt-4 font-display text-2xl font-semibold">This report isn't available</h1>
          <p className="mt-2 text-muted-foreground">The link may have changed. Ask your agent for a fresh one.</p>
        </div>
      </div>
    );
  }

  const date = report.starts_at ? new Date(report.starts_at).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }) : null;

  const priceThemes = Object.entries(report.price_feedback || {});
  const conditionThemes = Object.entries(report.condition_feedback || {});

  return (
    <div className="min-h-screen bg-background px-5 py-10 print:py-0">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <header className="text-center">
          <p className="text-xs uppercase tracking-[0.28em] text-gold">{tenant.brokerageName}</p>
          <h1 className="mt-3 font-display text-3xl font-semibold">Your open house report</h1>
          <p className="mt-2 text-lg text-foreground">{report.address}{report.city ? `, ${report.city}` : ''}</p>
          <p className="text-muted-foreground">
            {[date, report.list_price ? money(report.list_price) : null].filter(Boolean).join(' · ')}
          </p>
        </header>

        {report.cover_photo_url && (
          <img
            src={report.cover_photo_url}
            alt={report.address}
            className="w-full rounded-xl border border-border object-cover"
            style={{ maxHeight: 360 }}
          />
        )}

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Visitors through the door" value={report.visitors} />
          <Stat label="Already have an agent" value={report.with_agent} />
          <Stat label="Need to sell first" value={report.home_to_sell} />
          <Stat label="Spoken to a lender" value={report.spoken_to_lender} />
        </section>

        <section className="rounded-xl border border-border p-5">
          <h2 className="font-display text-lg font-semibold">How interested they were</h2>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Stat label="Hot" value={report.hot} />
            <Stat label="Warm" value={report.warm} />
            <Stat label="Cold" value={report.cold} />
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <ThemeCard
            title="What they said about the price"
            themes={priceThemes.map(([k, c]) => [PRICE_LABEL[k as keyof typeof PRICE_LABEL] || k, c])}
          />
          <ThemeCard
            title="What they said about the home"
            themes={conditionThemes.map(([k, c]) => [CONDITION_LABEL[k as keyof typeof CONDITION_LABEL] || k, c])}
          />
        </section>

        <section className="rounded-xl border border-border p-5">
          <h2 className="font-display text-lg font-semibold">Work in the neighbourhood</h2>
          <p className="mt-2 text-muted-foreground">
            {report.doors_knocked != null
              ? `${report.doors_knocked} doors knocked around the home to invite the neighbours.`
              : 'No door knocking recorded for this open house.'}
          </p>
        </section>

        {report.notes && (
          <section className="rounded-xl border border-border p-5">
            <h2 className="font-display text-lg font-semibold">Notes from the day</h2>
            <p className="mt-2 whitespace-pre-wrap text-foreground">{report.notes}</p>
          </section>
        )}

        <footer className="border-t border-border pt-6 text-center text-sm text-muted-foreground">
          {report.hosting_agent_name && <p className="text-foreground">Hosted by {report.hosting_agent_name}</p>}
          {report.hosting_agent_email && <p>{report.hosting_agent_email}</p>}
          <p className="mt-2">Visitor details are kept private — this report shows totals only.</p>
          <button
            type="button"
            onClick={() => window.print()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-foreground print:hidden"
          >
            <Printer className="h-4 w-4" /> Print this report
          </button>
        </footer>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border p-4 text-center">
      <p className="font-display text-3xl font-semibold text-gold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ThemeCard({ title, themes }: { title: string; themes: [string, number][] }) {
  return (
    <div className="rounded-xl border border-border p-5">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {themes.length === 0 ? (
        <p className="mt-2 text-muted-foreground">Nothing recorded.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {themes.sort((a, b) => b[1] - a[1]).map(([label, count]) => (
            <li key={label} className="flex items-center justify-between text-sm">
              <span>{label}</span>
              <span className="font-semibold text-gold">{count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
