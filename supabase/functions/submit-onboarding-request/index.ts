import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

// PUBLIC endpoint (verify_jwt = false): this backs the /get-started form, which
// is filled in by people who have no account. It never returns data — it only
// accepts a submission. Abuse is bounded by:
//   - the BEFORE INSERT rate-limit trigger on public.onboarding_requests
//     (max 3/day per email, max 20/hour overall)
//   - strict field validation and length caps below
//   - a honeypot field that real users never fill in

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t) return null
  return t.slice(0, max)
}

const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server configuration error' }, 500)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request' }, 400)
  }

  // Honeypot: hidden field, only bots fill it. Pretend success.
  if (str(body.company_website_confirm, 200)) return json({ ok: true })

  const contactName = str(body.contactName, 120)
  const businessName = str(body.businessName, 160)
  const email = str(body.email, 255)?.toLowerCase() ?? null

  const missing: string[] = []
  if (!contactName) missing.push('name')
  if (!businessName) missing.push('business name')
  if (!email || !EMAIL_RE.test(email)) missing.push('a valid email')
  if (missing.length) return json({ error: `Please provide ${missing.join(', ')}.` }, 400)

  const slackAdminEmail = str(body.slackAdminEmail, 255)?.toLowerCase() ?? null
  if (slackAdminEmail && !EMAIL_RE.test(slackAdminEmail)) {
    return json({ error: 'Please enter a valid Slack admin email.' }, 400)
  }

  const record = {
    contact_name: contactName,
    business_name: businessName,
    legal_name: str(body.legalName, 200),
    email,
    phone: str(body.phone, 40),
    website: str(body.website, 255),
    desired_domain: str(body.desiredDomain, 255),
    logo_path: str(body.logoPath, 500),
    team_size: str(body.teamSize, 60),
    service_area: str(body.serviceArea, 200),
    slack_admin_name: str(body.slackAdminName, 120),
    slack_admin_email: slackAdminEmail,
    uses_fub: bool(body.usesFub),
    uses_stripe: bool(body.usesStripe),
    uses_asana: bool(body.usesAsana),
    extra_notes: str(body.extraNotes, 2000),
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const { data, error } = await supabase
    .from('onboarding_requests')
    .insert(record)
    .select('id')
    .single()

  if (error) {
    console.error('onboarding insert failed:', error.message)
    // Rate-limit trigger raises a friendly message; surface it as 429.
    if (/Too many requests/i.test(error.message)) return json({ error: error.message }, 429)
    return json({ error: 'We could not save your request. Please try again.' }, 500)
  }

  // Notify the owner. Failure here must not lose the submission.
  try {
    await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'onboarding-request',
        idempotencyKey: `onboarding-${data.id}`,
        templateData: {
          contactName: record.contact_name,
          businessName: record.business_name,
          legalName: record.legal_name,
          email: record.email,
          phone: record.phone,
          website: record.website,
          desiredDomain: record.desired_domain,
          teamSize: record.team_size,
          serviceArea: record.service_area,
          slackAdminName: record.slack_admin_name,
          slackAdminEmail: record.slack_admin_email,
          usesFub: record.uses_fub,
          usesStripe: record.uses_stripe,
          usesAsana: record.uses_asana,
          extraNotes: record.extra_notes,
          logoPath: record.logo_path,
          requestId: data.id,
        },
      },
    })
  } catch (e) {
    console.error('onboarding notification email failed:', (e as Error).message)
  }

  return json({ ok: true, id: data.id })
})
