import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const PORTAL_URL = 'https://luxerealtyhub.com/client-portal'

interface Props {
  clientName?: string
  fileName?: string
}

const Email = ({ clientName = 'there', fileName }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>A new document is available in your client portal</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>LUXE Realty Group</Heading>
        <Text style={tag}>New Document</Text>

        <Text style={text}>Hi {clientName},</Text>
        <Text style={text}>
          Your agent added {fileName ? <>a new document — <strong>{fileName}</strong> — </> : 'new documents '}
          to your client portal. You can review and download it from the Documents tab.
        </Text>

        <Section style={{ textAlign: 'center', margin: '32px 0' }}>
          <Button href={PORTAL_URL} style={button}>View documents</Button>
        </Section>

        <Text style={footer}>
          If more documents were added in the last few minutes, they're all waiting in your portal.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'A new document is in your client portal',
  displayName: 'Portal — New Document',
  previewData: { clientName: 'Kristen', fileName: 'Agreement of Purchase and Sale.pdf' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Helvetica, Arial, sans-serif' }
const container = { padding: '40px', maxWidth: '600px' }
const h1 = { color: '#0a0a0a', fontSize: '22px', fontWeight: 300, letterSpacing: '0.24em', margin: '0 0 4px 0' }
const tag = { color: '#C9A84C', fontSize: '11px', letterSpacing: '0.28em', textTransform: 'uppercase' as const, margin: '0 0 28px 0' }
const text = { color: '#0a0a0a', fontSize: '14px', lineHeight: '22px', margin: '0 0 14px 0' }
const button = { backgroundColor: '#0a0a0a', color: '#ffffff', padding: '14px 28px', borderRadius: '4px', fontSize: '13px', letterSpacing: '0.14em', textTransform: 'uppercase' as const, textDecoration: 'none' }
const footer = { color: '#787878', fontSize: '11px', marginTop: '28px', borderTop: '1px solid #eaeaea', paddingTop: '16px' }
