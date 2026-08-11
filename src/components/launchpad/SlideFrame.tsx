import { Badge } from '@/components/ui/badge';
import { ClipboardCheck, FileText, GraduationCap } from 'lucide-react';
import type { LaunchpadSlide } from '@/hooks/useLaunchpad';

const typeMeta = {
  content: { label: 'Content', Icon: FileText },
  practice_assignment: { label: 'Practice Assignment', Icon: ClipboardCheck },
  knowledge_check: { label: 'Knowledge Check', Icon: GraduationCap },
} as const;

export function SlideFrame({ slide }: { slide: LaunchpadSlide }) {
  const meta = typeMeta[slide.slide_type] ?? typeMeta.content;
  const { Icon } = meta;
  const hasBody = !!slide.body?.trim();

  return (
    <div className="flex min-h-[420px] flex-col rounded-xl border border-gold/20 bg-gradient-to-br from-card to-gold/5 p-8 md:min-h-[520px] md:p-12">
      <Badge variant="outline" className="mb-4 w-fit gap-1.5 text-[10px]">
        <Icon className="h-3 w-3" /> {meta.label}
      </Badge>
      <h2 className="font-display text-2xl font-bold text-foreground md:text-3xl">{slide.title}</h2>
      <div className="mt-6 flex-1">
        {hasBody ? (
          <div className="whitespace-pre-wrap text-base leading-relaxed text-foreground/90">
            {slide.body}
          </div>
        ) : (
          <div className="flex h-full min-h-[200px] items-center justify-center rounded-lg border border-dashed border-muted-foreground/25 bg-muted/10">
            <p className="text-sm text-muted-foreground">Content coming soon</p>
          </div>
        )}
      </div>
    </div>
  );
}