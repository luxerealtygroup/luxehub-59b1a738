import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { tenant } from '../tenant.ts'

interface Props {
  clientName?: string
  signInUrl: string
}

const Email = ({ clientName = 'there', signInUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {tenant.brokerageName} portal sign-in link</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{tenant.brokerageName}</Heading>
        <Text style={tag}>Client Portal Sign In</Text>

        <Text style={text}>Hi {clientName},</Text>
        <Text style={text}>
          Here is your sign-in link for your {tenant.brokerageName} client portal. It can be used
          once and expires shortly, so open it on the device you want to sign in on.
        </Text>

        <Section style={{ textAlign: 'center', margin: '32px 0' }}>
          <Button href={signInUrl} style={button}>Sign in to your portal</Button>
        </Section>

        <Text style={muted}>Or paste this link into your browser:</Text>
        <Text style={linkText}>{signInUrl}</Text>

        <Text style={footer}>
          If you didn't request this, you can safely ignore this email — nothing has changed.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: `Your ${tenant.brokerageName} portal sign-in link`,
  displayName: 'Client Portal Sign-In Link',
  previewData: {
    clientName: 'Kristen',
    signInUrl: `${tenant.appUrl}/client-portal`,
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
