import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Lock } from 'lucide-react';
import { tenant } from '@/config/tenant';

type YesNo = 'yes' | 'no' | '';

const toBool = (v: YesNo) => (v === 'yes' ? true : v === 'no' ? false : null);

const TEAM_SIZES = [
  'Just me',
  '2–5 people',
  '6–15 people',
  '16–50 people',
  'More than 50 people',
];

const YesNoField = ({
  label, help, value, onChange, name,
}: {
  label: string; help?: string; value: YesNo; onChange: (v: YesNo) => void; name: string;
}) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    {help && <p className="text-xs text-muted-foreground">{help}</p>}
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as YesNo)}
      className="flex gap-6 pt-1"
    >
      <div className="flex items-center gap-2">
        <RadioGroupItem value="yes" id={`${name}-yes`} />
        <Label htmlFor={`${name}-yes`} className="font-normal">Yes</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="no" id={`${name}-no`} />
        <Label htmlFor={`${name}-no`} className="font-normal">No</Label>
      </div>
    </RadioGroup>
  </div>
);

const GetStarted = () => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [form, setForm] = useState({
    contactName: '',
    businessName: '',
    legalName: '',
    email: '',
    phone: '',
    website: '',
    desiredDomain: '',
    teamSize: '',
    serviceArea: '',
    slackAdminName: '',
    slackAdminEmail: '',
    extraNotes: '',
    honeypot: '',
  });
  const [usesFub, setUsesFub] = useState<YesNo>('');
  const [usesStripe, setUsesStripe] = useState<YesNo>('');
  const [usesAsana, setUsesAsana] = useState<YesNo>('');
  const [logo, setLogo] = useState<File | null>(null);

  const set = (k: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      let logoPath: string | null = null;
      if (logo) {
        if (logo.size > 2 * 1024 * 1024) {
          toast({
            title: 'Logo too large',
            description: 'Please upload an image under 2MB.',
            variant: 'destructive',
          });
          setSubmitting(false);
          return;
        }
        const ext = logo.name.split('.').pop()?.toLowerCase().slice(0, 8) || 'png';
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('onboarding-logos')
          .upload(path, logo, { contentType: logo.type || undefined });
        if (uploadError) {
          console.error(uploadError);
        } else {
          logoPath = path;
        }
      }

      const { data, error } = await supabase.functions.invoke('submit-onboarding-request', {
        body: {
          contactName: form.contactName,
          businessName: form.businessName,
          legalName: form.legalName,
          email: form.email,
          phone: form.phone,
          website: form.website,
          desiredDomain: form.desiredDomain,
          teamSize: form.teamSize,
          serviceArea: form.serviceArea,
          slackAdminName: form.slackAdminName,
          slackAdminEmail: form.slackAdminEmail,
          extraNotes: form.extraNotes,
          usesFub: toBool(usesFub),
          usesStripe: toBool(usesStripe),
          usesAsana: toBool(usesAsana),
          logoPath,
          company_website_confirm: form.honeypot,
        },
      });

      const message = (data as { error?: string } | null)?.error;
      if (error || message) {
        toast({
          title: 'We could not send that',
          description: message || 'Please try again in a moment.',
          variant: 'destructive',
        });
        setSubmitting(false);
        return;
      }

      setDone(true);
    } catch (err) {
      toast({
        title: 'Something went wrong',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
    setSubmitting(false);
  };

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-lg border-gold/20 bg-card/50 backdrop-blur">
          <CardContent className="pt-10 pb-10 text-center space-y-4">
            <CheckCircle2 className="mx-auto h-12 w-12 text-gold" />
            <h1 className="text-2xl font-display text-foreground">Thanks — we have your details</h1>
            <p className="text-muted-foreground">
              We'll email you within one business day to get started.
            </p>
            <p className="text-sm text-muted-foreground">
              Questions in the meantime? Email{' '}
              <a href={`mailto:${tenant.supportEmail}`} className="text-gold hover:underline">
                {tenant.supportEmail}
              </a>
              .
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-8 text-center">
          <p className="text-xs uppercase tracking-[0.28em] text-gold">Get started</p>
          <h1 className="mt-3 text-3xl font-display text-foreground sm:text-4xl">
            Set up your own client portal system
          </h1>
          <p className="mt-3 text-muted-foreground">
            Tell us a little about your business and we'll stand up your own copy — your branding,
            your domain, your clients. Whether you work solo or lead a team.
          </p>
        </header>

        <Card className="border-gold/20 bg-card/50 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-xl font-display">A few details</CardTitle>
            <CardDescription className="flex items-start gap-2 pt-1">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <span>
                We never ask for API keys, tokens or passwords. You'll connect your own
                integrations later, inside your own app.
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
                value={form.honeypot}
                onChange={set('honeypot')}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="contactName">Your name *</Label>
                  <Input id="contactName" value={form.contactName} onChange={set('contactName')} required maxLength={120} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input id="email" type="email" value={form.email} onChange={set('email')} required maxLength={255} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessName">Business name *</Label>
                <Input id="businessName" value={form.businessName} onChange={set('businessName')} required maxLength={160} />
                <p className="text-xs text-muted-foreground">
                  If you work solo, this can simply be your own name.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="legalName">Legal name</Label>
                <Input id="legalName" value={form.legalName} onChange={set('legalName')} maxLength={200} />
                <p className="text-xs text-muted-foreground">
                  Required at the bottom of the emails your app sends, for anti-spam compliance.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" type="tel" value={form.phone} onChange={set('phone')} maxLength={40} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input id="website" value={form.website} onChange={set('website')} placeholder="yourname.ca" maxLength={255} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="desiredDomain">Domain you'd like your portal on</Label>
                <Input id="desiredDomain" value={form.desiredDomain} onChange={set('desiredDomain')} placeholder="portal.yourname.ca" maxLength={255} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="logo">Logo</Label>
                <Input
                  id="logo"
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">PNG, JPG, SVG or WebP, under 2MB.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="teamSize">How many people are on your team?</Label>
                  <Select value={form.teamSize} onValueChange={(v) => setForm((f) => ({ ...f, teamSize: v }))}>
                    <SelectTrigger id="teamSize"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {TEAM_SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="serviceArea">Area you work</Label>
                  <Input id="serviceArea" value={form.serviceArea} onChange={set('serviceArea')} placeholder="Durham Region, ON" maxLength={200} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="slackAdminName">Who administers your Slack workspace?</Label>
                  <Input id="slackAdminName" value={form.slackAdminName} onChange={set('slackAdminName')} placeholder="Name" maxLength={120} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slackAdminEmail">Their email</Label>
                  <Input id="slackAdminEmail" type="email" value={form.slackAdminEmail} onChange={set('slackAdminEmail')} maxLength={255} />
                </div>
              </div>

              <div className="space-y-5 rounded-lg border border-border/60 p-4">
                <YesNoField
                  name="fub"
                  label="Do you use Follow Up Boss?"
                  help="The app is built around Follow Up Boss, so this one matters most."
                  value={usesFub}
                  onChange={setUsesFub}
                />
                <YesNoField name="stripe" label="Do you use Stripe?" value={usesStripe} onChange={setUsesStripe} />
                <YesNoField name="asana" label="Do you use Asana?" value={usesAsana} onChange={setUsesAsana} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="extraNotes">Anything else we should know?</Label>
                <Textarea id="extraNotes" value={form.extraNotes} onChange={set('extraNotes')} rows={4} maxLength={2000} />
              </div>

              <Button type="submit" disabled={submitting} className="w-full bg-gold text-gold-foreground hover:bg-gold/90">
                {submitting ? 'Sending…' : 'Send my details'}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link to="/login" className="text-gold hover:underline">Sign in</Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default GetStarted;
