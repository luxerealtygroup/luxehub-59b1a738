import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { resolveCaller, sharedCorsHeaders as corsHeaders } from '../_shared/auth.ts'
import { template } from '../_shared/transactional-email-templates/open-house-feedback.tsx'

// Renders the open house report email exactly as it will be sent, so the agent
// can review it before confirming. Staff only; renders one template; sends nothing.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const caller = await resolveCaller(req)
  if (!caller) return json({ error: 'Unauthorized' }, 401)
  if (!caller.isStaff) return json({ error: 'Forbidden' }, 403)

  let data: Record<string, unknown>
  try {
    const body = await req.json()
    data = body?.templateData && typeof body.templateData === 'object' ? body.templateData : null
    if (!data) return json({ error: 'templateData is required' }, 400)
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  try {
    const html = await renderAsync(React.createElement(template.component, data as never))
    const subject = typeof template.subject === 'function' ? template.subject(data as never) : template.subject
    return json({ subject, html })
  } catch (e) {
    console.error('render-report-preview failed', (e as Error).message)
    return json({ error: 'Could not render the report' }, 500)
  }
})
