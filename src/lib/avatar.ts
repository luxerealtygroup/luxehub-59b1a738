import { supabase } from '@/integrations/supabase/client';

export const AVATAR_BUCKET = 'avatars';

/**
 * profiles.avatar_url stores a path inside the private `avatars` bucket
 * (e.g. "<uid>/headshot.jpg"). Legacy rows may hold a full https URL —
 * those are returned untouched. Everything else is exchanged for a
 * short-lived signed URL so private-bucket headshots render for any
 * signed-in viewer (agents, admins, client portal accounts).
 */
export async function resolveAvatarUrl(avatarUrl: string | null | undefined): Promise<string | null> {
  if (!avatarUrl) return null;
  if (/^https?:\/\//i.test(avatarUrl)) return avatarUrl;
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(avatarUrl, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}
