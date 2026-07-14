import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Check, X, Mail, Phone, MapPin, Users, Calendar, User } from 'lucide-react';
import { format } from 'date-fns';

interface Nomination {
  id: string;
  nomination_type: string;
  nominator_name: string;
  nominator_email: string | null;
  nominator_phone: string | null;
  nominator_consent: boolean;
  nominee_name: string | null;
  nominee_address: string | null;
  nominee_phone: string | null;
  household_size: number | null;
  nominee_consent: boolean;
  story: string | null;
  created_at: string;
}

const STORY_PREVIEW_LEN = 220;

const ConsentBadge = ({ ok, label }: { ok: boolean; label: string }) => (
  <Badge variant="outline" className={`text-[11px] gap-1 ${ok ? 'border-emerald-500/40 text-emerald-600' : 'border-muted text-muted-foreground'}`}>
    {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />} {label}
  </Badge>
);

const Nominations = () => {
  const [rows, setRows] = useState<Nomination[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Nomination | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('ac_nominations')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) setRows(data as Nomination[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Nominations</h1>
        <p className="text-muted-foreground mt-1">
          Luxe Impact Project — AC nomination submissions ({rows.length})
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No nominations yet.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rows.map((n) => {
            const isSelf = n.nomination_type === 'myself';
            const storyLong = (n.story?.length ?? 0) > STORY_PREVIEW_LEN;
            return (
              <Card key={n.id} className="border-gold/10">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base font-display">
                        {isSelf ? n.nominator_name : (n.nominee_name || n.nominator_name)}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(n.created_at), 'MMM d, yyyy · h:mm a')}
                      </p>
                    </div>
                    <Badge variant={isSelf ? 'secondary' : 'default'} className="text-[10px] uppercase tracking-wide">
                      {isSelf ? 'Self' : 'Someone else'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nominator</p>
                    <p className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-muted-foreground" />{n.nominator_name}</p>
                    {n.nominator_email && (
                      <p className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5" />
                        <a href={`mailto:${n.nominator_email}`} className="hover:text-gold">{n.nominator_email}</a>
                      </p>
                    )}
                    {n.nominator_phone && (
                      <p className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" />
                        <a href={`tel:${n.nominator_phone}`} className="hover:text-gold">{n.nominator_phone}</a>
                      </p>
                    )}
                  </div>

                  {!isSelf && (n.nominee_name || n.nominee_address || n.nominee_phone) && (
                    <div className="space-y-1 pt-2 border-t border-gold/5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nominee</p>
                      {n.nominee_name && <p className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-muted-foreground" />{n.nominee_name}</p>}
                      {n.nominee_phone && (
                        <p className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" />
                          <a href={`tel:${n.nominee_phone}`} className="hover:text-gold">{n.nominee_phone}</a>
                        </p>
                      )}
                      {n.nominee_address && (
                        <p className="flex items-start gap-2 text-muted-foreground"><MapPin className="h-3.5 w-3.5 mt-0.5" />{n.nominee_address}</p>
                      )}
                    </div>
                  )}

                  {n.household_size != null && (
                    <p className="flex items-center gap-2 text-muted-foreground text-xs">
                      <Users className="h-3.5 w-3.5" /> Household size: {n.household_size}
                    </p>
                  )}

                  {n.story && (
                    <div className="pt-2 border-t border-gold/5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Story</p>
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                        {storyLong ? n.story.slice(0, STORY_PREVIEW_LEN) + '…' : n.story}
                      </p>
                      {storyLong && (
                        <Button variant="link" size="sm" className="px-0 h-auto text-gold" onClick={() => setSelected(n)}>
                          Read full story
                        </Button>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-gold/5">
                    <ConsentBadge ok={n.nominator_consent} label="Nominator consent" />
                    <ConsentBadge ok={n.nominee_consent} label="Nominee consent" />
                  </div>

                  <div className="pt-1">
                    <Button variant="outline" size="sm" onClick={() => setSelected(n)}>View details</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">
                  Nomination — {selected.nomination_type === 'myself' ? selected.nominator_name : (selected.nominee_name || selected.nominator_name)}
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(selected.created_at), 'PPPp')}
                </p>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Type</p>
                  <p>{selected.nomination_type === 'myself' ? 'Nominating themselves' : 'Nominating someone else'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Nominator</p>
                  <p>{selected.nominator_name}</p>
                  {selected.nominator_email && <p className="text-muted-foreground">{selected.nominator_email}</p>}
                  {selected.nominator_phone && <p className="text-muted-foreground">{selected.nominator_phone}</p>}
                </div>
                {(selected.nominee_name || selected.nominee_address || selected.nominee_phone) && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Nominee</p>
                    {selected.nominee_name && <p>{selected.nominee_name}</p>}
                    {selected.nominee_phone && <p className="text-muted-foreground">{selected.nominee_phone}</p>}
                    {selected.nominee_address && <p className="text-muted-foreground">{selected.nominee_address}</p>}
                  </div>
                )}
                {selected.household_size != null && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Household size</p>
                    <p>{selected.household_size}</p>
                  </div>
                )}
                {selected.story && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Story</p>
                    <p className="whitespace-pre-wrap text-foreground/90">{selected.story}</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-gold/5">
                  <ConsentBadge ok={selected.nominator_consent} label="Nominator consent" />
                  <ConsentBadge ok={selected.nominee_consent} label="Nominee consent" />
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Nominations;