import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { ViewAsAgentContext } from '@/hooks/useViewAsAgent';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ThreadParticipants } from '@/components/portal/ThreadParticipants';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { blockPortalWrite, usePortalPreview } from '@/hooks/usePortalPreview';
import { UploadPickers } from '@/components/uploads/UploadPickers';
import { checkFiles, formatFileSize, isImageFile } from '@/lib/uploads';
import {
  MessageCircle,
  Send,
  Headset,
  User,
  Briefcase,
  Lock,
  Eye,
  EyeOff,
  Hash,
  FileText,
  Download,
  RotateCw,
  AlertCircle,
  Camera,
  Check,
  Loader2,
} from 'lucide-react';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';

const BUCKET = 'portal-documents';

type SenderType = 'client' | 'agent' | 'ops';

interface PortalMessage {
  id: string;
  portal_id: string;
  sender_type: SenderType;
  sender_name: string | null;
  sender_user_id?: string | null;
  message_body: string;
  created_at: string;
  is_internal?: boolean;
  source_slack_channel_id?: string | null;
  source_slack_ts?: string | null;
  attachment_document_id?: string | null;
  client_seen_at?: string | null;
  /** Client-only: an optimistic row that has not been confirmed yet. */
  _status?: 'sending' | 'failed';
  _retry?: { body: string; internal: boolean; attachmentId: string | null };
}

interface AttachmentInfo {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  url?: string | null;
}

interface PortalChatPanelProps {
  portalId: string;
  /** 'client' shows client-styled bubbles on the right; 'agent' shows agent messages on the right. */
  viewerRole: 'client' | 'agent';
  /**
   * Optional agent user id to attribute the outgoing message to. When set and
   * the caller is an admin/owner, the edge function stores the message under
   * this agent's name instead of the caller's profile. Falls back to the
   * "View as Agent" context when not provided.
   */
  sendAsAgentId?: string | null;
}

