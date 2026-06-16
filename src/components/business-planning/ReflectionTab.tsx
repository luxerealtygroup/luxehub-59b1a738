import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { MessageSquare, Save, Loader2 } from 'lucide-react';
import { currentYear } from './types';
import { AIReflectionSummary } from './AIReflectionSummary';

interface Props {
  uid: string | null;
  quarter: number;
  isViewingAsAgent: boolean;
}

interface BPReflection {
  wins_ytd: string;
  biggest_bottleneck: string;
  what_avoiding: string;
  confidence: number;
  stress: number;
}

const emptyReflection: BPReflection = {
  wins_ytd: '', biggest_bottleneck: '', what_avoiding: '',
  confidence: 5, stress: 5,
};

export function ReflectionTab({ uid, quarter, isViewingAsAgent }: Props) {
  const { toast } = useToast();
  const [reflection, setReflection] = useState<BPReflection>(emptyReflection);
  const [reflectionId, setReflectionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchReflection = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase
      .from('business_planning_reflections')
      .select('*')
      .eq('user_id', uid)
      .eq('year', currentYear)
      .eq('quarter', quarter)
      .maybeSingle();
    if (data) {
      setReflection({
        wins_ytd: data.wins_ytd || '',
        biggest_bottleneck: data.biggest_bottleneck || '',
        what_avoiding: data.what_avoiding || '',
        confidence: data.confidence ?? 5,
        stress: data.stress ?? 5,
      });
      setReflectionId(data.id);
    } else {
      setReflection(emptyReflection);
      setReflectionId(null);
    }
    setLoaded(true);
  }, [uid, quarter]);

  useEffect(() => { fetchReflection(); }, [fetchReflection]);

  const save = async () => {
    if (!uid || isViewingAsAgent) return;
    setSaving(true);
    const payload = { ...reflection, user_id: uid, year: currentYear, quarter };
    if (reflectionId) {
      await supabase.from('business_planning_reflections').update(payload).eq('id', reflectionId);
    } else {
      const { data } = await supabase.from('business_planning_reflections').insert(payload).select('id').single();
      if (data) setReflectionId(data.id);
    }
    toast({ title: 'Reflection saved' });
    setSaving(false);
  };

  if (!loaded) return null;

  const fields: { key: keyof BPReflection; label: string; placeholder: string }[] = [
    { key: 'wins_ytd', label: 'Wins YTD', placeholder: 'List your biggest wins so far this year...' },
    { key: 'biggest_bottleneck', label: 'Biggest Bottleneck', placeholder: 'What is the #1 thing slowing you down?' },
    { key: 'what_avoiding', label: 'What am I avoiding?', placeholder: 'Be honest — what activity are you dodging?' },
  ];

  return (
    <>
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="h-5 w-5 text-gold" />
            Reflection & Mindset — Q{quarter} {currentYear}
          </CardTitle>
          {!isViewingAsAgent && (
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span className="ml-1">Save</span>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {fields.map(f => (
            <div key={f.key}>
              <Label className="text-xs font-semibold uppercase tracking-wider">{f.label}</Label>
              <Textarea
                value={reflection[f.key] as string}
                onChange={e => setReflection(r => ({ ...r, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="mt-1 min-h-[100px]"
                readOnly={isViewingAsAgent}
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider mb-3 block">
              Confidence Level: <span className="text-foreground text-sm font-bold">{reflection.confidence}/10</span>
            </Label>
            <Slider
              value={[reflection.confidence]}
              onValueChange={([v]) => setReflection(r => ({ ...r, confidence: v }))}
              min={1} max={10} step={1}
              disabled={isViewingAsAgent}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>Low</span><span>High</span>
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider mb-3 block">
              Stress Level: <span className="text-foreground text-sm font-bold">{reflection.stress}/10</span>
            </Label>
            <Slider
              value={[reflection.stress]}
              onValueChange={([v]) => setReflection(r => ({ ...r, stress: v }))}
              min={1} max={10} step={1}
              disabled={isViewingAsAgent}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>Low</span><span>High</span>
            </div>
          </div>
        </div>

        {(reflection.stress >= 7 || reflection.confidence < 5) && (
          <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-foreground">
            {reflection.stress >= 7 && (
              <div>Kristen will check in on this at the start of your session.</div>
            )}
            {reflection.confidence < 5 && (
              <div>Come ready to talk about what's getting in your way.</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>

    <AIReflectionSummary uid={uid} />
    </>
  );
}
