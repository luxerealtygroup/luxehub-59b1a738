import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useLaunchpadModule,
  useLaunchpadModules,
  useLaunchpadProfile,
  useModuleSlides,
  useRecordSlideProgress,
  useSlideProgress,
  type LaunchpadTrack,
} from '@/hooks/useLaunchpad';
import { SlideFrame } from '@/components/launchpad/SlideFrame';
import { SlideNav } from '@/components/launchpad/SlideNav';
import { useUserRole } from '@/hooks/useUserRole';
import { tenant } from '@/config/tenant';

const LaunchpadModule = () => {
  const { moduleId, slideNumber } = useParams<{ moduleId: string; slideNumber: string }>();
  const navigate = useNavigate();
  const { isAdmin, isOwner } = useUserRole();


  const { data: module, isLoading: moduleLoading } = useLaunchpadModule(moduleId);
  const { data: slides = [], isLoading: slidesLoading } = useModuleSlides(moduleId);
  const { data: completedIds = [] } = useSlideProgress(moduleId);
  const { data: profile } = useLaunchpadProfile();
  const recordProgress = useRecordSlideProgress();

  const track = (profile?.launchpad_track as LaunchpadTrack | null) ?? (isAdmin || isOwner ? 'junior' : null);
  const { data: trackModules = [] } = useLaunchpadModules(track);

  // Total always comes from the fetched slide rows, so any slide count works.
  const total = slides.length;
  const parsed = Number(slideNumber);
  const current = Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, Math.max(total, 1)) : 1;
  const index = current - 1;
  const slide = slides[index];
  const isLast = total > 0 && index === total - 1;

  const completedSet = useMemo(() => new Set(completedIds), [completedIds]);

  const nextModule = useMemo(() => {
    if (!module) return null;
    const i = trackModules.findIndex((m) => m.id === module.id);
    return i >= 0 && i < trackModules.length - 1 ? trackModules[i + 1] : null;
  }, [module, trackModules]);

  // Keep the URL within bounds if it points past the end.
  useEffect(() => {
    if (total > 0 && parsed > total) {
      navigate(`/dashboard/launchpad/${moduleId}/${total}`, { replace: true });
    }
  }, [total, parsed, moduleId, navigate]);

  const goTo = useCallback(
    (n: number) => navigate(`/dashboard/launchpad/${moduleId}/${n}`),
    [moduleId, navigate],
  );

  const handleNext = useCallback(async () => {
    if (!slide || !moduleId) return;
    try {
      await recordProgress.mutateAsync({
        moduleId,
        slideId: slide.id,
        slideNumber: current,
        isLastSlide: isLast,
      });
    } catch (e: any) {
      toast.error(e?.message || 'Could not save your progress');
      return;
    }

    if (!isLast) {
      goTo(current + 1);
      return;
    }

    if (nextModule) {
      toast.success(`Module complete. Next up: ${nextModule.title}`, {
        action: {
          label: 'Next module',
          onClick: () => navigate(`/dashboard/launchpad/${nextModule.id}/1`),
        },
      });
    } else {
      toast.success('Module complete. That was the last module in your track.');
    }
    navigate('/dashboard/launchpad');
  }, [slide, moduleId, recordProgress, current, isLast, goTo, nextModule, navigate]);

  const handleBack = useCallback(() => {
    if (current > 1) goTo(current - 1);
  }, [current, goTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handleBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleNext, handleBack]);

  useEffect(() => {
    if (module && slide) {
      document.title = `${current}/${total} — ${module.title} | Launchpad`;
    }
    return () => {
      document.title = tenant.appName;
    };
  }, [module, slide, current, total]);

  if (moduleLoading || slidesLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!module || total === 0 || !slide) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/dashboard/launchpad')}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to Launchpad
        </Button>
        <p className="text-muted-foreground">This module has no slides yet.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/launchpad')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">Module {module.module_number}</span>
            {module.kind === 'reference' ? (
              <Badge variant="outline" className="text-[10px]">Reference</Badge>
            ) : null}
          </div>
          <h1 className="truncate font-display text-2xl font-bold text-foreground">{module.title}</h1>
        </div>
      </div>

      <SlideFrame slide={slide} />

      <SlideNav
        current={current}
        total={total}
        completedCount={completedSet.size}
        completedIds={completedSet}
        slideIds={slides.map((s) => s.id)}
        onJump={goTo}
        onBack={handleBack}
        onNext={handleNext}
        isLast={isLast}
      />
    </div>
  );
};

export default LaunchpadModule;