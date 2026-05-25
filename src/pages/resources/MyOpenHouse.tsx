import { ExternalLink, DoorOpen } from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function MyOpenHouseResources() {
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">MyOpenHouse</h1>
        <p className="text-sm text-muted-foreground mt-1">Digital open house sign-in and lead capture.</p>
      </div>

      <a
        href="https://www.myopenhouse.ca/"
        target="_blank"
        rel="noopener noreferrer"
        className="group block"
      >
        <Card className="p-5 border-gold/20 hover:border-gold/60 hover:bg-gold/5 transition-colors">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
              <DoorOpen className="h-5 w-5 text-gold" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-foreground">Open MyOpenHouse</h3>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-gold" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Launch the MyOpenHouse platform to manage open house visitors and capture leads.
              </p>
            </div>
          </div>
        </Card>
      </a>
    </div>
  );
}