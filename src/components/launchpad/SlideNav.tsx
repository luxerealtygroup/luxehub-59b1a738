import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ChevronLeft, ChevronRight, Flag } from 'lucide-react';

interface SlideNavProps {
  current: number; // 1-based
  total: number;
  completedCount: number;
  completedIds: Set<string>;
  slideIds: string[];
  onJump: (slideNumber: number) => void;
  onBack: () => void;
  onNext: () => void;
  isLast: boolean;
}

export function SlideNav({
  current,
  total,
  completedCount,
  completedIds,
  slideIds,
  onJump,
  onBack,
  onNext,
  isLast,
}: SlideNavProps) {
  const pct = total > 0 ? (completedCount / total) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Slide {current} of {total}</span>
          <span>{completedCount} of {total} complete</span>
        </div>
        <Progress value={pct} className="h-2" />
      </div>

      {/* One marker per slide returned from the database — never a fixed count */}
      <div className="flex flex-wrap gap-1.5">
        {slideIds.map((id, i) => {
          const n = i + 1;
          const done = completedIds.has(id);
          return (
            <button
              key={id}
              type="button"
              aria-label={`Go to slide ${n}`}
              aria-current={n === current}
              onClick={() => onJump(n)}
              className={`h-2.5 rounded-full transition-all ${
                n === current
                  ? 'w-8 bg-gold'
                  : done
                    ? 'w-2.5 bg-gold/50 hover:bg-gold/70'
                    : 'w-2.5 bg-muted hover:bg-muted-foreground/40'
              }`}
            />
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={onBack} disabled={current <= 1}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <Button onClick={onNext}>
          {isLast ? (
            <>Finish module <Flag className="ml-1 h-4 w-4" /></>
          ) : (
            <>Next <ChevronRight className="ml-1 h-4 w-4" /></>
          )}
        </Button>
      </div>
    </div>
  );
}