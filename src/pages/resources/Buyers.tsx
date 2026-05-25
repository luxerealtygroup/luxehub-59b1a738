import { ExternalLink, FileText, Wand2, ListChecks } from 'lucide-react';
import { Card } from '@/components/ui/card';

const docs = [
  {
    title: 'Ontario 303 – Buyer Representation Agreement',
    desc: 'LUXE Schedule A – Buyer Representation Agreement.',
    href: '/resources/buyers/Ontario-303-Buyer-Representation-Agreement.pdf',
  },
  {
    title: 'Schedule A – Buyer (DOCX)',
    desc: 'Editable Word version of Schedule A for buyers.',
    href: '/resources/buyers/Schedule-A-Buyer.docx',
  },
  {
    title: 'Schedule B1 (PDF)',
    desc: 'Schedule B1 for buyer transactions.',
    href: '/resources/buyers/Schedule-B1.pdf',
  },
];

const links = [
  {
    title: 'Clause Generator',
    desc: 'Ontario eXp Transaction Guide clause generator.',
    href: 'https://exptransactionguide.com/ON/clause-generator',
    icon: Wand2,
  },
  {
    title: 'Transaction Checklists',
    desc: 'Ontario eXp Transaction Guide checklists.',
    href: 'https://exptransactionguide.com/ON/transaction-checklists',
    icon: ListChecks,
  },
];

export default function BuyersResources() {
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Buyers Resources</h1>
        <p className="text-sm text-muted-foreground mt-1">Materials and schedules for buyer representation.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {docs.map((d) => (
          <a key={d.href} href={d.href} target="_blank" rel="noopener noreferrer" className="group">
            <Card className="p-5 h-full border-gold/20 hover:border-gold/60 hover:bg-gold/5 transition-colors">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-gold" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-foreground">{d.title}</h3>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-gold" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{d.desc}</p>
                </div>
              </div>
            </Card>
          </a>
        ))}
        {links.map((d) => (
          <a key={d.href} href={d.href} target="_blank" rel="noopener noreferrer" className="group">
            <Card className="p-5 h-full border-gold/20 hover:border-gold/60 hover:bg-gold/5 transition-colors">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                  <d.icon className="h-5 w-5 text-gold" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-foreground">{d.title}</h3>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-gold" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{d.desc}</p>
                </div>
              </div>
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
}