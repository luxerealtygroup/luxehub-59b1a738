import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScriptLevel, useScriptProgress } from '@/lib/scriptLevels';

const sb = supabase as unknown as { from: (t: string) => any };

/** Owner-editable level settings. These sit in the app layer; the Scripting Boss instructions are never touched. */
export function LevelSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { levels, reload } = useScriptProgress(user?.id);
  const [edit, setEdit] = useState<Record<number, ScriptLevel>>({});
  useEffect(() => { setEdit(Object.fromEntries(levels.map(l => [l.level, l]))); }, [levels]);

  const save = async (n: number) => {
    const l = edit[n];
    const { error } = await sb.from('script_levels').update({
      name: l.name, description: l.description, pass_pct: Number(l.pass_pct), passes_required: Number(l.passes_required),
      persona_prompt: l.persona_prompt, grading_notes: l.grading_notes, updated_by: user?.id, updated_at: new Date().toISOString(),
    }).eq('id', l.id);
    if (error) toast({ title: "Couldn't save", description: error.message, variant: 'destructive' }); else { toast({ title: `Level ${n} saved` }); reload(); }
  };
  const set = (n: number, k: keyof ScriptLevel, v: string) => setEdit(e => ({ ...e, [n]: { ...e[n], [k]: v } as ScriptLevel }));

  return (
    <Card>
      <CardHeader><CardTitle className="font-display text-lg">Levels</CardTitle>
        <p className="text-sm text-muted-foreground">How warm or hostile the lead is at each level, the extra grading expectations, and what counts as a pass. The Scripting Boss instructions stay as they are.</p></CardHeader>
      <CardContent className="space-y-4">
        {[1, 2, 3, 4, 5].map(n => edit[n] && (
          <details key={n} className="rounded-md border border-border p-3">
            <summary className="cursor-pointer font-medium">L{n} {edit[n].name} · pass {edit[n].pass_pct}% × {edit[n].passes_required}</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <div className="space-y-1 sm:col-span-2"><Label>Name</Label><Input value={edit[n].name} onChange={e => set(n, 'name', e.target.value)} /></div>
              <div className="space-y-1"><Label>Pass %</Label><Input type="number" min={1} max={100} value={edit[n].pass_pct} onChange={e => set(n, 'pass_pct', e.target.value)} /></div>
              <div className="space-y-1"><Label>Passes needed</Label><Input type="number" min={1} max={50} value={edit[n].passes_required} onChange={e => set(n, 'passes_required', e.target.value)} /></div>
              <div className="space-y-1 sm:col-span-4"><Label>Description</Label><Input value={edit[n].description} onChange={e => set(n, 'description', e.target.value)} /></div>
              <div className="space-y-1 sm:col-span-2"><Label>Lead persona add-on</Label><Textarea rows={4} value={edit[n].persona_prompt} onChange={e => set(n, 'persona_prompt', e.target.value)} /></div>
              <div className="space-y-1 sm:col-span-2"><Label>Grading add-on</Label><Textarea rows={4} value={edit[n].grading_notes} onChange={e => set(n, 'grading_notes', e.target.value)} /></div>
            </div>
            <Button size="sm" className="mt-3" onClick={() => save(n)}>Save Level {n}</Button>
          </details>
        ))}
      </CardContent>
    </Card>
  );
}
