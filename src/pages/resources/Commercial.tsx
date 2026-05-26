import { FileText, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function CommercialResources() {
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Commercial Resources</h1>
        <p className="text-sm text-muted-foreground mt-1">Tools and materials for commercial clients.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <a
          href="/resources/commercial/ontario-547-tenant-representation-schedule.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="group"
        >
          <Card className="p-5 h-full border-gold/20 hover:border-gold/60 hover:bg-gold/5 transition-colors">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-foreground">Form 547 — Tenant Representation Schedule</h3>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-gold" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Ontario commercial tenant representation agreement schedule (PDF).
                </p>
              </div>
            </div>
          </Card>
        </a>
        <a
          href="/resources/commercial/ontario-594-listing-agreement-landlord.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="group"
        >
          <Card className="p-5 h-full border-gold/20 hover:border-gold/60 hover:bg-gold/5 transition-colors">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-foreground">Form 594 — Listing Agreement (Landlord)</h3>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-gold" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Ontario commercial listing agreement — landlord designated representation (PDF).
                </p>
              </div>
            </div>
          </Card>
        </a>
      </div>
    </div>
  );
}