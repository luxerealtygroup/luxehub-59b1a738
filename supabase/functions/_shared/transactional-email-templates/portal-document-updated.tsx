import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { tenant } from '../tenant.ts'

const PORTAL_URL = `${tenant.appUrl}/client-portal`

interface Props {
  clientName?: string
  fileName?: string
  /** e.g. "comparative market analysis" */
  kindLabel?: string
  versionNumber?: number
}

// A revision the client must be told about. Never contains the document itself.
const Email = ({ clientName = 'there', kindLabel = 'document', versionNumber }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {kindLabel} has been updated</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{tenant.brokerageName}</Heading>
        <Text style={tag}>Updated Document</Text>

        <Text style={text}>Hi {clientName},</Text>
        <Text style={text}>
          Your {kindLabel} has been updated{versionNumber ? <> — this is version {versionNumber}</> : null}.
          Sign in to your client portal to read the current version. Every earlier version is still
          there, so you can see how it has changed.
        </Text>

        <Section style={{ textAlign: 'center', margin: '32px 0' }}>
          <Button href={PORTAL_URL} style={button}>View the update</Button>
        </Section>

        <Text style={footer}>
          Questions about what changed? Reply to your agent in the portal and they will walk you through it.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Props) =>
    data?.kindLabel === 'comparative market analysis'
      ? 'Your comparative market analysis has been updated'
      : 'A document in your client portal has been updated',
  displayName: 'Portal — Document Updated',
  previewData: { clientName: 'Kristen', kindLabel: 'comparative market analysis', versionNumber: 2 },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Helvetica, Arial, sans-serif' }
const container = { padding: '40px', maxWidth: '600px' }
const h1 = { color: '#0a0a0a', fontSize: '22px', fontWeight: 300, letterSpacing: '0.24em', margin: '0 0 4px 0' }
const tag = { color: '#C9A84C', fontSize: '11px', letterSpacing: '0.28em', textTransform: 'uppercase' as const, margin: '0 0 28px 0' }
const text = { color: '#0a0a0a', fontSize: '14px', lineHeight: '22px', margin: '0 0 14px 0' }
const button = { backgroundColor: '#0a0a0a', color: '#ffffff', padding: '14px 28px', borderRadius: '4px', fontSize: '13px', letterSpacing: '0.14em', textTransform: 'uppercase' as const, textDecoration: 'none' }
const footer = { color: '#787878', fontSize: '11px', marginTop: '28px', borderTop: '1px solid #eaeaea', paddingTop: '16px' }