export function PortalChatPanel({ portalId, viewerRole, sendAsAgentId: sendAsAgentIdProp }: PortalChatPanelProps) {
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [internalNote, setInternalNote] = useState(false);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [attachments, setAttachments] = useState<Record<string, AttachmentInfo>>({});
  const [needsHeadshot, setNeedsHeadshot] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const viewCtx = useContext(ViewAsAgentContext);
  const { user } = useAuth();
  const { isPreview } = usePortalPreview();
  const sendAsAgentId =
    viewerRole === 'agent'
      ? sendAsAgentIdProp ??
        (viewCtx?.isViewingAsAgent && viewCtx.viewingAgentId ? viewCtx.viewingAgentId : null)
      : null;
  // Internal markers and the unpublish action are agent-side only, and are
  // hidden in preview-as-client so the preview matches what the client sees.
  const showAgentControls = viewerRole === 'agent' && !isPreview;
  const clientView = isPreview || viewerRole === 'client';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      let query = supabase.from('portal_messages').select('*').eq('portal_id', portalId);
      // RLS already hides internal rows from clients. Preview-as-client runs on
      // the agent's session, so filter explicitly to keep the preview honest.
      if (clientView) query = query.eq('is_internal', false);
      const { data, error } = await query.order('created_at', { ascending: true });
      if (!cancelled) {
        if (error) console.error(error);
        setMessages((data as PortalMessage[]) || []);
        setLoading(false);
      }
      // The client opening the thread is what marks the team's messages seen.
      if (viewerRole === 'client' && !isPreview) {
        await supabase.rpc('mark_portal_messages_seen', { _portal_id: portalId });
      }
    };
    load();

    // Ensure the realtime socket is using the current auth token so RLS
    // authorizes postgres_changes broadcasts to this subscriber.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (sess.session?.access_token) {
        await supabase.realtime.setAuth(sess.session.access_token);
      }
      if (cancelled) return;
      channel = supabase
        .channel(`portal-messages-${portalId}-${viewerRole}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'portal_messages',
            filter: `portal_id=eq.${portalId}`,
          },
          (payload) => {
            setMessages((prev) => {
              const next = payload.new as PortalMessage;
              // Never surface an internal row in a client-facing view.
              if (clientView && next.is_internal) return prev;
              if (prev.some((m) => m.id === next.id)) return prev;
              return [...prev, next];
            });
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'portal_messages',
            filter: `portal_id=eq.${portalId}`,
          },
          (payload) => {
            const next = payload.new as PortalMessage;
            setMessages((prev) => prev.map((m) => (m.id === next.id ? { ...m, ...next } : m)));
          },
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('portal_messages realtime status:', status);
          }
        });
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [portalId, viewerRole, isPreview, clientView]);

  // Headshots for everyone in the thread, so a bubble shows the real person.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('get_portal_participants', { _portal_id: portalId });
      if (cancelled) return;
      const map: Record<string, string | null> = {};
      ((data as any[]) ?? []).forEach((p) => {
        if (p.user_id) map[p.user_id] = p.avatar_url ?? null;
      });
      setAvatars(map);
      if (viewerRole === 'agent' && user?.id) {
        setNeedsHeadshot(map[user.id] === null || map[user.id] === undefined ? !map[user.id] : false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [portalId, viewerRole, user?.id]);

  // Attachment details + signed URLs for anything referenced by a message.
  useEffect(() => {
    const ids = Array.from(
      new Set(messages.map((m) => m.attachment_document_id).filter(Boolean) as string[]),
    ).filter((id) => !attachments[id]);
    if (!ids.length) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('portal_documents')
        .select('id, file_name, file_path, file_type, file_size')
        .in('id', ids);
      if (cancelled || !data) return;
      const next: Record<string, AttachmentInfo> = {};
      for (const d of data as AttachmentInfo[]) {
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(d.file_path, 3600);
        next[d.id] = { ...d, url: signed?.signedUrl ?? null };
      }
      if (!cancelled) setAttachments((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      cancelled = true;
    };
  }, [messages, attachments]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const deliver = useCallback(
    async (tempId: string, body: string, internal: boolean, attachmentId: string | null) => {
      const { data, error } = await supabase.functions.invoke('portal-send-message', {
        body: {
          portal_id: portalId,
          message: body,
          send_as_agent_id: sendAsAgentId ?? undefined,
          is_internal: internal || undefined,
          attachment_document_id: attachmentId ?? undefined,
        },
      });
      const failed = error || (data as any)?.error;
      if (failed) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, _status: 'failed' } : m)),
        );
        return false;
      }
      const inserted = (data as { message?: PortalMessage })?.message;
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        if (inserted?.id && !withoutTemp.some((m) => m.id === inserted.id)) {
          return [...withoutTemp, inserted];
        }
        return withoutTemp;
      });
      return true;
    },
    [portalId, sendAsAgentId],
  );

  const queue = useCallback(
    (body: string, internal: boolean, attachmentId: string | null) => {
      const tempId = `pending-${crypto.randomUUID()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          portal_id: portalId,
          sender_type: viewerRole === 'client' ? 'client' : 'agent',
          sender_name: 'You',
          sender_user_id: user?.id ?? null,
          message_body: body,
          created_at: new Date().toISOString(),
          is_internal: internal,
          attachment_document_id: attachmentId,
          _status: 'sending',
          _retry: { body, internal, attachmentId },
        },
      ]);
      return deliver(tempId, body, internal, attachmentId);
    },
    [deliver, portalId, user?.id, viewerRole],
  );

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    if (blockPortalWrite('Sending messages')) return;
    setSending(true);
    setText('');
    const internal = internalNote;
    setInternalNote(false);
    await queue(body, internal, null);
    setSending(false);
  };

  const retry = async (m: PortalMessage) => {
    if (!m._retry) return;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, _status: 'sending' } : x)));
    await deliver(m.id, m._retry.body, m._retry.internal, m._retry.attachmentId);
  };

  /** Upload a photo or document and post it into the thread as its own bubble. */
  const attach = async (picked: File[]) => {
    if (blockPortalWrite('Sending attachments')) return;
    const { accepted, errors } = checkFiles(picked, { maxSizeMB: 25 });
    errors.forEach((message) =>
      toast({ title: 'File not sent', description: message, variant: 'destructive' }),
    );
    if (!accepted.length) return;
    setUploading(true);
    const internal = internalNote;
    setInternalNote(false);
    for (const file of accepted) {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${portalId}/${crypto.randomUUID()}_${safe}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (up.error) {
        toast({ title: `Upload failed: ${file.name}`, description: up.error.message, variant: 'destructive' });
        continue;
      }
      const { data: doc, error } = await supabase
        .from('portal_documents')
        .insert({
          portal_id: portalId,
          file_name: file.name,
          file_path: path,
          file_type: file.type || null,
          file_size: file.size,
          uploaded_by: user?.id,
          is_internal: internal,
          source: 'transaction',
        })
        .select('id')
        .single();
      if (error || !doc) {
        toast({ title: 'Could not save the file', description: error?.message, variant: 'destructive' });
        continue;
      }
      await queue(file.name, internal, doc.id as string);
    }
    setUploading(false);
  };

  /**
   * Flip a message between internal (agent-only) and client-visible. This is
   * the "unpublish" action for anything pushed in from Slack. RLS blocks the
   * client from reading internal rows, so this is a real visibility change.
   */
  const setVisibility = async (m: PortalMessage, nextInternal: boolean) => {
    if (blockPortalWrite('Changing message visibility')) return;
    const { error } = await supabase
      .from('portal_messages')
      .update({ is_internal: nextInternal })
      .eq('id', m.id);
    if (error) {
      toast({ title: 'Could not update visibility', description: error.message, variant: 'destructive' });
      return;
    }
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, is_internal: nextInternal } : x)));
    toast({
      title: nextInternal ? 'Hidden from client' : 'Now visible to client',
      description: nextInternal
        ? 'This message is internal and no longer shown in the client portal.'
        : 'The client can now see this message.',
    });
  };

  const formatTime = (iso: string) => format(new Date(iso), 'h:mm a');
  const dayLabel = (iso: string) => {
    const d = new Date(iso);
    if (isToday(d)) return 'Today';
    if (isYesterday(d)) return 'Yesterday';
    return format(d, 'EEEE, MMMM d');
  };

  // In a group thread "mine" is the person who actually wrote it, not the side
  // they are on — another agent's or ops' reply stays on the left.
  const isMine = (m: PortalMessage) => {
    if (m.sender_user_id && user?.id) return m.sender_user_id === user.id;
    return (
      (viewerRole === 'client' && m.sender_type === 'client') ||
      (viewerRole === 'agent' && m.sender_type === 'agent')
    );
  };

  // Everyone in the thread sees who wrote and in what capacity, so the client
  // can tell they are talking to a team rather than one person.
  const headerFor = (m: PortalMessage) => {
    if (m.sender_type === 'ops') {
      return {
        icon: <Headset className="h-3.5 w-3.5" />,
        label: `${m.sender_name || 'Operations'} · Operations`,
      };
    }
    if (m.sender_type === 'agent') {
      return {
        icon: <Briefcase className="h-3.5 w-3.5" />,
        label: `${m.sender_name || 'Your Agent'} · Agent`,
      };
    }
    return { icon: <User className="h-3.5 w-3.5" />, label: m.sender_name || 'Client' };
  };

  const initials = (name: string | null) =>
    (name || '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || '?';

  const bubbleClass = (m: PortalMessage) => {
    if (m.is_internal)
      return 'bg-muted/70 text-foreground border border-dashed border-muted-foreground/40';
    if (isMine(m)) return 'bg-primary text-primary-foreground';
    if (m.sender_type === 'ops') return 'bg-amber-500/10 text-foreground border border-amber-500/30';
    return 'bg-background text-foreground border border-border/70';
  };

  const lastSeenMine = [...messages]
    .reverse()
    .find((m) => isMine(m) && m.client_seen_at && !m.is_internal);

  const renderAttachment = (m: PortalMessage) => {
    if (!m.attachment_document_id) return null;
    const a = attachments[m.attachment_document_id];
    if (!a) {
      return (
        <div className="mt-1 flex items-center gap-2 text-xs opacity-70">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading attachment…
        </div>
      );
    }
    const image = isImageFile({ name: a.file_name, type: a.file_type ?? '' } as File);
    if (image && a.url) {
      return (
        <a href={a.url} target="_blank" rel="noopener noreferrer" className="block mt-1">
          <img
            src={a.url}
            alt={a.file_name}
            className="rounded-lg max-h-56 w-auto max-w-full object-cover border border-border/50"
          />
        </a>
      );
    }
    return (
      <a
        href={a.url ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 flex items-center gap-2 rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-foreground hover:bg-muted/60 transition-colors max-w-full"
      >
        <FileText className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium truncate">{a.file_name}</span>
          {a.file_size != null && (
            <span className="block text-[10px] text-muted-foreground">{formatFileSize(a.file_size)}</span>
          )}
        </span>
        <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </a>
    );
  };

  return (
    <Card className="flex flex-col h-[calc(100dvh-14rem)] min-h-[480px] max-h-[720px] luxe-card overflow-hidden">
      <CardHeader className="pb-3 border-b border-border/60 bg-background/70">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <MessageCircle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="eyebrow leading-none">Conversation</p>
            <CardTitle className="font-display text-lg font-semibold tracking-tight mt-1">
              Messages
            </CardTitle>
          </div>
        </div>
      </CardHeader>
      <ThreadParticipants portalId={portalId} viewerRole={viewerRole} />
      <CardContent className="flex-1 flex flex-col min-h-0 p-0 bg-[hsl(38_30%_98%)]">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Loading messages…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 mb-4">
              <MessageCircle className="h-6 w-6" />
            </div>
            <h3 className="font-display text-lg font-semibold tracking-tight mb-1">Start the conversation</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {viewerRole === 'client'
                ? 'Send a message — your agent and the client care team will both see it.'
                : 'Reply to this client — the message will also post to Slack for ops.'}
            </p>
          </div>
        ) : (
          <ScrollArea className="flex-1 px-3 sm:px-6" ref={scrollRef}>
            <div className="py-5 space-y-1">
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const mine = isMine(m);
                const h = headerFor(m);
                const newDay = !prev || !isSameDay(new Date(prev.created_at), new Date(m.created_at));
                // Group consecutive messages from the same person on the same day.
                const runStart =
                  newDay ||
                  !prev ||
                  (prev.sender_user_id ?? prev.sender_name) !== (m.sender_user_id ?? m.sender_name) ||
                  !!prev.is_internal !== !!m.is_internal;
                const avatarUrl = m.sender_user_id ? avatars[m.sender_user_id] : null;

                return (
                  <div key={m.id}>
                    {newDay && (
                      <div className="flex items-center gap-3 my-4">
                        <div className="h-px flex-1 bg-border/60" />
                        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {dayLabel(m.created_at)}
                        </span>
                        <div className="h-px flex-1 bg-border/60" />
                      </div>
                    )}
                    <div
                      className={`flex items-end gap-2 ${runStart ? 'mt-3' : 'mt-0.5'} ${
                        mine ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {!mine &&
                        (runStart ? (
                          <Avatar className="h-8 w-8 shrink-0 ring-2 ring-background">
                            {avatarUrl && <AvatarImage src={avatarUrl} alt={m.sender_name ?? ''} />}
                            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                              {initials(m.sender_name)}
                            </AvatarFallback>
                          </Avatar>
                        ) : (
                          <div className="h-8 w-8 shrink-0" aria-hidden />
                        ))}
                      <div
                        className={`max-w-[85%] sm:max-w-[70%] min-w-0 flex flex-col ${
                          mine ? 'items-end' : 'items-start'
                        }`}
                      >
                        {runStart && !mine && (
                          <span className="text-[11px] font-medium text-muted-foreground mb-1 ml-1">
                            {h.label}
                          </span>
                        )}
                        {runStart && m.is_internal && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground mb-1">
                            <Lock className="h-2.5 w-2.5" /> Internal — client can't see this
                          </span>
                        )}
                        {runStart && showAgentControls && m.source_slack_ts && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground mb-1">
                            <Hash className="h-2.5 w-2.5" /> From Slack
                          </span>
                        )}
                        <div
                          className={`rounded-2xl px-4 py-2.5 shadow-sm w-full ${bubbleClass(m)} ${
                            mine ? 'rounded-br-md' : 'rounded-bl-md'
                          } ${m._status === 'failed' ? 'opacity-70' : ''} ${
                            m._status === 'sending' ? 'opacity-60' : ''
                          }`}
                        >
                          {m.message_body && (
                            <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere] leading-relaxed">
                              {m.message_body}
                            </p>
                          )}
                          {renderAttachment(m)}
                        </div>
                        <div className={`flex flex-wrap items-center gap-2 mt-1 ${mine ? 'mr-1' : 'ml-1'}`}>
                          <p className="text-[10px] tabular-nums text-muted-foreground">
                            {m._status === 'sending'
                              ? 'Sending…'
                              : m._status === 'failed'
                                ? 'Not sent'
                                : formatTime(m.created_at)}
                          </p>
                          {m._status === 'failed' && (
                            <button
                              type="button"
                              onClick={() => retry(m)}
                              className="inline-flex items-center gap-1 text-[10px] font-medium text-destructive hover:underline"
                            >
                              <AlertCircle className="h-2.5 w-2.5" /> Retry
                              <RotateCw className="h-2.5 w-2.5" />
                            </button>
                          )}
                          {showAgentControls && !m._status && (
                            <button
                              type="button"
                              onClick={() => setVisibility(m, !m.is_internal)}
                              className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                            >
                              {m.is_internal ? (
                                <>
                                  <Eye className="h-2.5 w-2.5" /> Make visible to client
                                </>
                              ) : (
                                <>
                                  <EyeOff className="h-2.5 w-2.5" /> Unpublish
                                </>
                              )}
                            </button>
                          )}
                          {viewerRole === 'agent' && lastSeenMine?.id === m.id && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                              <Check className="h-2.5 w-2.5" /> Seen
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        {isPreview ? (
          <div className="p-3 sm:p-4 border-t border-border/60 bg-muted/30 text-center text-xs text-muted-foreground">
            Read-only preview — messaging is disabled.
          </div>
        ) : (
          <form onSubmit={send} className="p-3 sm:p-4 border-t border-border/60 bg-background space-y-2">
            {showAgentControls && needsHeadshot && (
              <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                <Camera className="h-3 w-3" />
                <Link to="/dashboard/settings" className="underline underline-offset-2">
                  Add a headshot to your profile
                </Link>
                so clients see your face here.
              </p>
            )}
            {showAgentControls && (
              <div className="flex items-center gap-2">
                <Switch
                  id="internal-note"
                  checked={internalNote}
                  onCheckedChange={setInternalNote}
                  disabled={sending || uploading}
                />
                <label
                  htmlFor="internal-note"
                  className="text-[11px] font-medium text-muted-foreground inline-flex items-center gap-1 cursor-pointer"
                >
                  <Lock className="h-3 w-3" />
                  Internal note — client can't see this
                </label>
              </div>
            )}
            <div className="flex gap-2">
              <Input
                placeholder={
                  viewerRole === 'client'
                    ? 'Message your team…'
                    : internalNote
                      ? 'Note for the team only…'
                      : 'Reply to the client…'
                }
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={sending}
                className={`rounded-full h-11 px-4 border-border/70 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary transition-colors ${
                  internalNote ? 'bg-muted/60 border-dashed' : ''
                }`}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!text.trim() || sending}
                className="h-11 w-11 rounded-full shadow-gold shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {uploading ? (
                <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Sending attachment…
                </span>
              ) : (
                <UploadPickers onFiles={(f) => void attach(f)} disabled={uploading} size="sm" />
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
