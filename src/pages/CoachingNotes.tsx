import { useEffect, useMemo, useState } from "react";
import { format, startOfWeek } from "date-fns";
import { CalendarIcon, Loader2, Sparkles } from "lucide-react";
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

export default function CoachingNotes() {
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentId, setAgentId] = useState<string>("");
  const [weekOf, setWeekOf] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState<string>("");

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
    try {
      const { data, error } = await supabase.functions.invoke("generate-coaching-notes", {
        body: { agent_id: agentId, week_of: weekOfISO, transcript_text: transcript },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setGenerated(data?.generated_notes ?? "");
      toast.success("Coaching note generated");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to generate note");
    } finally {
      setLoading(false);
    }
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
          <CardHeader>
            <CardTitle>Generated Note</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-3 text-muted-foreground py-8 justify-center">
                <Loader2 className="h-5 w-5 animate-spin" />
                Writing the coaching note…
              </div>
            ) : (
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground bg-muted/30 rounded-lg p-5 border">
                {generated}
              </pre>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}