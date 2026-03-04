import React, { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Brain, Loader2, RefreshCw, CheckCircle, AlertTriangle, Target, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ReflectionData {
  performance_summary: string;
  strengths: string[];
  growth_opportunities: string[];
  strategic_suggestions: string[];
}

interface CachedReflection {
  data: ReflectionData;
  timestamp: number;
  userId: string;
}

const CACHE_KEY = 'ai_reflection_cache';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCached(userId: string): ReflectionData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedReflection = JSON.parse(raw);
    if (cached.userId !== userId) return null;
    if (Date.now() - cached.timestamp > CACHE_TTL) return null;
    return cached.data;
  } catch { return null; }
}

function setCache(userId: string, data: ReflectionData) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now(), userId }));
}

interface Props {
  uid: string | null;
}

export function AIReflectionSummary({ uid }: Props) {
  const { toast } = useToast();
  const [reflection, setReflection] = useState<ReflectionData | null>(() => uid ? getCached(uid) : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (force = false) => {
    if (!uid) return;
    if (!force) {
      const cached = getCached(uid);
      if (cached) { setReflection(cached); return; }
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('reflection-ai', {
        body: { userId: uid },
      });

      if (fnError) throw fnError;
      if (data?.error) { setError(data.error); return; }
      if (data?.performance_summary) {
        setReflection(data);
        setCache(uid, data);
      } else {
        setError('Unexpected response from AI.');
      }
    } catch (e: any) {
      console.error('AI reflection error:', e);
      setError(e.message || 'Failed to generate reflection.');
      toast({ title: 'Error', description: 'Failed to generate AI reflection.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [uid, toast]);

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="h-5 w-5 text-primary" />
            AI Performance Reflection (YTD)
          </CardTitle>
          <div className="flex items-center gap-2">
            {reflection && (
              <Button size="sm" variant="ghost" onClick={() => generate(true)} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            )}
            {!reflection && !loading && (
              <Button size="sm" onClick={() => generate(false)} disabled={loading}>
                <Brain className="h-4 w-4 mr-1" />
                Generate
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Analyzing your 4-1-1 data...</span>
          </div>
        )}

        {error && !loading && (
          <div className="text-center py-6 text-muted-foreground">
            <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-destructive" />
            <p className="text-sm">{error}</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => generate(true)}>
              Try Again
            </Button>
          </div>
        )}

        {!reflection && !loading && !error && (
          <div className="text-center py-6 text-muted-foreground">
            <Brain className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Click "Generate" to analyze your YTD 4-1-1 activity data with AI.</p>
          </div>
        )}

        {reflection && !loading && (
          <div className="space-y-5">
            {/* Section 1: Performance Summary */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary" className="text-xs font-semibold uppercase">YTD Performance Reflection</Badge>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{reflection.performance_summary}</p>
            </div>

            {/* Section 2: Strengths */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Strengths</span>
              </div>
              <ul className="space-y-1.5">
                {reflection.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="text-green-500 mt-0.5">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>

            {/* Section 3: Growth Opportunities */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-amber-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Growth Opportunities</span>
              </div>
              <ul className="space-y-1.5">
                {reflection.growth_opportunities.map((g, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="text-amber-500 mt-0.5">•</span>
                    {g}
                  </li>
                ))}
              </ul>
            </div>

            {/* Section 4: Strategic Suggestions */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Strategic Suggestions</span>
              </div>
              <ul className="space-y-1.5">
                {reflection.strategic_suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="text-primary mt-0.5">{i + 1}.</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
