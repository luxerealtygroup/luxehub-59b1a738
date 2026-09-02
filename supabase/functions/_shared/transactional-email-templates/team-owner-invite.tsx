import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  /** Person being invited, e.g. "Gabriele". */
  ownerName?: string
  /** Their own hub / team name, e.g. "Homes Into Reality". */
  teamName?: string
  /** Hostname of their hub, e.g. "homesintoreality.luxerealtyhub.com". */
  hubHost?: string
  /** Full acceptance URL including the token. */
  inviteUrl?: string
  /** Human-readable expiry, e.g. "September 16, 2026". */
  expiresOn?: string
  /** Company that issued the invitation (never an individual's name). */
  senderOrgName?: string
  senderEmail?: string

}

const Email = (p: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {p.teamName ?? 'real estate'} hub is ready — set up your account</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{p.teamName ?? 'Your team'}</Heading>
        <Text style={tag}>Your hub is ready</Text>

        <Text style={text}>Hi {p.ownerName ?? 'there'},</Text>

        <Text style={text}>
          {p.senderOrgName ?? 'LUXE Realty Group'} has set up your own real estate hub for{' '}
          <strong>{p.teamName ?? 'your business'}</strong>. You are being added as the owner of the
          account, which means you control your team, your settings and your data.
        </Text>

        <Text style={text}>
          Your hub lives at <strong>{p.hubHost ?? ''}</strong>. Use the button below to accept the
          invitation and create your password.
        </Text>

        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button style={button} href={p.inviteUrl}>
            Accept invitation
          </Button>
        </Section>

        <Text style={small}>
          If the button does not work, copy and paste this link into your browser:
          <br />
          <Link href={p.inviteUrl} style={link}>{p.inviteUrl}</Link>
        </Text>

        <Text style={small}>
          This invitation is for you only and expires on {p.expiresOn ?? 'the listed date'}. Your
          hub starts empty — nothing is shared with any other team, and no other team can see your
          data.
        </Text>

        <Text style={footer}>
          Questions? Reply to {p.senderEmail ?? 'this email'} and the{' '}
          {p.senderOrgName ?? 'LUXE Realty Group'} team will help you get started.
        </Text>

      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Props) => `Your ${d?.teamName ?? 'real estate'} hub is ready`,
  displayName: 'Team owner invitation',
  previewData: {
    ownerName: 'Gabriele',
    teamName: 'Homes Into Reality',
    hubHost: 'homesintoreality.luxerealtyhub.com',
    inviteUrl: 'https://homesintoreality.luxerealtyhub.com/join?token=example',
    expiresOn: 'September 16, 2026',
    inviterName: 'Kristen Ellis',
    inviterEmail: 'info@luxerealtygroup.ca',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '28px 26px', maxWidth: '560px' }
const h1 = { fontSize: '22px', margin: '0 0 4px', color: '#111111' }
const tag = { fontSize: '13px', color: '#6b7280', margin: '0 0 20px', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }
const text = { fontSize: '15px', lineHeight: '24px', color: '#1f2937', margin: '0 0 14px' }
const small = { fontSize: '13px', lineHeight: '20px', color: '#4b5563', margin: '0 0 14px', wordBreak: 'break-all' as const }
const link = { color: '#111111' }
const button = {
  backgroundColor: '#111111', color: '#ffffff', fontSize: '15px', fontWeight: 600,
  padding: '13px 26px', borderRadius: '6px', textDecoration: 'none', display: 'inline-block',
}
const footer = { fontSize: '13px', lineHeight: '20px', color: '#6b7280', margin: '22px 0 0' }
