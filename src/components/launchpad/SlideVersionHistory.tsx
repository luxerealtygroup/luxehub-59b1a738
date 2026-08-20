import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { History, GitCompare, Loader2 } from 'lucide-react';
import {
  useSlideVersions,
  type LaunchpadSlide,
  type LaunchpadSlideVersion,
} from '@/hooks/useLaunchpad';
import {
  diffWords,
  coalesceTokens,
  diffStats,
  type DiffToken,
} from '@/lib/slideDiff';

type DiffMode = 'inline' | 'side';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** The current (live) slide as a pseudo "version" so it can be diffed against history. */
function asCurrentVersion(slide: LaunchpadSlide): LaunchpadSlideVersion {
  return {
    id: 'current',
    slide_id: slide.id,
    module_id: slide.module_id,
    slide_number: slide.slide_number,
    title: slide.title,
    slide_type: slide.slide_type,
    body: slide.body,
    changed_by: null,
    version_number: 0,
    changed_at: new Date().toISOString(),
  };
}

function InlineDiff({ tokens }: { tokens: DiffToken[] }) {
  return (
    <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
      {tokens.map((t, i) => {
        if (t.op === 'equal') {
          return (
            <span key={i} className="text-foreground/80">
              {t.value}
            </span>
          );
        }
        if (t.op === 'removed') {
          return (
            <span
              key={i}
              className="rounded bg-red-500/15 text-red-700 line-through decoration-red-500/60 dark:text-red-400"
            >
              {t.value}
            </span>
          );
        }
        return (
          <span
            key={i}
            className="rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
          >
            {t.value}
          </span>
        );
      })}
    </div>
  );
}

function SideBySide({ oldText, newText }: { oldText: string; newText: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="rounded-lg border border-red-500/25 bg-red-500/5 p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
          Previous
        </div>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/80">
          {oldText || '—'}
        </p>
      </div>
      <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
          Current
        </div>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/80">
          {newText || '—'}
        </p>
      </div>
    </div>
  );
}

export function SlideVersionHistory({
  slide,
  moduleTitle,
  open,
  onOpenChange,
}: {
  slide: LaunchpadSlide;
  moduleTitle?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: versions = [], isLoading } = useSlideVersions(open ? slide.id : undefined);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [diffMode, setDiffMode] = useState<DiffMode>('inline');

  const current = useMemo(() => asCurrentVersion(slide), [slide]);

  // Newest-first list with the live "current" pseudo-version pinned at top.
  const rows = useMemo(() => [current, ...versions], [current, versions]);

  const selected = useMemo(() => {
    const fallback = rows[1] ?? current;
    return rows.find((r) => r.id === selectedVersionId) ?? fallback;
  }, [rows, selectedVersionId, current]);

  const diffTokens = useMemo(() => {
    if (!selected || selected.id === 'current') return [] as DiffToken[];
    return coalesceTokens(diffWords(selected.body, current.body));
  }, [selected, current]);

  const stats = useMemo(() => diffStats(diffTokens), [diffTokens]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[min(96vw,1100px)] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 font-display">
            <History className="h-4 w-4 text-gold" /> Version history
          </DialogTitle>
          <DialogDescription className="truncate">
            Slide {slide.slide_number} · {slide.title}
            {moduleTitle ? ` · ${moduleTitle}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-[420px] grid-cols-1 md:grid-cols-[260px_1fr]">
          {/* Version list */}
          <ScrollArea className="max-h-[68vh] border-r border-border md:max-h-[74vh]">
            <div className="p-3">
              {isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : rows.length <= 1 ? (
                <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                  No prior versions yet. History starts being captured the next time this slide is
                  edited.
                </p>
              ) : (
                <ul className="space-y-1">
                  {rows.map((r, idx) => {
                    const isCurrent = r.id === 'current';
                    const active = selected?.id === r.id;
                    return (
                      <li key={r.id}>
                        <button
                          onClick={() => setSelectedVersionId(r.id)}
                          className={`flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors ${
                            active
                              ? 'border-gold/40 bg-gold/10'
                              : 'border-transparent hover:bg-muted/50'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-muted-foreground">
                                {isCurrent ? 'live' : `v${r.version_number}`}
                              </span>
                              {isCurrent && (
                                <Badge variant="outline" className="text-[9px] text-emerald-600">
                                  current
                                </Badge>
                              )}
                              {idx === 1 && !isCurrent && (
                                <Badge variant="outline" className="text-[9px]">
                                  latest saved
                                </Badge>
                              )}
                            </div>
                            <div className="mt-0.5 truncate text-xs text-muted-foreground">
                              {isCurrent ? 'as shown now' : formatDate(r.changed_at)}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </ScrollArea>

          {/* Diff / content panel */}
          <div className="flex min-h-[420px] flex-col">
            {selected && selected.id !== 'current' ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <GitCompare className="h-3.5 w-3.5" />
                    Comparing <span className="font-mono">v{selected.version_number}</span>
                    <span className="text-foreground/40">→</span>
                    <span className="font-mono">current</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[11px]">
                      <span className="text-emerald-600">+{stats.added}</span>
                      <span className="text-red-600">-{stats.removed}</span>
                    </span>
                    <Tabs value={diffMode} onValueChange={(v) => setDiffMode(v as DiffMode)}>
                      <TabsList className="h-8">
                        <TabsTrigger value="inline" className="text-xs">
                          Inline
                        </TabsTrigger>
                        <TabsTrigger value="side" className="text-xs">
                          Side by side
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-5">
                    {diffMode === 'inline' ? (
                      <InlineDiff tokens={diffTokens} />
                    ) : (
                      <SideBySide oldText={selected.body} newText={current.body} />
                    )}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <ScrollArea className="flex-1">
                <div className="p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] text-emerald-600">
                      current
                    </Badge>
                    <span className="text-xs text-muted-foreground">Live body as shown in the app</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                    {current.body || '—'}
                  </p>
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-border px-6 py-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
