import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen, CheckCircle2, FileStack, Layers } from 'lucide-react';
import { ProgressRing } from './ProgressRing';
import type { LaunchpadModule, ModuleStatus } from '@/hooks/useLaunchpad';

interface ModuleCardProps {
  module: LaunchpadModule & { slide_count: number };
  completedSlides: number;
  status: ModuleStatus;
  resumeSlide: number;
}

const statusLabel: Record<ModuleStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Complete',
};

export function ModuleCard({ module, completedSlides, status, resumeSlide }: ModuleCardProps) {
  const navigate = useNavigate();
  const isReference = module.kind === 'reference';

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/dashboard/launchpad/${module.id}/${Math.max(1, resumeSlide)}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/dashboard/launchpad/${module.id}/${Math.max(1, resumeSlide)}`);
        }
      }}
      className={`cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg ${
        isReference
          ? 'border-dashed border-muted-foreground/30 bg-muted/20'
          : 'border-gold/20 bg-gradient-to-br from-card to-gold/5 hover:border-gold/50'
      }`}
    >
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-xs font-mono text-muted-foreground">
                Module {module.module_number}
              </span>
              {isReference ? (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <FileStack className="h-3 w-3" /> Reference
                </Badge>
              ) : null}
              {status === 'completed' ? (
                <Badge variant="outline" className="gap-1 border-green-500/40 text-green-600 text-[10px]">
                  <CheckCircle2 className="h-3 w-3" /> {statusLabel[status]}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">{statusLabel[status]}</Badge>
              )}
            </div>
            <h3 className="font-display font-semibold text-foreground truncate">{module.title}</h3>
            {module.subtitle ? (
              <p className="text-xs text-muted-foreground truncate">{module.subtitle}</p>
            ) : null}
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              {isReference ? <Layers className="h-3.5 w-3.5" /> : <BookOpen className="h-3.5 w-3.5" />}
              {module.slide_count} {module.slide_count === 1 ? 'slide' : 'slides'}
            </p>
          </div>
          <ProgressRing value={completedSlides} total={module.slide_count} />
        </div>
      </CardContent>
    </Card>
  );
}