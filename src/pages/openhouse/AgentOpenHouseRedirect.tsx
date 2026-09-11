import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Mail, CheckCircle2 } from 'lucide-react';
import { tenant } from '@/config/tenant';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

type AgentRow = {
  agent_name: string | null;
  agent_email: string | null;
  agent_avatar_url: string | null;
  active_slug: string | null;
  status: string | null;
};

const INTENT_CHOICES = [
  { value: 'buying', label: 'Buying' },
  { value: 'selling', label: 'Selling' },
  { value: 'both', label: 'Both' },
  { value: 'just_looking', label: 'Just looking' },
];

/**
 * The permanent per-agent QR target. Printed signs and postcards point here
 * forever: it opens the open house running now, otherwise the next upcoming
 * one, otherwise a contact card with a short lead form so the scan still counts.
 */
export default function AgentOpenHouseRedirect() {
  const { agentSlug = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState<AgentRow | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [intent, setIntent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.rpc('public_agent_open_house', { _agent_slug: agentSlug }).then(({ data }) => {
      if (!alive) return;
      const row = Array.isArray(data) ? (data[0] as unknown as AgentRow) : null;
      if (row?.active_slug) {
        window.location.replace(`/oh/${row.active_slug}`);
        return;
      }
      setAgent(row);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [agentSlug]);

  const submit = async () => {
    if (!firstName.trim()) {
      toast.error('Please tell us your name.');
      return;
    }
    const digits = phone.replace(/\D/g, '');
    if (!email.trim() && digits.length < 10) {
      toast.error('Please add a phone number or an email address.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('submit_agent_qr_lead', {
      _agent_slug: agentSlug,
      _first_name: firstName,
      _last_name: lastName,
      _email: email,
      _phone: phone,
      _intent: intent,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDone(true);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-14">
      <div className="w-full max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.28em] text-gold">{tenant.brokerageName}</p>
        {agent?.agent_avatar_url && (
          <img
            src={agent.agent_avatar_url}
            alt={agent.agent_name || 'Agent'}
            className="mx-auto mt-6 h-24 w-24 rounded-full border border-gold/40 object-cover"
          />
        )}
        <h1 className="mt-6 font-display text-3xl font-semibold text-foreground">
          {agent?.agent_name || 'Your agent'}
        </h1>
        <p className="mt-3 text-muted-foreground">
          There's no open house running at the moment — leave your details and we'll be in touch about
          homes coming up.
        </p>
        {agent?.agent_email && (
          <a
            href={`mailto:${agent.agent_email}`}
            className="mt-6 inline-flex items-center gap-2 rounded-xl border-2 border-gold px-6 py-4 text-base font-medium text-foreground"
          >
            <Mail className="h-5 w-5 text-gold" /> {agent.agent_email}
          </a>
        )}

        {done ? (
          <div className="mt-10 rounded-2xl border border-gold/30 bg-card p-8">
            <CheckCircle2 className="mx-auto h-10 w-10 text-gold" />
            <p className="mt-4 text-lg font-medium text-foreground">Thank you</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {agent?.agent_name || 'Your agent'} will reach out shortly.
            </p>
          </div>
        ) : (
          <div className="mt-10 space-y-4 rounded-2xl border border-border bg-card p-6 text-left">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="qr-first">First name</Label>
                <Input id="qr-first" className="h-12" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qr-last">Last name</Label>
                <Input id="qr-last" className="h-12" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qr-phone">Phone</Label>
              <Input id="qr-phone" type="tel" inputMode="tel" className="h-12" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qr-email">Email</Label>
              <Input id="qr-email" type="email" className="h-12" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Are you looking to buy or sell?</Label>
              <div className="flex flex-wrap gap-2">
                {INTENT_CHOICES.map((o) => {
                  const on = intent === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setIntent(o.value)}
                      className={`min-h-[46px] rounded-lg border px-4 text-sm font-medium transition-colors ${
                        on
                          ? 'border-gold bg-gold/15 text-foreground'
                          : 'border-border bg-background text-muted-foreground hover:border-gold/60'
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <Button className="h-14 w-full text-base" onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-5 w-5 animate-spin" />} Send my details
            </Button>
          </div>
        )}

        <p className="mt-8 text-sm text-muted-foreground">{tenant.websiteDomain}</p>
      </div>
    </div>
  );
}
