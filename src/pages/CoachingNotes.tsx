import { useEffect, useMemo, useState } from "react";
import { format, startOfWeek } from "date-fns";
import { CalendarIcon, Copy, Loader2, Save, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AgentOption {
  id: string;
  full_name: string | null;
}

interface PastSession {
  id: string;
  week_of: string;
  generated_notes: string | null;
  transcript_text: string;
  created_at: string;
}

export default function CoachingNotes() {
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentId, setAgentId] = useState<string>("");
  const [weekOf, setWeekOf] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pastSessions, setPastSessions] = useState<PastSession[]>([]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .order("full_name");
      if (error) {
        toast.error("Failed to load agents");
        return;
      }
      setAgents((data ?? []).filter((a) => a.full_name));
    })();
  }, []);

  const weekOfISO = useMemo(() => format(weekOf, "yyyy-MM-dd"), [weekOf]);

  const loadPastSessions = async (agent: string) => {
    if (!agent) {
      setPastSessions([]);
      return;
    }
    const { data, error } = await supabase
      .from("coaching_sessions")
      .select("id, week_of, generated_notes, transcript_text, created_at")
      .eq("agent_id", agent)
      .order("week_of", { ascending: false })
      .limit(50);
    if (error) {
      toast.error("Failed to load past sessions");
      return;
    }
    setPastSessions((data ?? []) as PastSession[]);
  };

  useEffect(() => {
    loadPastSessions(agentId);
  }, [agentId]);

  const handleGenerate = async () => {
    if (!agentId) {
      toast.error("Pick an agent");
      return;
    }
    if (!transcript.trim()) {
      toast.error("Paste a transcript");
      return;
    }
    setLoading(true);
    setGenerated("");
    setSessionId(null);
    setDirty(false);
    try {
      const { data, error } = await supabase.functions.invoke("generate-coaching-notes", {
        body: { agent_id: agentId, week_of: weekOfISO, transcript_text: transcript },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setGenerated(data?.generated_notes ?? "");
      setSessionId(data?.session?.id ?? null);
      toast.success("Coaching note generated");
      loadPastSessions(agentId);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to generate note");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!sessionId) {
      toast.error("No session to save");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("coaching_sessions")
      .update({ generated_notes: generated })
      .eq("id", sessionId);
    setSaving(false);
    if (error) {
      toast.error("Failed to save changes");
      return;
    }
    setDirty(false);
    toast.success("Saved");
    loadPastSessions(agentId);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generated);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  const loadSession = (s: PastSession) => {
    setSessionId(s.id);
    setGenerated(s.generated_notes ?? "");
    setTranscript(s.transcript_text);
    setWeekOf(startOfWeek(new Date(s.week_of + "T12:00:00"), { weekStartsOn: 1 }));
    setDirty(false);
    toast.success(`Loaded note from week of ${format(new Date(s.week_of + "T12:00:00"), "PP")}`);
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Coaching Notes</h1>
        <p className="text-muted-foreground">Generate a weekly coaching note for an agent from a call transcript.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Agent</Label>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Week of</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !weekOf && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(weekOf, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={weekOf}
                    onSelect={(d) => d && setWeekOf(startOfWeek(d, { weekStartsOn: 1 }))}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Call transcript</Label>
            <Textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste the full coaching call transcript here…"
              className="min-h-[280px] font-mono text-sm"
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleGenerate} disabled={loading}>
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…</>
              ) : (
                <><Sparkles className="mr-2 h-4 w-4" /> Generate Notes</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {(loading || generated) && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>
              Generated Note {dirty && <span className="text-xs font-normal text-muted-foreground ml-2">(unsaved changes)</span>}
            </CardTitle>
            {!loading && generated && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleCopy}>
                  <Copy className="mr-2 h-4 w-4" /> Copy
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving || !sessionId || !dirty}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-3 text-muted-foreground py-8 justify-center">
                <Loader2 className="h-5 w-5 animate-spin" />
                Writing the coaching note…
              </div>
            ) : (
              <Textarea
                value={generated}
                onChange={(e) => { setGenerated(e.target.value); setDirty(true); }}
                className="min-h-[420px] font-sans text-sm leading-relaxed bg-muted/30"
              />
            )}
          </CardContent>
        </Card>
      )}

      {agentId && pastSessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Past Sessions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pastSessions.map((s) => (
              <button
                key={s.id}
                onClick={() => loadSession(s)}
                className={cn(
                  "w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition",
                  sessionId === s.id && "border-primary bg-muted/40"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">Week of {format(new Date(s.week_of + "T12:00:00"), "PP")}</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(s.created_at), "PP p")}</div>
                </div>
                <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                  {(s.generated_notes ?? "").slice(0, 200) || "No generated note yet"}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}