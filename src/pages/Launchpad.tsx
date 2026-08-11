import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Rocket, UserCog } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import {
  DAY_GROUPS,
  useAllSlideProgress,
  useLaunchpadModules,
  useLaunchpadProfile,
  useMenteeProgress,
  useModuleProgress,
  type LaunchpadTrack,
  type ModuleStatus,
} from '@/hooks/useLaunchpad';
import { ModuleCard } from '@/components/launchpad/ModuleCard';
import { MentorProgressTable } from '@/components/launchpad/MentorProgressTable';

const Launchpad = () => {
  const { isAdmin, isOwner } = useUserRole();
  const canPreview = isAdmin || isOwner;
  const { data: profile, isLoading: profileLoading } = useLaunchpadProfile();
  const [previewTrack, setPreviewTrack] = useState<LaunchpadTrack>('junior');

  const track: LaunchpadTrack | null =
    (profile?.launchpad_track as LaunchpadTrack | null) ?? (canPreview ? previewTrack : null);

  const { data: modules = [], isLoading: modulesLoading } = useLaunchpadModules(track);
  const { data: moduleProgress = [] } = useModuleProgress();
  const { data: slideCounts = {} } = useAllSlideProgress();
  const { data: mentees = [] } = useMenteeProgress(canPreview);

  const progressByModule = useMemo(() => {
    const map = new Map<string, { status: ModuleStatus; last: number }>();
    moduleProgress.forEach((p) => map.set(p.module_id, { status: p.status, last: p.last_slide_number }));
    return map;
  }, [moduleProgress]);

  const completedModules = modules.filter(
    (m) => progressByModule.get(m.id)?.status === 'completed',
  ).length;

  const showMentorTab = canPreview || mentees.length > 0;

  if (profileLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  const noTrack = !profile?.launchpad_track && !canPreview;

  const moduleGrid = (
    <div className="space-y-8">
      {DAY_GROUPS.map((group) => {
        const groupModules = modules.filter(
          (m) => m.day_range_start >= group.start && m.day_range_start <= group.end,
        );
        if (groupModules.length === 0) return null;
        return (
          <section key={group.label}>
            <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {groupModules.map((m) => {
                const p = progressByModule.get(m.id);
                return (
                  <ModuleCard
                    key={m.id}
                    module={m}
                    completedSlides={slideCounts[m.id] || 0}
                    status={p?.status || 'not_started'}
                    resumeSlide={p?.status === 'completed' ? 1 : p?.last || 1}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-gold/10 p-2">
            <Rocket className="h-6 w-6 text-gold" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold text-foreground">Launchpad</h1>
            <p className="text-muted-foreground">Your 90-day onboarding curriculum</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {track ? (
            <Badge variant="secondary" className="capitalize">{track} track</Badge>
          ) : null}
          {!noTrack ? (
            <span className="text-sm text-muted-foreground">
              {completedModules} of {modules.length} modules complete
            </span>
          ) : null}
        </div>
      </div>

      {canPreview && !profile?.launchpad_track ? (
        <Card className="border-gold/20">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <UserCog className="h-4 w-4 text-gold" />
            <span className="text-sm text-muted-foreground">
              You have no track assigned — previewing curriculum as:
            </span>
            {(['junior', 'associate'] as LaunchpadTrack[]).map((t) => (
              <Button
                key={t}
                size="sm"
                variant={previewTrack === t ? 'default' : 'outline'}
                onClick={() => setPreviewTrack(t)}
                className="capitalize"
              >
                {t}
              </Button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {noTrack ? (
        <Card className="border-gold/20">
          <CardContent className="py-12 text-center">
            <Rocket className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <h2 className="font-display text-lg font-semibold">No track assigned yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask an admin to assign your Launchpad track (Junior or Associate) to get started.
            </p>
          </CardContent>
        </Card>
      ) : modulesLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      ) : showMentorTab ? (
        <Tabs defaultValue="modules">
          <TabsList>
            <TabsTrigger value="modules">My modules</TabsTrigger>
            <TabsTrigger value="team">{canPreview ? 'Team progress' : 'My agents'}</TabsTrigger>
          </TabsList>
          <TabsContent value="modules" className="mt-6">{moduleGrid}</TabsContent>
          <TabsContent value="team" className="mt-6">
            <Card className="border-gold/20">
              <CardHeader>
                <CardTitle className="font-display text-gold">Launchpad progress</CardTitle>
              </CardHeader>
              <CardContent>
                <MentorProgressTable rows={mentees} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        moduleGrid
      )}
    </div>
  );
};

export default Launchpad;