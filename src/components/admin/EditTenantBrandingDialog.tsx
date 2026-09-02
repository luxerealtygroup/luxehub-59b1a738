/**
 * Edit an existing team's branding.
 *
 * Provisioning was the only place artwork could be attached, which left teams
 * created before their logo arrived stuck on a text wordmark. This edits the
 * same columns and writes to the same private `org-branding` bucket, so the
 * change reaches the team's subdomain immediately — the signed-out
 * `tenant-branding` function reads the row at request time, no rebuild.
 *
 * Permission is the platform-owner one: the RLS policy on `organizations`
 * already restricts cross-org updates to `is_super_admin()`, and the storage
 * policy on the bucket does the same, so nothing here widens access.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Loader2, Trash2, Upload, Wand2 } from 'lucide-react';

export interface EditableOrg {
  id: string;
  name: string;
  app_name: string | null;
  branding_primary_color: string | null;
  branding_text_color: string | null;
  branding_logo_url: string | null;
  branding_mark_url: string | null;
  seat_limit: number | null;
}

/** Relative luminance contrast ratio against white. */
export function contrastOnWhite(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const chan = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
  return Math.round((1.05 / (l + 0.05)) * 100) / 100;
}

/** Darken a brand colour just enough to clear 4.5:1 for small text on white. */
function deriveAccessibleShade(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  let rgb = [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  for (let i = 0; i < 40; i += 1) {
    const candidate = `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
    const ratio = contrastOnWhite(candidate);
    if (ratio && ratio >= 4.5) return candidate;
    rgb = rgb.map((c) => c * 0.94);
  }
  return '#111111';
}

function ContrastReadout({ hex, label }: { hex: string; label: string }) {
  const ratio = hex ? contrastOnWhite(hex) : null;
  if (!ratio) return null;
  const passesSmall = ratio >= 4.5;
  const passesLarge = ratio >= 3;
  return (
    <p className="text-xs text-muted-foreground">
      {label} contrast on white: <span className="font-medium">{ratio}:1</span>{' '}
      {passesSmall
        ? '— passes WCAG AA for small text'
        : passesLarge
          ? '— large text only; use the darker shade for body text and buttons'
          : '— fails WCAG AA; too light for text'}
    </p>
  );
}

interface Props {
  org: EditableOrg | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditTenantBrandingDialog({ org, onOpenChange, onSaved }: Props) {
  const [appName, setAppName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('');
  const [textColor, setTextColor] = useState('');
  const [seatLimit, setSeatLimit] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [markFile, setMarkFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [removeMark, setRemoveMark] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [markPreview, setMarkPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const markRef = useRef<HTMLInputElement>(null);

  // Reset the form whenever a different team is opened.
  useEffect(() => {
    if (!org) return;
    setAppName(org.app_name ?? '');
    setPrimaryColor(org.branding_primary_color ?? '');
    setTextColor(org.branding_text_color ?? '');
    setSeatLimit(org.seat_limit ? String(org.seat_limit) : '');
    setLogoFile(null);
    setMarkFile(null);
    setRemoveLogo(false);
    setRemoveMark(false);
    if (logoRef.current) logoRef.current.value = '';
    if (markRef.current) markRef.current.value = '';

    let cancelled = false;
    const sign = async (path: string | null, set: (v: string | null) => void) => {
      if (!path) return set(null);
      if (path.startsWith('http')) return set(path);
      const { data } = await supabase.storage.from('org-branding').createSignedUrl(path, 3600);
      if (!cancelled) set(data?.signedUrl ?? null);
    };
    void sign(org.branding_logo_url, setLogoPreview);
    void sign(org.branding_mark_url, setMarkPreview);
    return () => {
      cancelled = true;
    };
  }, [org]);

  const upload = async (orgId: string, file: File, kind: 'logo' | 'mark') => {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `${orgId}/${kind}.${ext}`;
    const { error } = await supabase.storage
      .from('org-branding')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw new Error(error.message);
    return path;
  };

  const save = async () => {
    if (!org) return;
    setSaving(true);
    try {
      const patch: Record<string, string | number | null> = {
        app_name: appName.trim() || null,
        branding_primary_color: primaryColor.trim() || null,
        branding_text_color: textColor.trim() || null,
        seat_limit: seatLimit ? Number(seatLimit) : null,
      };

      // Replace: upsert to the same key, so the subdomain picks up the new file.
      if (logoFile) patch.branding_logo_url = await upload(org.id, logoFile, 'logo');
      if (markFile) patch.branding_mark_url = await upload(org.id, markFile, 'mark');

      // Remove: clear the column and delete the object so nothing is orphaned.
      // The UI then falls back to the text wordmark / initials monogram.
      if (removeLogo && !logoFile) {
        patch.branding_logo_url = null;
        if (org.branding_logo_url && !org.branding_logo_url.startsWith('http')) {
          await supabase.storage.from('org-branding').remove([org.branding_logo_url]);
        }
      }
      if (removeMark && !markFile) {
        patch.branding_mark_url = null;
        if (org.branding_mark_url && !org.branding_mark_url.startsWith('http')) {
          await supabase.storage.from('org-branding').remove([org.branding_mark_url]);
        }
      }

      const { error } = await supabase.from('organizations').update(patch).eq('id', org.id);
      if (error) throw new Error(error.message);

      toast.success(`${org.name}'s branding is updated.`);
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the branding.');
    } finally {
      setSaving(false);
    }
  };

  const suggestion = primaryColor ? deriveAccessibleShade(primaryColor) : null;

  return (
    <Dialog open={Boolean(org)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit branding — {org?.name}</DialogTitle>
          <DialogDescription>
            Applies to this team only and takes effect on their address right away.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Hub name</Label>
            <Input
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder={org?.name ?? ''}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Brand colour</Label>
              <div className="flex gap-2">
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#F44336"
                />
                <input
                  type="color"
                  aria-label="Pick brand colour"
                  value={/^#[0-9a-f]{6}$/i.test(primaryColor) ? primaryColor : '#000000'}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-10 w-12 shrink-0 cursor-pointer rounded-md border bg-background"
                />
              </div>
              <ContrastReadout hex={primaryColor} label="Brand" />
            </div>

            <div className="space-y-2">
              <Label>Text / button shade</Label>
              <div className="flex gap-2">
                <Input
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  placeholder="#E51B0D"
                />
                <input
                  type="color"
                  aria-label="Pick text shade"
                  value={/^#[0-9a-f]{6}$/i.test(textColor) ? textColor : '#000000'}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="h-10 w-12 shrink-0 cursor-pointer rounded-md border bg-background"
                />
              </div>
              <ContrastReadout hex={textColor} label="Text" />
              {suggestion && suggestion.toLowerCase() !== textColor.toLowerCase() && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => setTextColor(suggestion)}
                >
                  <Wand2 className="mr-1 h-3 w-3" />
                  Use accessible shade {suggestion}
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Seats</Label>
            <Input
              type="number"
              min={1}
              value={seatLimit}
              onChange={(e) => setSeatLimit(e.target.value)}
              placeholder="1"
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Wide logo</Label>
            {logoPreview && !removeLogo && (
              <div className="flex items-center gap-3 rounded-md border bg-muted/40 p-2">
                <img src={logoPreview} alt="Current logo" className="h-10 w-auto object-contain" />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-destructive"
                  onClick={() => {
                    setRemoveLogo(true);
                    setLogoFile(null);
                    if (logoRef.current) logoRef.current.value = '';
                  }}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Remove
                </Button>
              </div>
            )}
            {removeLogo && (
              <p className="text-xs text-muted-foreground">
                Logo will be removed on save — the hub falls back to a text wordmark.{' '}
                <button type="button" className="underline" onClick={() => setRemoveLogo(false)}>
                  Keep it
                </button>
              </p>
            )}
            <Input
              ref={logoRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                setLogoFile(e.target.files?.[0] ?? null);
                setRemoveLogo(false);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Wide lockup. Shown at its own aspect ratio and never upscaled beyond its real size.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Square mark (optional)</Label>
            {markPreview && !removeMark && (
              <div className="flex items-center gap-3 rounded-md border bg-muted/40 p-2">
                <img src={markPreview} alt="Current mark" className="h-10 w-10 rounded object-contain" />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-destructive"
                  onClick={() => {
                    setRemoveMark(true);
                    setMarkFile(null);
                    if (markRef.current) markRef.current.value = '';
                  }}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Remove
                </Button>
              </div>
            )}
            {removeMark && (
              <p className="text-xs text-muted-foreground">
                Mark will be removed on save — avatars and the favicon use an initials monogram.{' '}
                <button type="button" className="underline" onClick={() => setRemoveMark(false)}>
                  Keep it
                </button>
              </p>
            )}
            <Input
              ref={markRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                setMarkFile(e.target.files?.[0] ?? null);
                setRemoveMark(false);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty when the lockup has no clean square crop — initials are used instead of a
              cropped logo.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Save branding
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EditTenantBrandingDialog;
