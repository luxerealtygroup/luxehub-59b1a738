import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import {
  ExternalLink,
  FileText,
  BookOpen,
  ClipboardList,
  Wand2,
  ListChecks,
  HelpCircle,
  Key,
  Newspaper,
  Inbox,
  LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  FileText,
  BookOpen,
  ClipboardList,
  Wand2,
  ListChecks,
  HelpCircle,
  Key,
  Newspaper,
};

interface OrgResource {
  id: string;
  category: string;
  title: string;
  description: string | null;
  href: string;
  icon: string;
  sort_order: number;
}

interface Props {
  category: 'listings' | 'buyers' | 'commercial' | 'tenants' | 'landlords' | 'newsletters';
  title: string;
  subtitle: string;
}

export function OrgResourceList({ category, title, subtitle }: Props) {
  const [items, setItems] = useState<OrgResource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('org_resources' as any)
        .select('*')
        .eq('category', category)
        .order('sort_order', { ascending: true });
      setItems(((data as unknown) as OrgResource[]) || []);
      setLoading(false);
    })();
  }, [category]);

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <Card className="p-8 border-dashed">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="font-display text-lg">Nothing here yet</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Your organization hasn't added any {category} resources yet. An admin can add links
              and documents so your team has one place to find them.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((d) => {
            const Icon = ICONS[d.icon] ?? FileText;
            return (
              <a
                key={d.id}
                href={d.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group"
              >
                <Card className="p-5 h-full border-gold/20 hover:border-gold/60 hover:bg-gold/5 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                      <Icon className="h-5 w-5 text-gold" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-foreground">{d.title}</h3>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-gold" />
                      </div>
                      {d.description && (
                        <p className="text-xs text-muted-foreground mt-1">{d.description}</p>
                      )}
                    </div>
                  </div>
                </Card>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}