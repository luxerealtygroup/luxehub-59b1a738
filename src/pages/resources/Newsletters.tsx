import { ExternalLink, Newspaper } from 'lucide-react';
import { Card } from '@/components/ui/card';

const newsletters = [
  {
    region: 'Hamilton Region',
    url: 'https://simplebooklet.com/marketreporthamiltonregion',
    description: 'Market report for the Hamilton Region.',
  },
  {
    region: 'Norfolk County',
    url: 'https://simplebooklet.com/marketreportnorfolkcounty',
    description: 'Market report for Norfolk County.',
  },
  {
    region: 'Waterloo Region',
    url: 'https://simplebooklet.com/marketreportwaterlooregion',
    description: 'Market report for the Waterloo Region.',
  },
];

export default function NewslettersResources() {
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Newsletters</h1>
        <p className="text-sm text-muted-foreground mt-1">Regional market reports and newsletters.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {newsletters.map((n) => (
          <a
            key={n.region}
            href={n.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group"
          >
            <Card className="p-5 h-full border-gold/20 hover:border-gold/60 hover:bg-gold/5 transition-colors">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                  <Newspaper className="h-5 w-5 text-gold" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-foreground">{n.region}</h3>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-gold" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{n.description}</p>
                </div>
              </div>
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
}