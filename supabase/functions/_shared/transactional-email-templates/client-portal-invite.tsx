import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { tenant } from '../tenant.ts'

interface Props {
  clientName?: string
  agentName?: string
  inviteUrl: string
}

const Email = ({ clientName = 'there', agentName = 'Your agent', inviteUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {tenant.brokerageName} client portal is ready</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{tenant.brokerageName}</Heading>
        <Text style={tag}>Client Portal Invitation</Text>

        <Text style={text}>Hi {clientName},</Text>
        <Text style={text}>
          {agentName} has invited you to your private {tenant.brokerageName} client portal — a single
          place to follow your transaction, review documents and photos, and message our team
          directly.
        </Text>

        <Section style={{ textAlign: 'center', margin: '32px 0' }}>
          <Button href={inviteUrl} style={button}>Activate your portal</Button>
        </Section>

        <Text style={muted}>
          Or paste this link into your browser:
        </Text>
        <Text style={linkText}>{inviteUrl}</Text>

        <Text style={footer}>
          If you weren't expecting this invitation, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: `Your ${tenant.brokerageName} client portal is ready`,
  displayName: 'Client Portal Invite',
  previewData: {
    clientName: 'Kristen',
    agentName: 'Hana',
    inviteUrl: `${tenant.appUrl}/client-portal/signup?email=client@example.com`,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Helvetica, Arial, sans-serif' }
const container = { padding: '40px', maxWidth: '600px' }
const h1 = { color: '#0a0a0a', fontSize: '22px', fontWeight: 300, letterSpacing: '0.24em', margin: '0 0 4px 0' }
const tag = { color: '#C9A84C', fontSize: '11px', letterSpacing: '0.28em', textTransform: 'uppercase' as const, margin: '0 0 28px 0' }
const text = { color: '#0a0a0a', fontSize: '14px', lineHeight: '22px', margin: '0 0 14px 0' }
const muted = { color: '#787878', fontSize: '12px', margin: '20px 0 4px 0' }
const linkText = { color: '#0a0a0a', fontSize: '12px', wordBreak: 'break-all' as const, margin: '0 0 24px 0' }
const button = { backgroundColor: '#0a0a0a', color: '#ffffff', padding: '14px 28px', borderRadius: '4px', fontSize: '13px', letterSpacing: '0.14em', textTransform: 'uppercase' as const, textDecoration: 'none' }
const footer = { color: '#787878', fontSize: '11px', marginTop: '28px', borderTop: '1px solid #eaeaea', paddingTop: '16px' }