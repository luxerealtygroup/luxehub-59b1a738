import { supabase } from '@/integrations/supabase/client';

/**
 * Shared plumbing for putting an agent-generated document (an open house
 * recap, a finished CMA) into a client's portal Documents shelf.
 *
 * Nothing here ever runs on its own — an agent always presses the button.
 * The portal's own insert trigger handles the client's in-portal notification
 * and the "a new document is waiting" email, and it stays silent when the
 * client has never activated their portal.
 */

const BUCKET = 'portal-documents';

export interface PortalOption {
  id: string;
  full_name: string | null;
  email: string | null;
  /** Null until the client has activated (claimed) their portal login. */
  user_id: string | null;
}

export interface PortalPropertyOption {
  id: string;
  address: string | null;
  mls_number: string | null;
}

export async function loadPortalOptions(): Promise<PortalOption[]> {
  const { data, error } = await supabase
    .from('client_accounts')
    .select('id, full_name, email, user_id')
    .order('full_name', { ascending: true });
  if (error) throw error;
  return (data || []) as PortalOption[];
}

export async function loadPortalProperties(portalId: string): Promise<PortalPropertyOption[]> {
  const { data, error } = await supabase
    .from('portal_properties')
    .select('id, address, mls_number')
    .eq('portal_id', portalId);
  if (error) throw error;
  return (data || []) as PortalPropertyOption[];
}

const squash = (s: string | null | undefined) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Best guess at which portal belongs to this client, by email then by name. */
export function matchPortal(
  portals: PortalOption[],
  email?: string | null,
  name?: string | null,
): PortalOption | undefined {
  if (email) {
    const byEmail = portals.find(p => (p.email || '').toLowerCase() === email.toLowerCase());
    if (byEmail) return byEmail;
  }
  if (name && squash(name)) {
    return portals.find(p => squash(p.full_name) === squash(name));
  }
  return undefined;
}

/** Best guess at which property on the portal this document is about. */
export function matchProperty(
  properties: PortalPropertyOption[],
  address?: string | null,
): PortalPropertyOption | undefined {
  if (!address || !squash(address)) return undefined;
  return properties.find(p => squash(p.address) === squash(address));
}

export function safeFileName(base: string) {
  return `${base.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '')}.pdf`;
}

export interface DeliverArgs {
  portalId: string;
  /** Null attaches the document to the portal as a whole. */
  propertyId: string | null;
  blob: Blob;
  fileName: string;
  /** Client-facing title, e.g. "Open house report — 12 King St — Sep 14, 2026". */
  displayName: string;
  /**
   * 'replace' — a correction to the same thing: the earlier file is swapped out.
   * 'version' — a revision the client must be told about: the earlier document
   * stays in their history and this one becomes the current version.
   */
  versionMode?: 'replace' | 'version';
  /** Groups versions together, e.g. 'cma' for a market analysis. */
  docKind?: 'cma' | 'open_house' | null;
  /** A previous send of the same thing (used by 'replace'). */
  replaceDocumentId?: string | null;
}

export interface DeliverResult {
  documentId: string;
  /** False when the client has not activated their portal — nothing was emailed. */
  clientActivated: boolean;
  replaced: boolean;
  versionNumber: number;
  versionGroupId: string;
}

/** The current document of this kind for this portal/property, if any. */
async function findCurrentVersion(portalId: string, propertyId: string | null, docKind: string) {
  let q = supabase
    .from('portal_documents')
    .select('id, version_group_id, version_number')
    .eq('portal_id', portalId)
    .eq('doc_kind', docKind)
    .eq('is_current_version', true)
    .order('version_number', { ascending: false })
    .limit(1);
  q = propertyId ? q.eq('property_id', propertyId) : q.is('property_id', null);
  const { data } = await q.maybeSingle();
  return data as { id: string; version_group_id: string | null; version_number: number } | null;
}

export async function deliverDocumentToPortal(args: DeliverArgs): Promise<DeliverResult> {
  const { portalId, propertyId, blob, fileName, displayName } = args;
  const versionMode = args.versionMode ?? 'replace';
  const docKind = args.docKind ?? null;

  const { data: account, error: accountErr } = await supabase
    .from('client_accounts')
    .select('user_id')
    .eq('id', portalId)
    .maybeSingle();
  if (accountErr) throw accountErr;

  let replaced = false;
  let versionNumber = 1;
  let versionGroupId: string | null = null;
  let previousCurrentId: string | null = null;

  if (versionMode === 'version' && docKind) {
    const current = await findCurrentVersion(portalId, propertyId, docKind);
    if (current) {
      versionGroupId = current.version_group_id ?? current.id;
      versionNumber = (current.version_number || 1) + 1;
      previousCurrentId = current.id;
    }
  } else if (args.replaceDocumentId) {
    // A correction: swap the earlier file out entirely, keeping its place in
    // any version history it already belonged to.
    const { data: prev } = await supabase
      .from('portal_documents')
      .select('id, file_path, portal_id, version_group_id, version_number')
      .eq('id', args.replaceDocumentId)
      .maybeSingle();
    // Never touch a document belonging to a different client's portal.
    if (prev && prev.portal_id === portalId) {
      versionGroupId = (prev as any).version_group_id ?? null;
      versionNumber = (prev as any).version_number || 1;
      await supabase.storage.from(BUCKET).remove([prev.file_path]);
      await supabase.from('portal_documents').delete().eq('id', prev.id);
      replaced = true;
    }
  }

  const path = `${portalId}/${crypto.randomUUID()}_${fileName}`;
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'application/pdf' });
  if (up.error) throw up.error;

  const { data: { user } } = await supabase.auth.getUser();
  const { data: inserted, error } = await supabase
    .from('portal_documents')
    .insert({
      portal_id: portalId,
      file_name: fileName,
      display_name: displayName,
      file_path: path,
      file_type: 'application/pdf',
      file_size: blob.size,
      uploaded_by: user?.id,
      property_id: propertyId,
      is_internal: false,
      source: 'transaction',
      doc_kind: docKind,
      version_group_id: versionGroupId,
      version_number: versionNumber,
      is_current_version: true,
    } as any)
    .select('id, version_group_id')
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }

  const newId = inserted.id as string;
  const group = ((inserted as any).version_group_id as string | null) ?? newId;
  if (!(inserted as any).version_group_id) {
    await supabase.from('portal_documents').update({ version_group_id: group } as any).eq('id', newId);
  }

  // Only once the new version is safely stored does the old one stop being current.
  if (previousCurrentId) {
    await supabase
      .from('portal_documents')
      .update({ is_current_version: false, superseded_at: new Date().toISOString() } as any)
      .eq('id', previousCurrentId);
  }

  return {
    documentId: newId,
    clientActivated: !!account?.user_id,
    replaced,
    versionNumber,
    versionGroupId: group,
  };
}

