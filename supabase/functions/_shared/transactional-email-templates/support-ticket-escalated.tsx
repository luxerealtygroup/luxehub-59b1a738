import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { tenant } from '../tenant.ts'

interface Props {
  userName?: string
  userEmail: string
  userType: 'realtor' | 'client'
  subject?: string
  summary?: string
  reason?: string
  ticketUrl: string
}

const Email = ({
  userName = 'A user',
  userEmail,
  userType,
  subject,
  summary,
  reason,
  ticketUrl,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New escalated support ticket from {userName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{tenant.appName} Support</Heading>
        <Text style={tag}>Ticket Escalated to Human</Text>

        <Text style={text}>
          A new support ticket has been escalated and requires your attention.
        </Text>

        <Section style={box}>
          <Text style={label}>From</Text>
          <Text style={value}>{userName} ({userType})</Text>
          <Text style={label}>Email</Text>
          <Text style={value}>{userEmail}</Text>
          {subject && (
            <>
              <Text style={label}>Subject</Text>
              <Text style={value}>{subject}</Text>
            </>
          )}
          {reason && (
            <>
              <Text style={label}>Escalation reason</Text>
              <Text style={value}>{reason}</Text>
            </>
          )}
          {summary && (
            <>
              <Text style={label}>AI diagnosis summary</Text>
              <Text style={value}>{summary}</Text>
            </>
          )}
        </Section>

        <Section style={{ textAlign: 'center', margin: '32px 0' }}>
          <Button href={ticketUrl} style={button}>Open ticket</Button>
        </Section>

        <Text style={muted}>Or paste this link into your browser:</Text>
        <Text style={linkText}>{ticketUrl}</Text>

        <Text style={footer}>
          This ticket has been auto-assigned to you. You can reassign it from the admin panel.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Props) =>
    `[${tenant.appName} Support] Escalated ticket — ${data.userName || data.userEmail}`,
  displayName: 'Support Ticket Escalated',
  previewData: {
    userName: 'Hana Realtor',
    userEmail: 'hana@example.com',
    userType: 'realtor',
    subject: 'Cannot import FUB contact',
    summary: 'Agent is searching for a contact by email but FUB returns no results. Verified API key is set. Likely a scope or account mismatch.',
    reason: 'AI could not resolve the FUB API error automatically.',
    ticketUrl: `${tenant.appUrl}/dashboard/admin/tickets`,
  },
  to: tenant.supportEmail,
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Helvetica, Arial, sans-serif' }
const container = { padding: '40px', maxWidth: '600px' }
const h1 = { color: '#0a0a0a', fontSize: '22px', fontWeight: 300, letterSpacing: '0.24em', margin: '0 0 4px 0' }
const tag = { color: '#C9A84C', fontSize: '11px', letterSpacing: '0.28em', textTransform: 'uppercase' as const, margin: '0 0 28px 0' }
const text = { color: '#0a0a0a', fontSize: '14px', lineHeight: '22px', margin: '0 0 14px 0' }
const box = { backgroundColor: '#faf7f0', border: '1px solid #eee6cf', borderRadius: '6px', padding: '20px', margin: '20px 0' }
const label = { color: '#787878', fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.14em', margin: '10px 0 2px 0' }
const value = { color: '#0a0a0a', fontSize: '13px', lineHeight: '20px', margin: '0' }
const muted = { color: '#787878', fontSize: '12px', margin: '20px 0 4px 0' }
const linkText = { color: '#0a0a0a', fontSize: '12px', wordBreak: 'break-all' as const, margin: '0 0 24px 0' }
const button = { backgroundColor: '#0a0a0a', color: '#ffffff', padding: '14px 28px', borderRadius: '4px', fontSize: '13px', letterSpacing: '0.14em', textTransform: 'uppercase' as const, textDecoration: 'none' }
const footer = { color: '#787878', fontSize: '11px', marginTop: '28px', borderTop: '1px solid #eaeaea', paddingTop: '16px' }