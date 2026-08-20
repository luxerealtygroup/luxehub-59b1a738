import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type LaunchpadTrack = 'junior' | 'associate';
export type ModuleTrack = LaunchpadTrack | 'unified';
export type SlideType = 'content' | 'practice_assignment' | 'knowledge_check';
export type ModuleStatus = 'not_started' | 'in_progress' | 'completed';

export interface LaunchpadModule {
  id: string;
  module_number: number;
  title: string;
  subtitle: string | null;
  track: ModuleTrack;
  day_range_start: number;
  day_range_end: number;
  kind: 'module' | 'reference';
  has_practice_assignment: boolean;
  has_knowledge_check: boolean;
  sort_order: number;
}

export interface LaunchpadSlide {
  id: string;
  module_id: string;
  slide_number: number;
  title: string;
  slide_type: SlideType;
  body: string;
}

export interface LaunchpadSlideVersion {
  id: string;
  slide_id: string;
  module_id: string;
  slide_number: number;
  title: string;
  slide_type: string;
  body: string;
  changed_by: string | null;
  version_number: number;
  changed_at: string;
}

/** Prior versions of a single slide, newest first. Admin/owner review tool. */
export function useSlideVersions(slideId: string | undefined) {
  return useQuery({
    queryKey: ['launchpad-slide-versions', slideId],
    enabled: !!slideId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('launchpad_slide_versions')
        .select(
          'id, slide_id, module_id, slide_number, title, slide_type, body, changed_by, version_number, changed_at',
        )
        .eq('slide_id', slideId!)
        .order('version_number', { ascending: false });
      if (error) throw error;
      return (data || []) as LaunchpadSlideVersion[];
    },
  });
}

export interface ModuleProgressRow {
  module_id: string;
  user_id: string;
  status: ModuleStatus;
  last_slide_number: number;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export const DAY_GROUPS: { label: string; start: number; end: number }[] = [
  { label: 'Days 1-15', start: 1, end: 15 },
  { label: 'Days 16-45', start: 16, end: 45 },
  { label: 'Days 46-75', start: 46, end: 75 },
  { label: 'Days 76-90', start: 76, end: 90 },
];

/** The signed-in user's Launchpad profile fields. */
export function useLaunchpadProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['launchpad-profile', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, launchpad_track, mentor_id')
        .eq('id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        full_name: string | null;
        launchpad_track: LaunchpadTrack | null;
        mentor_id: string | null;
      } | null;
    },
  });
}

/**
 * Modules visible for a track (track-specific + unified), each with its real
 * slide count read from the database. Slide counts vary per module by design.
 */
export function useLaunchpadModules(track: LaunchpadTrack | null | undefined) {
  return useQuery({
    queryKey: ['launchpad-modules', track],
    enabled: !!track,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('launchpad_modules')
        .select('*, launchpad_slides(id)')
        .in('track', [track as string, 'unified'])
        .eq('is_published', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []).map((m: any) => ({
        ...(m as LaunchpadModule),
        slide_count: Array.isArray(m.launchpad_slides) ? m.launchpad_slides.length : 0,
      })) as (LaunchpadModule & { slide_count: number })[];
    },
  });
}

/** All slides for a module, ordered. Length is the single source of truth for "total". */
export function useModuleSlides(moduleId: string | undefined) {
  return useQuery({
    queryKey: ['launchpad-slides', moduleId],
    enabled: !!moduleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('launchpad_slides')
        .select('id, module_id, slide_number, title, slide_type, body')
        .eq('module_id', moduleId!)
        .order('slide_number', { ascending: true });
      if (error) throw error;
      return (data || []) as LaunchpadSlide[];
    },
  });
}

export function useLaunchpadModule(moduleId: string | undefined) {
  return useQuery({
    queryKey: ['launchpad-module', moduleId],
    enabled: !!moduleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('launchpad_modules')
        .select('*')
        .eq('id', moduleId!)
        .maybeSingle();
      if (error) throw error;
      return data as LaunchpadModule | null;
    },
  });
}

/** Module-level progress rollup for one user (defaults to the signed-in user). */
export function useModuleProgress(userId?: string) {
  const { user } = useAuth();
  const id = userId || user?.id;
  return useQuery({
    queryKey: ['launchpad-module-progress', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('launchpad_module_progress')
        .select('module_id, user_id, status, last_slide_number, started_at, completed_at, updated_at')
        .eq('user_id', id!);
      if (error) throw error;
      return (data || []) as ModuleProgressRow[];
    },
  });
}

/** Completed slide ids for one module, for the signed-in user. */
export function useSlideProgress(moduleId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['launchpad-slide-progress', user?.id, moduleId],
    enabled: !!user?.id && !!moduleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('launchpad_progress')
        .select('slide_id')
        .eq('user_id', user!.id)
        .eq('module_id', moduleId!);
      if (error) throw error;
      return (data || []).map((r) => r.slide_id as string);
    },
  });
}

