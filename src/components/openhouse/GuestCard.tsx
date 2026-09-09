import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  ChevronDown, Loader2, Mail, MessageSquare, Trash2, UserCheck, Tablet, CheckCircle2,
  Building2, ExternalLink,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ListingPicker } from '@/components/openhouse/ListingPicker';
import { ReportListing, asListings, buyerReportUrl } from '@/lib/openHouse/reports';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  HOME_TO_SELL_OPTIONS, INTENT_OPTIONS, LENDER_OPTIONS, TIMELINE_OPTIONS, YES_NO_OPTIONS,
} from '@/lib/openHouse/options';
import {
  CONDITION_LABEL, Guest, INTEREST_LABEL, PRICE_LABEL, TEMPERATURE_OPTIONS, Temperature,
  ConditionFeedback, InterestLevel, PriceFeedback,
  fillTemplate, guestName, guestTime, mailtoHref, missingPrompt, smsHref,
} from '@/lib/openHouse/guests';

export interface FollowUpTemplates {
  sms: string;
  emailSubject: string;
  emailBody: string;
}

/** Big, thumb-sized answer chips — this gets used standing up. */
function Chips({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string | null;
  onPick: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(o.value)}
              className={`min-h-[42px] rounded-lg border px-3.5 text-sm font-medium transition-colors ${
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
  );
}

export function GuestCard({
  guest,
  address,
  hostName,
  templates,
  onChanged,
}: {
  guest: Guest;
  address: string;
  hostName: string;
  templates: FollowUpTemplates;
  onChanged: () => void;
}) {
  const [notes, setNotes] = useState(guest.notes || '');
  const [openDetail, setOpenDetail] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => setNotes(guest.notes || ''), [guest.id]);

  const patch = async (values: Partial<Guest>) => {
    setBusy(true);
    const { error } = await supabase.from('open_house_visitors').update(values).eq('id', guest.id);
    setBusy(false);
    if (error) {
      toast.error('Could not save', { description: error.message });
      return;
    }
    onChanged();
  };

  const remove = async () => {
    if (!confirm(`Remove ${guestName(guest)} from this open house?`)) return;
    const { error } = await supabase.from('open_house_visitors').delete().eq('id', guest.id);
    if (error) {
      toast.error('Could not remove', { description: error.message });
      return;
    }
    onChanged();
  };

  const reportLink = guest.report_token ? buyerReportUrl(guest.report_token) : '';
  const values = { first_name: guest.first_name, address, agent_name: hostName, report_link: reportLink };
  const smsBody = fillTemplate(templates.sms, values);
  const emailSubject = fillTemplate(templates.emailSubject, values);
  const emailBody = fillTemplate(templates.emailBody, values);

  const markFollowedUp = (channel: 'sms' | 'email') =>
    patch({ follow_up_sent_at: new Date().toISOString(), follow_up_channel: channel } as Partial<Guest>);

  const saveFeatured = async (next: ReportListing[]) => {
    const { error } = await supabase
      .from('open_house_visitors')
      .update({ featured_listings: next as never } as never)
      .eq('id', guest.id);
    if (error) {
      toast.error('Could not save the listings', { description: error.message });
      return;
    }
    onChanged();
  };

  const prompt = missingPrompt(guest);
  const missingSet = new Set(
    (['intent', 'timeline', 'lender_status', 'has_home_to_sell', 'working_with_agent'] as const).filter(
      (f) => guest[f] === null || guest[f] === undefined || guest[f] === '',
    ),
  );

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold">{guestName(guest)}</p>
            <Badge variant="outline" className="gap-1 text-[10px]">
              {guest.source === 'visitor' ? (
                <><Tablet className="h-3 w-3" /> They signed in</>
              ) : (
                <><UserCheck className="h-3 w-3" /> Agent logged</>
              )}
            </Badge>
            {reportLink && (
          <Button size="sm" variant="outline" asChild>
            <a href={reportLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-4 w-4" /> Homes like this
            </a>
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setShowFeatured(true)}>
          <Building2 className="mr-1.5 h-4 w-4" /> Feature listings
        </Button>
        {guest.follow_up_sent_at && (
              <Badge className="gap-1 border-success/30 bg-success/15 text-success text-[10px]">
                <CheckCircle2 className="h-3 w-3" /> Followed up
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[guest.phone, guest.email].filter(Boolean).join(' · ') || 'No contact details yet'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-xs text-muted-foreground">{guestTime(guest)}</span>
          <Button size="icon" variant="ghost" onClick={remove} aria-label="Remove guest">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Temperature — set before they leave */}
      <div className="flex gap-2">
        {TEMPERATURE_OPTIONS.map((t) => {
          const on = guest.temperature === t.value;
          const tone =
            t.value === 'hot' ? 'bg-destructive text-destructive-foreground'
            : t.value === 'warm' ? 'bg-gold text-background'
            : 'bg-muted-foreground text-background';
          return (
            <button
              key={t.value}
              type="button"
              aria-pressed={on}
              disabled={busy}
              onClick={() => patch({ temperature: (on ? null : t.value) as Temperature | null })}
              className={`min-h-[44px] flex-1 rounded-lg border text-sm font-semibold transition-colors ${
                on ? `${tone} border-transparent` : 'border-border bg-background text-muted-foreground hover:border-gold/60'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {prompt && (
        <p className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-foreground">
          {prompt}
        </p>
      )}

      {/* Two-tap fills for whatever is still unknown */}
      <div className="space-y-3">
        {missingSet.has('intent') && (
          <Chips label="Buying or selling?" options={INTENT_OPTIONS} value={guest.intent}
            onPick={(v) => patch({ intent: v })} />
        )}
        {missingSet.has('timeline') && (
          <Chips label="Timeline" options={TIMELINE_OPTIONS} value={guest.timeline}
            onPick={(v) => patch({ timeline: v })} />
        )}
        {missingSet.has('lender_status') && (
          <Chips label="Spoken to a lender?" options={LENDER_OPTIONS} value={guest.lender_status}
            onPick={(v) => patch({ lender_status: v })} />
        )}
        {missingSet.has('has_home_to_sell') && (
          <Chips label="Home to sell?" options={HOME_TO_SELL_OPTIONS} value={guest.has_home_to_sell}
            onPick={(v) => patch({ has_home_to_sell: v })} />
        )}
        {missingSet.has('working_with_agent') && (
          <Chips
            label="Working with an agent?"
            options={YES_NO_OPTIONS}
            value={guest.working_with_agent == null ? null : guest.working_with_agent ? 'yes' : 'no'}
            onPick={(v) => patch({ working_with_agent: v === 'yes' })}
          />
        )}
      </div>

      {/* Known answers, at a glance */}
      <div className="flex flex-wrap gap-1.5">
        {!missingSet.has('intent') && guest.intent && (
          <Badge variant="secondary">{guest.intent.replace(/_/g, ' ')}</Badge>
        )}
        {!missingSet.has('timeline') && guest.timeline && (
          <Badge variant="secondary">{guest.timeline.replace(/_/g, ' ')}</Badge>
        )}
        {!missingSet.has('lender_status') && guest.lender_status && (
          <Badge variant="secondary">{guest.lender_status.replace(/_/g, ' ')}</Badge>
        )}
        {!missingSet.has('has_home_to_sell') && guest.has_home_to_sell && (
          <Badge variant="secondary">Home to sell: {guest.has_home_to_sell}</Badge>
        )}
        {!missingSet.has('working_with_agent') && guest.working_with_agent != null && (
          <Badge variant="secondary">
            {guest.working_with_agent ? `Has an agent${guest.agent_name ? ` (${guest.agent_name})` : ''}` : 'No agent'}
          </Badge>
        )}
        {guest.interest_level && <Badge variant="outline">Interest: {INTEREST_LABEL[guest.interest_level]}</Badge>}
        {guest.price_feedback && <Badge variant="outline">{PRICE_LABEL[guest.price_feedback]}</Badge>}
        {guest.condition_feedback && <Badge variant="outline">{CONDITION_LABEL[guest.condition_feedback]}</Badge>}
      </div>

      {/* Follow-up: the device's own apps, nothing to pay for */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!guest.phone}
          asChild={!!guest.phone}
          onClick={guest.phone ? () => markFollowedUp('sms') : undefined}
        >
          {guest.phone ? (
            <a href={smsHref(guest.phone, smsBody)}>
              <MessageSquare className="mr-1.5 h-4 w-4" /> Text
            </a>
          ) : (
            <span><MessageSquare className="mr-1.5 inline h-4 w-4" /> Text</span>
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!guest.email}
          asChild={!!guest.email}
          onClick={guest.email ? () => markFollowedUp('email') : undefined}
        >
          {guest.email ? (
            <a href={mailtoHref(guest.email, emailSubject, emailBody)}>
              <Mail className="mr-1.5 h-4 w-4" /> Email
            </a>
          ) : (
            <span><Mail className="mr-1.5 inline h-4 w-4" /> Email</span>
          )}
        </Button>
        {reportLink && (
          <Button size="sm" variant="outline" asChild>
            <a href={reportLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-4 w-4" /> Homes like this
            </a>
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setShowFeatured(true)}>
          <Building2 className="mr-1.5 h-4 w-4" /> Feature listings
        </Button>
        {guest.follow_up_sent_at && (
          <span className="self-center text-xs text-muted-foreground">
            {guest.follow_up_channel === 'sms' ? 'Texted' : 'Emailed'}{' '}
            {new Date(guest.follow_up_sent_at).toLocaleString()}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpenDetail((o) => !o)}
        aria-expanded={openDetail}
        className="flex w-full items-center justify-between rounded-md px-1 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        Feedback and notes
        <ChevronDown className={`h-4 w-4 transition-transform ${openDetail ? 'rotate-180' : ''}`} />
      </button>

      {openDetail && (
        <div className="space-y-3 border-t border-border pt-3">
          <Chips
            label="Interest level"
            options={(Object.keys(INTEREST_LABEL) as InterestLevel[]).map((k) => ({ value: k, label: INTEREST_LABEL[k] }))}
            value={guest.interest_level}
            onPick={(v) => patch({ interest_level: v as InterestLevel })}
          />
          <Chips
            label="Price feedback"
            options={(Object.keys(PRICE_LABEL) as PriceFeedback[]).map((k) => ({ value: k, label: PRICE_LABEL[k] }))}
            value={guest.price_feedback}
            onPick={(v) => patch({ price_feedback: v as PriceFeedback })}
          />
          <Chips
            label="Condition feedback"
            options={(Object.keys(CONDITION_LABEL) as ConditionFeedback[]).map((k) => ({ value: k, label: CONDITION_LABEL[k] }))}
            value={guest.condition_feedback}
            onPick={(v) => patch({ condition_feedback: v as ConditionFeedback })}
          />
          {guest.custom_answers && Object.keys(guest.custom_answers).length > 0 && (
            <div className="space-y-1 text-sm">
              {Object.entries(guest.custom_answers).map(([q, a]) => (
                <p key={q}><span className="text-muted-foreground">{q}: </span>{a}</p>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Notes</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if ((notes.trim() || null) !== (guest.notes || null)) patch({ notes: notes.trim() || null });
              }}
            />
          </div>
          {busy && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</p>}
        </div>
      )}
    </Card>
  );
}
