import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ESCALATION_ADMIN_EMAIL =
  Deno.env.get('ESCALATION_ADMIN_EMAIL') || 'info@luxerealtygroup.ca';
const ESCALATION_ADMIN_USER_ID =
  Deno.env.get('ESCALATION_ADMIN_USER_ID') || '64f1aefc-f55b-4987-95d4-4bef67c06781';
const APP_URL = Deno.env.get('APP_URL') || 'https://luxehub.lovable.app';

const SYSTEM_PROMPT = `You are the LUXEhub Support Assistant, an AI helper for the LUXEhub real-estate platform used by LUXE Realty Group.

Users chatting with you are either:
- REALTORS/AGENTS (using the agent dashboard: Pipeline, Transactions/Commissions, Goals, 4-1-1, Reports, Business Planning, CMA Boss, Submissions, Client Portals, Nominations, Follow Up Boss sync, Google Calendar, Asana), or
- CLIENTS (using the client portal to view their transaction timeline, documents, photos, tasks, and message their agent).

Your job:
1. Greet warmly, then ask focused questions to diagnose the issue.
2. Try to resolve common issues yourself with clear, step-by-step guidance (e.g. clearing browser cache, refreshing, re-linking a FUB contact, checking notification settings).
3. If you cannot resolve it in a few turns, or the user asks for a human, escalate.

To escalate, respond with a normal helpful message AND include this line on its own at the end of the message:
[[ESCALATE: <one-sentence reason>]]

Also, when you have enough context, include a short one-line ticket subject on its own line as:
[[SUBJECT: <short subject>]]

Keep responses concise (2-4 short paragraphs max). Use plain language. Never invent features that don't exist. If you don't know, say so and offer to escalate.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401);
    const userId = claims.claims.sub as string;
    const userEmail = (claims.claims.email as string) || 'unknown@luxe';

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'send'); // 'send' | 'escalate'
    let ticketId: string | null = body.ticket_id ? String(body.ticket_id) : null;
    const message = String(body.message ?? '').trim();
    const context = (body.context ?? {}) as { route?: string; user_type?: string };

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Determine user_type: client if they own a client_accounts row, otherwise realtor
    let userType: 'client' | 'realtor' = 'realtor';
    if (context.user_type === 'client' || context.user_type === 'realtor') {
      userType = context.user_type;
    } else {
      const { data: clientRow } = await admin
        .from('client_accounts')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      if (clientRow) userType = 'client';
    }

    // Fetch or create the ticket
    let ticket: any = null;
    if (ticketId) {
      const { data } = await admin
        .from('support_tickets')
        .select('*')
        .eq('id', ticketId)
        .maybeSingle();
      if (!data || data.user_id !== userId) return json({ error: 'Ticket not found' }, 404);
      ticket = data;
    } else {
      const { data, error } = await admin
        .from('support_tickets')
        .insert({
          user_id: userId,
          user_email: userEmail,
          user_type: userType,
          context_route: context.route || null,
          status: 'ai_active',
        })
        .select()
        .single();
      if (error) {
        console.error('Create ticket failed:', error);
        return json({ error: 'Failed to open ticket' }, 500);
      }
      ticket = data;
      ticketId = data.id;

      // Seed system message with context
      await admin.from('support_messages').insert({
        ticket_id: ticketId,
        sender_type: 'system',
        content: `Ticket opened by ${userType} ${userEmail}${
          context.route ? ` from ${context.route}` : ''
        }.`,
      });
    }

    // Direct human escalation from client (no AI turn)
    if (action === 'escalate') {
      const reason = message || 'User requested to speak with a human.';
      await escalate(admin, ticket, reason, null, userEmail);
      return json({ ok: true, ticket_id: ticketId, escalated: true });
    }

    if (!message) return json({ error: 'Message required' }, 400);
    if (message.length > 4000) return json({ error: 'Message too long' }, 400);

    // Persist user message
    await admin.from('support_messages').insert({
      ticket_id: ticketId,
      sender_type: 'user',
      sender_user_id: userId,
      content: message,
    });

    // Load transcript for the model
    const { data: history } = await admin
      .from('support_messages')
      .select('sender_type, content')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...(history || []).map((m: any) => ({
        role:
          m.sender_type === 'user'
            ? 'user'
            : m.sender_type === 'ai'
            ? 'assistant'
            : 'system',
        content: m.content,
      })),
    ];

    if (!LOVABLE_API_KEY) {
      return json({ error: 'LOVABLE_API_KEY not configured' }, 500);
    }

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5.5',
        messages,
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error('AI gateway error:', aiResp.status, errText);
      if (aiResp.status === 429) return json({ error: 'Support AI is temporarily rate-limited. Please try again in a moment.' }, 429);
      if (aiResp.status === 402) return json({ error: 'Support AI credits exhausted. Please contact an admin.' }, 402);
      return json({ error: 'Support AI is unavailable right now.' }, 502);
    }

    const aiJson = await aiResp.json();
    const rawContent: string = aiJson.choices?.[0]?.message?.content ?? '';

    // Parse escalation + subject markers
    let escalateReason: string | null = null;
    let extractedSubject: string | null = null;
    let cleanContent = rawContent;

    const escMatch = rawContent.match(/\[\[ESCALATE:\s*([^\]]+)\]\]/i);
    if (escMatch) {
      escalateReason = escMatch[1].trim();
      cleanContent = cleanContent.replace(escMatch[0], '').trim();
    }
    const subjMatch = rawContent.match(/\[\[SUBJECT:\s*([^\]]+)\]\]/i);
    if (subjMatch) {
      extractedSubject = subjMatch[1].trim().slice(0, 200);
      cleanContent = cleanContent.replace(subjMatch[0], '').trim();
    }

    // Save AI message
    const { data: aiMsg } = await admin
      .from('support_messages')
      .insert({
        ticket_id: ticketId,
        sender_type: 'ai',
        content: cleanContent || '(no response)',
        metadata: { escalate_reason: escalateReason, extracted_subject: extractedSubject },
      })
      .select()
      .single();

    // Update subject if we don't have one
    if (extractedSubject && !ticket.subject) {
      await admin
        .from('support_tickets')
        .update({ subject: extractedSubject })
        .eq('id', ticketId);
      ticket.subject = extractedSubject;
    }

    let escalated = false;
    if (escalateReason) {
      await escalate(admin, ticket, escalateReason, cleanContent, userEmail);
      escalated = true;
    }

    return json({
      ok: true,
      ticket_id: ticketId,
      message: aiMsg,
      escalated,
    });
  } catch (e) {
    console.error('support-chat error:', e);
    return json({ error: (e as Error).message }, 500);
  }
});

async function escalate(
  admin: ReturnType<typeof createClient>,
  ticket: any,
  reason: string,
  aiSummary: string | null,
  userEmail: string,
) {
  if (ticket.status === 'escalated' || ticket.status === 'in_progress') return;

  await admin
    .from('support_tickets')
    .update({
      status: 'escalated',
      escalation_reason: reason,
      escalated_at: new Date().toISOString(),
      assigned_admin_id: ESCALATION_ADMIN_USER_ID,
    })
    .eq('id', ticket.id);

  await admin.from('support_messages').insert({
    ticket_id: ticket.id,
    sender_type: 'system',
    content: `Ticket escalated to a human. Reason: ${reason}`,
    metadata: { ai_summary: aiSummary },
  });

  // In-app notification for the assigned admin
  try {
    await admin.from('notifications').insert({
      user_id: ESCALATION_ADMIN_USER_ID,
      client_name: userEmail,
      message_preview: `New escalated support ticket: ${reason.slice(0, 100)}`,
    });
  } catch (e) {
    console.error('Notification insert failed:', e);
  }

  // Load user's display name for the email
  let userName = userEmail;
  try {
    const { data: prof } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', ticket.user_id)
      .maybeSingle();
    if (prof?.full_name) userName = prof.full_name;
  } catch (_) {}

  // Resolve the organisation this ticket belongs to, so the operator can tell
  // instantly whose team it came from. Falls back to the ticket author's profile.
  let orgName = 'Unknown team';
  try {
    let orgId: string | null = ticket.org_id ?? null;
    if (!orgId && ticket.user_id) {
      const { data: p } = await admin
        .from('profiles').select('org_id').eq('id', ticket.user_id).maybeSingle();
      orgId = (p?.org_id as string | undefined) ?? null;
    }
    if (orgId) {
      const { data: org } = await admin
        .from('organizations').select('name, app_name').eq('id', orgId).maybeSingle();
      if (org) orgName = (org.name as string) || (org.app_name as string) || orgName;
    }
  } catch (e) {
    console.error('Org lookup for escalation email failed:', e);
  }

  // Fire off the transactional email (best-effort)
  try {
    await admin.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'support-ticket-escalated',
        recipientEmail: ESCALATION_ADMIN_EMAIL,
        idempotencyKey: `escalation-${ticket.id}`,
        templateData: {
          orgName,
          userName,
          userEmail,
          userType: ticket.user_type,
          subject: ticket.subject,
          summary: aiSummary,
          reason,
          ticketUrl: `${APP_URL}/dashboard/admin/tickets`,
        },
      },
    });
  } catch (e) {
    console.error('Escalation email failed:', e);
  }

}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}