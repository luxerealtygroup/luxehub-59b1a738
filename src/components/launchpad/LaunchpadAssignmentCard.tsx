import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Rocket } from 'lucide-react';
import { toast } from 'sonner';

const NONE = 'none';

export function LaunchpadAssignmentCard({ agentId }: { agentId: string }) {
  const [track, setTrack] = useState<string>(NONE);
  const [mentorId, setMentorId] = useState<string>(NONE);
  const [teammates, setTeammates] = useState<{ id: string; full_name: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ data: profile }, { data: others }] = await Promise.all([
        supabase.from('profiles').select('launchpad_track, mentor_id').eq('id', agentId).maybeSingle(),
        supabase.from('profiles').select('id, full_name').order('full_name'),
      ]);
      setTrack(profile?.launchpad_track || NONE);
      setMentorId(profile?.mentor_id || NONE);
      setTeammates((others || []).filter((p) => p.id !== agentId));
      setLoading(false);
    };
    load();
  }, [agentId]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        launchpad_track: track === NONE ? null : track,
        mentor_id: mentorId === NONE ? null : mentorId,
      })
      .eq('id', agentId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Launchpad assignment saved');
  };

  return (
    <Card className="border-gold/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-gold">
          <Rocket className="h-4 w-4" /> Launchpad Assignment
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-20 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-gold" />
          </div>
        ) : (
          <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Track</Label>
              <Select value={track} onValueChange={setTrack}>
                <SelectTrigger><SelectValue placeholder="No track" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No track</SelectItem>
                  <SelectItem value="junior">Junior</SelectItem>
                  <SelectItem value="associate">Associate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mentor</Label>
              <Select value={mentorId} onValueChange={setMentorId}>
                <SelectTrigger><SelectValue placeholder="No mentor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No mentor</SelectItem>
                  {teammates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.full_name || 'Unnamed'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}