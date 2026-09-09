import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Copy, ExternalLink, Loader2, Lock, Mail, Building2, Settings2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';
import { ListingPicker } from '@/components/openhouse/ListingPicker';
import {
  ReportListing, SEARCH_TEMPLATE_KEY, asListings, isHttpsUrlTemplate, sellerReportUrl,
} from '@/lib/openHouse/reports';

/**
 * Everything the agent needs around the seller's recap: the shareable link once
 * the open house has ended, the competing listings shown on it, and the note
 * that goes out with it.
 */
export function SellerReportSection({
  openHouse,
  onChanged,
}: {
  openHouse: {
    id: string;
    slug: string | null;
    property_address: string;
    ends_at: string | null;
    seller_notes: string | null;
    competing_listings: unknown;
    client_email: string | null;
    client_name: string | null;
  };
  onChanged: () => void;
}) {
  const { isAdmin, isOwner } = useUserRole();
  const [showCompeting, setShowCompeting] = useState(false);
  const [showSearchSetting, setShowSearchSetting] = useState(false);
  const [notes, setNotes] = useState(openHouse.seller_notes || '');
  const [savingNotes, setSavingNotes] = useState(false);

  const ended = !!openHouse.ends_at && new Date(openHouse.ends_at).getTime() < Date.now();
  const url = openHouse.slug ? sellerReportUrl(openHouse.slug) : '';
  const competing = asListings(openHouse.competing_listings);

  const saveNotes = async () => {
    setSavingNotes(true);
    const { error } = await supabase
      .from('open_houses')
      .update({ seller_notes: notes.trim() || null } as never)
      .eq('id', openHouse.id);
    setSavingNotes(false);
    if (error) {
      toast.error('Could not save the notes', { description: error.message });
      return;
    }
    toast.success('Notes saved');
    onChanged();
  };

  const saveCompeting = async (next: ReportListing[]) => {
    const { error } = await supabase
      .from('open_houses')
      .update({ competing_listings: next as never } as never)
      .eq('id', openHouse.id);
    if (error) {
      toast.error('Could not save the listings', { description: error.message });
      return;
    }
    onChanged();
  };

  const sendToSeller = () => {
    const subject = `Your open house report — ${openHouse.property_address}`;
    const body =
      `Hi ${openHouse.client_name || 'there'},\n\n` +
      `Here is the full report from the open house at ${openHouse.property_address}, including who came through, ` +
      `what they said about the price and condition, and what we are competing with:\n\n${url}\n\n` +
      `Happy to walk you through it whenever suits.\n\nBest regards`;
    window.location.href =
      `mailto:${openHouse.client_email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Seller report</h2>
        {(isAdmin || isOwner) && (
          <Button variant="outline" size="sm" onClick={() => setShowSearchSetting(true)}>
            <Settings2 className="mr-1.5 h-4 w-4" /> Home search link
          </Button>
        )}
      </div>

      {!ended ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" /> The report becomes shareable once this open house's end time has passed.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(url); toast.success('Link copied'); }}>
            <Copy className="mr-1.5 h-4 w-4" /> Copy link
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-4 w-4" /> Open report
            </a>
          </Button>
          <Button size="sm" onClick={sendToSeller}>
            <Mail className="mr-1.5 h-4 w-4" /> Send to seller
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        The report shows totals only — no visitor's name, phone or email ever appears on it.
      </p>

      <div className="space-y-2">
        <Label>Notes from the day</Label>
        <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What you'd want the seller to know." />
        <Button size="sm" variant="outline" onClick={saveNotes} disabled={savingNotes}>
          {savingNotes && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save notes
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <div>
          <p className="text-sm font-medium">What you're competing with</p>
          <p className="text-xs text-muted-foreground">
            {competing.length === 0 ? 'No listings chosen yet.' : `${competing.length} listing${competing.length === 1 ? '' : 's'} on the report.`}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowCompeting(true)}>
          <Building2 className="mr-1.5 h-4 w-4" /> Choose listings
        </Button>
      </div>

      {showCompeting && (
        <Dialog open onOpenChange={(o) => { if (!o) setShowCompeting(false); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>What you're competing with</DialogTitle></DialogHeader>
            <ListingPicker value={competing} onChange={saveCompeting} max={4} />
            <DialogFooter>
              <Button onClick={() => setShowCompeting(false)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {showSearchSetting && (
        <SearchTemplateDialog onClose={() => setShowSearchSetting(false)} />
      )}
    </Card>
  );
}

/** Admin-only: the home search link the buyer report's big button uses. */
function SearchTemplateDialog({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useState(() => {
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', SEARCH_TEMPLATE_KEY)
      .maybeSingle()
      .then(({ data }) => {
        setValue(((data?.value as string) || '').trim());
        setLoading(false);
      });
    return undefined;
  });

  const save = async () => {
    const v = value.trim();
    if (v && !isHttpsUrlTemplate(v)) {
      toast.error('That needs to be a full https link');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('app_settings')
      .upsert([{ key: SEARCH_TEMPLATE_KEY, value: v }], { onConflict: 'org_id,key' });
    setSaving(false);
    if (error) {
      toast.error('Could not save the link', { description: error.message });
      return;
    }
    toast.success('Home search link saved');
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Home search link</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The visitor's "See more homes like this" button uses this. Paste your search page address and use{' '}
            <code>{'{minPrice}'}</code>, <code>{'{maxPrice}'}</code>, <code>{'{beds}'}</code> and <code>{'{city}'}</code>{' '}
            where those values belong. Until it is set, the button stays hidden.
          </p>
          <div className="space-y-1.5">
            <Label>Search address</Label>
            <Input
              value={loading ? '' : value}
              placeholder="https://…/search?min={minPrice}&max={maxPrice}&city={city}"
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
