import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { CheckCircle2, CloudOff, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { tenant } from '@/config/tenant';
import {
  HOME_TO_SELL_OPTIONS, INTENT_OPTIONS, LENDER_OPTIONS, TIMELINE_OPTIONS, YES_NO_OPTIONS,
  digits, formatPhone, isValidEmail, isValidPhone,
} from '@/lib/openHouse/options';
import { countQueued, enqueueSignIn, flushQueue, newQueueId } from '@/lib/openHouse/queue';

interface PublicOpenHouse {
  id: string;
  slug: string;
  address: string;
  city: string | null;
  mls_number: string | null;
  list_price: number | null;
  cover_photo_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  disclosure_text: string | null;
  require_phone: boolean;
  custom_question_1: string | null;
  custom_question_2: string | null;
  custom_question_3: string | null;
  hosting_agent_name: string | null;
  hosting_agent_email: string | null;
  hosting_agent_avatar_url: string | null;
}

const cacheKey = (slug: string) => `${tenant.storagePrefix}.oh.${slug}`;

const blankForm = () => ({
  first_name: '',
  last_name: '',
  phone: '',
  email: '',
  working_with_agent: '' as '' | 'yes' | 'no',
  agent_name: '',
  intent: '',
  has_home_to_sell: '',
  timeline: '',
  lender_status: '',
  custom_1: '',
  custom_2: '',
  custom_3: '',
  notes: '',
  disclosure_accepted: false,
});

type FormState = ReturnType<typeof blankForm>;

/** Large, thumb-sized choice buttons — the visitor is standing up holding a coffee. */
function ChoiceRow({
  label,
  caption,
  options,
  value,
  onChange,
}: {
  label: string;
  caption?: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-lg font-medium text-foreground">{label}</legend>
      {caption && <p className="-mt-1 text-sm text-muted-foreground">{caption}</p>}
      <div className="flex flex-wrap gap-3">
        {options.map((o) => {
          const selected = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected ? '' : o.value)}
              className={`min-h-[60px] flex-1 basis-[45%] rounded-xl border-2 px-5 py-4 text-base font-medium transition-colors sm:basis-auto ${
                selected
                  ? 'border-gold bg-gold/15 text-foreground shadow-gold'
                  : 'border-border bg-card text-muted-foreground hover:border-gold/60'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function OpenHouseSignIn() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const kiosk = params.get('kiosk') === '1';

  const [house, setHouse] = useState<PublicOpenHouse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState<FormState>(blankForm);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [retrying, setRetrying] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // ---- Load the open house (network first, cached copy when offline) -------
  useEffect(() => {
    let alive = true;
    const cached = localStorage.getItem(cacheKey(slug));
    if (cached) {
      try {
        setHouse(JSON.parse(cached));
        setLoading(false);
      } catch {
        /* ignore a corrupt cache */
      }
    }
    supabase
      .rpc('public_open_house', { _slug: slug })
      .then(({ data, error }) => {
        if (!alive) return;
        const row = Array.isArray(data) ? (data[0] as PublicOpenHouse | undefined) : undefined;
        if (row) {
          setHouse(row);
          try {
            localStorage.setItem(cacheKey(slug), JSON.stringify(row));
          } catch {
            /* storage full — the page still works online */
          }
        } else if (!cached && !error) {
          setNotFound(true);
        }
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  // ---- Offline queue ------------------------------------------------------
  const refreshPending = useCallback(async () => setPending(await countQueued()), []);

  useEffect(() => {
    refreshPending();
    const onOnline = async () => {
      setOnline(true);
      await flushQueue();
      refreshPending();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    if (navigator.onLine) onOnline();
    const timer = window.setInterval(() => {
      if (navigator.onLine) onOnline();
    }, 60000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.clearInterval(timer);
    };
  }, [refreshPending]);

  const retryNow = async () => {
    setRetrying(true);
    await flushQueue();
    await refreshPending();
    setRetrying(false);
  };

  // ---- Kiosk mode: no navigation away, no leftovers on screen -------------
  useEffect(() => {
    if (!kiosk) return;
    document.body.classList.add('overflow-hidden');
    window.history.pushState(null, '', window.location.href);
    const block = () => window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', block);
    const goFullscreen = () => {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => undefined);
    };
    window.addEventListener('pointerdown', goFullscreen, { once: true });
    return () => {
      window.removeEventListener('popstate', block);
      window.removeEventListener('pointerdown', goFullscreen);
      document.body.classList.remove('overflow-hidden');
    };
  }, [kiosk]);

  // A kiosk tablet sits unattended: never leave one visitor's answers on
  // screen for the next person, even if nobody presses Done.
  useEffect(() => {
    if (!kiosk || done) return;
    let idle: number;
    const reset = () => {
      window.clearTimeout(idle);
      idle = window.setTimeout(() => {
        setForm(blankForm());
        setErrors([]);
      }, 120000);
    };
    reset();
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown'];
    events.forEach((e) => window.addEventListener(e, reset));
    return () => {
      window.clearTimeout(idle);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [kiosk, done]);

  const customQuestions = useMemo(
    () =>
      [
        { key: 'custom_1' as const, text: house?.custom_question_1 },
        { key: 'custom_2' as const, text: house?.custom_question_2 },
        { key: 'custom_3' as const, text: house?.custom_question_3 },
      ].filter((q) => q.text && q.text.trim().length > 0),
    [house],
  );

  const validate = (): string[] => {
    const e: string[] = [];
    if (!form.first_name.trim()) e.push('Please enter your first name.');
    const hasPhone = isValidPhone(form.phone);
    const hasEmail = isValidEmail(form.email);
    if (house?.require_phone && !hasPhone) e.push('Please enter a 10-digit phone number.');
    if (form.phone.trim() && !hasPhone) e.push('That phone number does not look like 10 digits.');
    if (form.email.trim() && !hasEmail) e.push('That email address does not look right.');
    if (!hasPhone && !hasEmail) e.push('Please leave a phone number or an email address.');
    if (house?.disclosure_text && !form.disclosure_accepted) e.push('Please tick the box to continue.');
    return e;
  };

  const submit = async () => {
    const found = validate();
    setErrors(found);
    if (found.length > 0) {
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setSubmitting(true);

    const custom_answers: Record<string, string> = {};
    customQuestions.forEach((q) => {
      const answer = form[q.key].trim();
      if (answer) custom_answers[q.text as string] = answer;
    });

    const item = {
      id: newQueueId(),
      slug,
      // Stamped on the device, so the true sign-in time survives a late sync.
      client_captured_at: new Date().toISOString(),
      queued_at: new Date().toISOString(),
      payload: {
        _first_name: form.first_name.trim(),
        _last_name: form.last_name.trim() || null,
        _email: form.email.trim() || null,
        _phone: digits(form.phone) || null,
        _working_with_agent: form.working_with_agent ? form.working_with_agent === 'yes' : null,
        _agent_name: form.agent_name.trim() || null,
        _intent: form.intent || null,
        _has_home_to_sell: form.has_home_to_sell || null,
        _timeline: form.timeline || null,
        _lender_status: form.lender_status || null,
        _custom_answers: custom_answers,
        _disclosure_accepted: form.disclosure_accepted,
        _notes: form.notes.trim() || null,
      },
    };

    // Durability first: written to the device before we try the network.
    await enqueueSignIn(item);
    await flushQueue();
    await refreshPending();

    setSubmitting(false);
    setForm(blankForm());
    setErrors([]);
    setDone(true);
  };

  // Thank-you screen resets itself for the next person.
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setDone(false), 10000);
    return () => window.clearTimeout(t);
  }, [done]);

  const agentName = house?.hosting_agent_name || null;

  const queueBadge =
    pending > 0 ? (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
        <span className="flex items-center gap-2 text-foreground">
          <CloudOff className="h-4 w-4 text-gold" />
          {pending} sign-in{pending === 1 ? '' : 's'} waiting to send
        </span>
        <Button size="sm" variant="outline" onClick={retryNow} disabled={retrying}>
          {retrying ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
          Retry
        </Button>
      </div>
    ) : null;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (notFound || !house) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-gold">{tenant.brokerageName}</p>
          <h1 className="mt-3 font-display text-2xl font-semibold text-foreground">This sign-in link is closed</h1>
          <p className="mt-2 text-muted-foreground">Please ask the agent on site for a current link.</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div className="max-w-md">
          <CheckCircle2 className="mx-auto h-16 w-16 text-gold" />
          <h1 className="mt-6 font-display text-3xl font-semibold text-foreground">Thank you for coming by</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            {agentName
              ? `${agentName} will follow up with you shortly. Please enjoy the home.`
              : 'Your host will follow up with you shortly. Please enjoy the home.'}
          </p>
          <p className="mt-6 text-sm text-muted-foreground">{house.address}</p>
          {pending > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">
              Saved on this device — {pending} sign-in{pending === 1 ? '' : 's'} will send when the signal returns.
            </p>
          )}
          <Button variant="outline" className="mt-8" onClick={() => setDone(false)}>
            Sign in the next visitor
          </Button>
        </div>
      </div>
    );
  }

  const price =
    house.list_price != null ? '$' + Math.round(Number(house.list_price)).toLocaleString('en-US') : null;

  return (
    <div className="min-h-screen bg-background">
      <div ref={topRef} />
      {house.cover_photo_url && (
        <div className="relative h-52 w-full overflow-hidden sm:h-72">
          <img src={house.cover_photo_url} alt={house.address} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        </div>
      )}

      <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-6 sm:px-8">
        <p className="text-xs uppercase tracking-[0.28em] text-gold">{tenant.brokerageName}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-foreground">{house.address}</h1>
        <p className="mt-1 text-muted-foreground">
          {[house.city, price].filter(Boolean).join(' · ')}
          {house.mls_number ? ` · MLS ${house.mls_number}` : ''}
        </p>
        <p className="mt-4 text-lg text-foreground">Welcome — please sign in.</p>

        <div className="mt-5 space-y-3">
          {!online && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              <WifiOff className="h-4 w-4" /> No signal right now — sign-ins are saved on this device.
            </div>
          )}
          {queueBadge}
          {errors.length > 0 && (
            <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <ul className="list-inside list-disc space-y-1">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <form
          className="mt-7 space-y-8"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-lg font-medium" htmlFor="first_name">First name</label>
              <Input
                id="first_name"
                autoComplete="off"
                className="h-14 text-lg"
                value={form.first_name}
                onChange={(e) => set('first_name', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-lg font-medium" htmlFor="last_name">Last name</label>
              <Input
                id="last_name"
                autoComplete="off"
                className="h-14 text-lg"
                value={form.last_name}
                onChange={(e) => set('last_name', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-lg font-medium" htmlFor="phone">
                Phone {house.require_phone ? '' : '(optional)'}
              </label>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="(519) 555-0134"
                className="h-14 text-lg"
                value={form.phone}
                onChange={(e) => set('phone', formatPhone(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-lg font-medium" htmlFor="email">Email</label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="off"
                placeholder="you@email.com"
                className="h-14 text-lg"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
              />
            </div>
          </div>

          <ChoiceRow
            label="Are you working with an agent?"
            options={YES_NO_OPTIONS}
            value={form.working_with_agent}
            onChange={(v) => set('working_with_agent', v as '' | 'yes' | 'no')}
          />
          {form.working_with_agent === 'yes' && (
            <div className="space-y-2">
              <label className="text-lg font-medium" htmlFor="agent_name">Their name</label>
              <Input
                id="agent_name"
                autoComplete="off"
                className="h-14 text-lg"
                value={form.agent_name}
                onChange={(e) => set('agent_name', e.target.value)}
              />
            </div>
          )}

          <ChoiceRow
            label="What brings you in today?"
            options={INTENT_OPTIONS.filter((o) => o.value !== 'both' && o.value !== 'neighbour')}
            value={form.intent}
            onChange={(v) => set('intent', v)}
          />

          {customQuestions.map((q) => (
            <div key={q.key} className="space-y-2">
              <label className="text-lg font-medium" htmlFor={q.key}>{q.text}</label>
              <Input
                id={q.key}
                autoComplete="off"
                className="h-14 text-lg"
                value={form[q.key]}
                onChange={(e) => set(q.key, e.target.value)}
              />
            </div>
          ))}


          {house.disclosure_text && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm leading-relaxed text-muted-foreground">{house.disclosure_text}</p>
              <label className="mt-4 flex items-start gap-3 text-base font-medium text-foreground">
                <Checkbox
                  className="mt-0.5 h-6 w-6"
                  checked={form.disclosure_accepted}
                  onCheckedChange={(v) => set('disclosure_accepted', v === true)}
                />
                I have read and accept the above.
              </label>
            </div>
          )}

          <Button type="submit" disabled={submitting} className="h-16 w-full text-xl font-semibold">
            {submitting && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
            Done
          </Button>
        </form>
      </div>
    </div>
  );
}
