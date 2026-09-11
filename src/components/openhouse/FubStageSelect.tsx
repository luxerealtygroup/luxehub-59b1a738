import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';

/** The agent's last pick, so sending is one tap next time. */
export const LAST_STAGE_KEY = 'openhouse_fub_stage';

export function lastStage(): string | null {
  try {
    return localStorage.getItem(LAST_STAGE_KEY);
  } catch {
    return null;
  }
}

export function rememberStage(stage: string) {
  try {
    localStorage.setItem(LAST_STAGE_KEY, stage);
  } catch {
    // storage unavailable — the picker still works, it just won't remember
  }
}

let cache: string[] | null = null;
let inflight: Promise<string[]> | null = null;

async function loadStages(): Promise<string[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = supabase.functions
      .invoke('openhouse-fub', { body: { action: 'stages' } })
      .then(({ data }) => {
        const list = (data as { stages?: string[] } | null)?.stages ?? [];
        if (list.length) cache = list;
        return list;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Live stage list from the connected Follow Up Boss account — never hardcoded. */
export function FubStageSelect({
  value,
  onChange,
  className,
}: {
  value: string | null;
  onChange: (stage: string) => void;
  className?: string;
}) {
  const [stages, setStages] = useState<string[]>(cache ?? []);

  useEffect(() => {
    let live = true;
    loadStages().then((list) => {
      if (live) setStages(list);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger className={className ?? 'h-9 w-[170px] text-sm'} aria-label="Follow Up Boss stage">
        <SelectValue placeholder={stages.length ? 'Pick a stage' : 'Loading stages…'} />
      </SelectTrigger>
      <SelectContent>
        {stages.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