/** Slide completions across all modules, used for per-module progress rings. */
export function useAllSlideProgress() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['launchpad-slide-progress-all', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('launchpad_progress')
        .select('module_id, slide_id')
        .eq('user_id', user!.id);
      if (error) throw error;
      const byModule: Record<string, number> = {};
      (data || []).forEach((r: any) => {
        byModule[r.module_id] = (byModule[r.module_id] || 0) + 1;
      });
      return byModule;
    },
  });
}

interface RecordArgs {
  moduleId: string;
  slideId: string;
  slideNumber: number;
  isLastSlide: boolean;
}

/**
 * Marks a slide complete and updates the module rollup.
 * "Complete" is derived from isLastSlide (index === slides.length - 1),
 * never from the presence of a knowledge check, so modules with any number
 * of slides — including reference modules with content slides only — finish
 * correctly.
 */
export function useRecordSlideProgress() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ moduleId, slideId, slideNumber, isLastSlide }: RecordArgs) => {
      if (!user?.id) throw new Error('Not signed in');

      const { error: slideError } = await supabase
        .from('launchpad_progress')
        .upsert(
          { user_id: user.id, module_id: moduleId, slide_id: slideId, completed_at: new Date().toISOString() },
          { onConflict: 'user_id,slide_id' },
        );
      if (slideError) throw slideError;

      const now = new Date().toISOString();
      const { error: moduleError } = await supabase
        .from('launchpad_module_progress')
        .upsert(
          {
            user_id: user.id,
            module_id: moduleId,
            status: isLastSlide ? 'completed' : 'in_progress',
            last_slide_number: slideNumber,
            started_at: now,
            completed_at: isLastSlide ? now : null,
          },
          { onConflict: 'user_id,module_id' },
        );
      if (moduleError) throw moduleError;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['launchpad-slide-progress', user?.id, vars.moduleId] });
      qc.invalidateQueries({ queryKey: ['launchpad-slide-progress-all', user?.id] });
      qc.invalidateQueries({ queryKey: ['launchpad-module-progress', user?.id] });
    },
  });
}

export interface MenteeProgressRow {
  id: string;
  full_name: string | null;
  launchpad_track: LaunchpadTrack | null;
  modulesComplete: number;
  totalModules: number;
  currentModule: string | null;
  lastActivity: string | null;
}

/**
 * Mentor / admin view. RLS decides the rows: a mentor only sees profiles they
 * mentor, admins see everyone.
 */
export function useMenteeProgress(isAdmin: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['launchpad-mentee-progress', user?.id, isAdmin],
    enabled: !!user?.id,
    queryFn: async () => {
      let profileQuery = supabase
        .from('profiles')
        .select('id, full_name, launchpad_track, mentor_id');
      if (!isAdmin) profileQuery = profileQuery.eq('mentor_id', user!.id);
      const { data: profiles, error: pErr } = await profileQuery;
      if (pErr) throw pErr;

      const ids = (profiles || []).map((p) => p.id);
      if (ids.length === 0) return [] as MenteeProgressRow[];

      const [{ data: progress, error: prErr }, { data: modules, error: mErr }] = await Promise.all([
        supabase
          .from('launchpad_module_progress')
          .select('user_id, module_id, status, updated_at')
          .in('user_id', ids),
        supabase.from('launchpad_modules').select('id, module_number, title, track'),
      ]);
      if (prErr) throw prErr;
      if (mErr) throw mErr;

      const moduleById = new Map((modules || []).map((m: any) => [m.id, m]));

      return (profiles || []).map((p: any) => {
        const rows = (progress || []).filter((r: any) => r.user_id === p.id);
        const complete = rows.filter((r: any) => r.status === 'completed').length;
        const inProgress = rows
          .filter((r: any) => r.status === 'in_progress')
          .sort((a: any, b: any) => (a.updated_at < b.updated_at ? 1 : -1))[0];
        const last = rows
          .slice()
          .sort((a: any, b: any) => (a.updated_at < b.updated_at ? 1 : -1))[0];
        const totalModules = (modules || []).filter(
          (m: any) => m.track === 'unified' || m.track === p.launchpad_track,
        ).length;
        const current = inProgress ? moduleById.get(inProgress.module_id) : null;
        return {
          id: p.id,
          full_name: p.full_name,
          launchpad_track: p.launchpad_track,
          modulesComplete: complete,
          totalModules,
          currentModule: current ? `${current.module_number}. ${current.title}` : null,
          lastActivity: last?.updated_at || null,
        } as MenteeProgressRow;
      });
    },
  });
}