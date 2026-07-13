import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Snowflake, CheckCircle2, Heart, Instagram, ExternalLink } from 'lucide-react';
import luxeLogoAsset from '@/assets/luxe-logo.png.asset.json';
const luxeLogo = luxeLogoAsset.url;

type NominationType = 'myself' | 'someone_else';

const Nominate = () => {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const [nominationType, setNominationType] = useState<NominationType | ''>('');
  const [nominatorName, setNominatorName] = useState('');
  const [nominatorEmail, setNominatorEmail] = useState('');
  const [nominatorPhone, setNominatorPhone] = useState('');
  const [nominatorConsent, setNominatorConsent] = useState(false);

  const [nomineeName, setNomineeName] = useState('');
  const [nomineeAddress, setNomineeAddress] = useState('');
  const [nomineePhone, setNomineePhone] = useState('');
  const [householdSize, setHouseholdSize] = useState('');
  const [nomineeConsent, setNomineeConsent] = useState(false);

  const [story, setStory] = useState('');

  const resetForm = () => {
    setNominationType('');
    setNominatorName('');
    setNominatorEmail('');
    setNominatorPhone('');
    setNominatorConsent(false);
    setNomineeName('');
    setNomineeAddress('');
    setNomineePhone('');
    setHouseholdSize('');
    setNomineeConsent(false);
    setStory('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nominationType) {
      toast({ title: 'Please choose who you are nominating.', variant: 'destructive' });
      return;
    }
    if (!nominatorName.trim() || !nominatorEmail.trim() || !nominatorPhone.trim()) {
      toast({ title: 'Please fill in your name, email, and phone.', variant: 'destructive' });
      return;
    }
    if (!nominatorConsent) {
      toast({ title: 'Please confirm we may contact you by phone.', variant: 'destructive' });
      return;
    }
    if (!story.trim()) {
      toast({ title: 'Please share their story.', variant: 'destructive' });
      return;
    }
    if (nominationType === 'someone_else') {
      if (!nomineeName.trim() || !nomineeAddress.trim() || !nomineePhone.trim()) {
        toast({ title: 'Please fill in the nominee\'s name, address, and phone.', variant: 'destructive' });
        return;
      }
      if (!nomineeConsent) {
        toast({ title: 'Please confirm the nominee has given permission to be contacted.', variant: 'destructive' });
        return;
      }
    }

    setLoading(true);
    const { error } = await supabase.from('ac_nominations').insert({
      nomination_type: nominationType,
      nominator_name: nominatorName.trim(),
      nominator_email: nominatorEmail.trim(),
      nominator_phone: nominatorPhone.trim(),
      nominator_consent: nominatorConsent,
      nominee_name: nominationType === 'someone_else' ? nomineeName.trim() : null,
      nominee_address: nominationType === 'someone_else' ? nomineeAddress.trim() : null,
      nominee_phone: nominationType === 'someone_else' ? nomineePhone.trim() : null,
      household_size: nominationType === 'someone_else' && householdSize ? parseInt(householdSize, 10) : null,
      nominee_consent: nominationType === 'someone_else' ? nomineeConsent : false,
      story: story.trim(),
    });
    setLoading(false);

    if (error) {
      toast({ title: 'Submission failed', description: error.message, variant: 'destructive' });
      return;
    }

    resetForm();
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen surface-canvas px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col items-center text-center mb-8">
          <img src={luxeLogo} alt="LUXEhub" className="h-16 w-auto mb-4" />
          <div className="flex items-center gap-2 text-primary">
            <Snowflake className="h-5 w-5" />
            <span className="eyebrow">Community Giveback</span>
            <Snowflake className="h-5 w-5" />
          </div>
        </div>

        {submitted ? (
          <Card className="luxe-card">
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle2 className="h-8 w-8 text-primary animate-check-pop" />
              </div>
              <h2 className="font-display text-3xl text-foreground">Thank you</h2>
              <p className="max-w-md text-muted-foreground">
                Your nomination has been received. Our team will review every story with care and
                reach out about next steps. Thank you for helping a neighbor stay cool this summer.
              </p>
              <Button onClick={() => setSubmitted(false)} className="mt-2">
                Submit another nomination
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="luxe-card">
            <CardHeader className="text-center">
              <CardTitle className="font-display text-3xl md:text-4xl text-foreground">
                Nominate a Family for an AC Unit
              </CardTitle>
              <CardDescription className="text-muted-foreground mt-2">
                Help us identify a family or individual who could use relief from the summer heat.
              </CardDescription>
              <div className="mx-auto mt-4 h-px w-24 divider-hair" />
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-center">
                <p className="eyebrow text-primary mb-2">LUXE IMPACT PROJECT</p>
                <p className="text-sm text-foreground leading-relaxed">
                  This nomination is part of the Luxe Impact Project — Luxe Realty Group's community
                  initiative built on the belief that real estate is about people, not just properties.
                  Through our Community Support Fund, we're helping families across Waterloo Region find
                  relief from the summer heat.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-sm font-medium">
                    Are you nominating <span className="text-destructive">*</span>
                  </Label>
                  <RadioGroup
                    value={nominationType}
                    onValueChange={(v) => setNominationType(v as NominationType)}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                  >
                    <Label
                      htmlFor="opt-myself"
                      className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 cursor-pointer hover:border-primary/40 transition-colors [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
                    >
                      <RadioGroupItem id="opt-myself" value="myself" />
                      <span className="font-medium">Myself</span>
                    </Label>
                    <Label
                      htmlFor="opt-other"
                      className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 cursor-pointer hover:border-primary/40 transition-colors [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
                    >
                      <RadioGroupItem id="opt-other" value="someone_else" />
                      <span className="font-medium">Someone Else</span>
                    </Label>
                  </RadioGroup>
                </div>

                <div className="space-y-4 rounded-xl border border-border/70 bg-card/50 p-5">
                  <p className="eyebrow">Your Information</p>
                  <div className="space-y-2">
                    <Label htmlFor="nominator-name">Your Name <span className="text-destructive">*</span></Label>
                    <Input id="nominator-name" value={nominatorName} onChange={(e) => setNominatorName(e.target.value)} required maxLength={200} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="nominator-email">Your Email <span className="text-destructive">*</span></Label>
                      <Input id="nominator-email" type="email" value={nominatorEmail} onChange={(e) => setNominatorEmail(e.target.value)} required maxLength={320} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nominator-phone">Your Phone <span className="text-destructive">*</span></Label>
                      <Input id="nominator-phone" type="tel" value={nominatorPhone} onChange={(e) => setNominatorPhone(e.target.value)} required maxLength={40} />
                    </div>
                  </div>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      checked={nominatorConsent}
                      onCheckedChange={(v) => setNominatorConsent(v === true)}
                      className="mt-1"
                    />
                    <span className="text-sm text-foreground">
                      I give permission for LUXEhub to contact me by phone regarding this nomination. <span className="text-destructive">*</span>
                    </span>
                  </label>
                </div>

                {nominationType === 'someone_else' && (
                  <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-5 animate-fade-in">
                    <p className="eyebrow">Nominee Information</p>
                    <div className="space-y-2">
                      <Label htmlFor="nominee-name">Family / Individual Name <span className="text-destructive">*</span></Label>
                      <Input id="nominee-name" value={nomineeName} onChange={(e) => setNomineeName(e.target.value)} maxLength={200} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nominee-address">Family Address <span className="text-destructive">*</span></Label>
                      <Input id="nominee-address" value={nomineeAddress} onChange={(e) => setNomineeAddress(e.target.value)} maxLength={500} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="nominee-phone">Family Contact Phone <span className="text-destructive">*</span></Label>
                        <Input id="nominee-phone" type="tel" value={nomineePhone} onChange={(e) => setNomineePhone(e.target.value)} maxLength={40} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="household-size">Household Size</Label>
                        <Input id="household-size" type="number" min={1} max={30} value={householdSize} onChange={(e) => setHouseholdSize(e.target.value)} />
                      </div>
                    </div>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <Checkbox
                        checked={nomineeConsent}
                        onCheckedChange={(v) => setNomineeConsent(v === true)}
                        className="mt-1"
                      />
                      <span className="text-sm text-foreground">
                        I confirm the nominee (or their guardian) has given permission for LUXEhub to contact them by phone. <span className="text-destructive">*</span>
                      </span>
                    </label>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="story">Tell us their story <span className="text-destructive">*</span></Label>
                  <Textarea
                    id="story"
                    value={story}
                    onChange={(e) => setStory(e.target.value)}
                    required
                    maxLength={5000}
                    rows={7}
                    placeholder="Share as much detail as you're comfortable with — why does this family or individual need an AC unit? Consider health concerns, children or elderly in the home, financial hardship, or anything else that will help us understand their situation."
                  />
                </div>

                <Button type="submit" disabled={loading} className="w-full py-6 text-base">
                  {loading ? 'Submitting...' : 'Submit Nomination'}
                </Button>
              </form>

              <div className="rounded-xl border border-border/70 bg-card/50 p-5 text-center">
                <p className="eyebrow mb-2">Want to get involved?</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Help us keep even more families cool this summer. Every contribution and follow spreads the impact.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <a
                    href="https://gofund.me/83a6c9851"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-gold w-full sm:w-auto"
                  >
                    <Heart className="h-4 w-4 mr-2" />
                    Donate
                    <ExternalLink className="h-3.5 w-3.5 ml-2 opacity-70" />
                  </a>
                  <a
                    href="https://instagram.com/luxeimpactproject"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-outline-gold w-full sm:w-auto"
                  >
                    <Instagram className="h-4 w-4 mr-2" />
                    Follow us on Instagram
                    <ExternalLink className="h-3.5 w-3.5 ml-2 opacity-70" />
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          © LUXEhub — Keeping our community cool, together.
        </p>
      </div>
    </div>
  );
};

export default Nominate;