import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  /** Person being welcomed, e.g. "Roberto". */
  ownerName?: string
  /** Their team / hub name, e.g. "Roberto Real Estate". */
  teamName?: string
  /** Hub address including protocol, e.g. "https://robertorealestate.luxerealtyhub.com". */
  hubUrl?: string
  /** Hostname only, shown in text. */
  hubHost?: string
  /** Activation URL including the token — never a password. */
  activationUrl?: string
  /** Human-readable expiry, e.g. "September 30, 2026". */
  expiresOn?: string
  senderOrgName?: string
  senderEmail?: string
}

const Email = (p: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to {p.teamName ?? 'your hub'} — set your password and sign in</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{p.teamName ?? 'Your hub'}</Heading>
        <Text style={tag}>Welcome</Text>

        <Text style={text}>Hi {p.ownerName ?? 'there'},</Text>

        <Text style={text}>
          Welcome from {p.senderOrgName ?? 'Luxe Realty Group'} — your hub is live at{' '}
          <Link href={p.hubUrl} style={link}>{p.hubHost ?? p.hubUrl ?? ''}</Link>.
        </Text>

        <Text style={text}>
          It is your own private workspace for your pipeline, transactions, client portals,
          weekly goals and reporting — your team's data, visible only to your team.
        </Text>

        <Text style={text}>
          Use the button below to activate your account and choose your own password. We never
          set one for you and never send one by email.
        </Text>

        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button style={button} href={p.activationUrl}>
            Activate my account
          </Button>
        </Section>

        <Text style={small}>
          If the button does not work, copy and paste this link into your browser:
          <br />
          <Link href={p.activationUrl} style={link}>{p.activationUrl}</Link>
        </Text>

        <Text style={small}>
          This link is for you only and expires on {p.expiresOn ?? 'the listed date'}.
        </Text>

        <Text style={footer}>
          Need a hand? Reply to this email or write to{' '}
          <Link href={`mailto:${p.senderEmail ?? 'info@luxerealtygroup.ca'}`} style={link}>
            {p.senderEmail ?? 'info@luxerealtygroup.ca'}
          </Link>{' '}
          and we will help you get started.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Props) => `Welcome to ${d?.teamName ?? 'your hub'} — activate your account`,
  displayName: 'Team owner welcome',
  previewData: {
    ownerName: 'Roberto',
    teamName: 'Roberto Real Estate',
    hubUrl: 'https://robertorealestate.luxerealtyhub.com',
    hubHost: 'robertorealestate.luxerealtyhub.com',
    activationUrl: 'https://robertorealestate.luxerealtyhub.com/join?token=example',
    expiresOn: 'September 30, 2026',
    senderOrgName: 'Luxe Realty Group',
    senderEmail: 'info@luxerealtygroup.ca',
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
