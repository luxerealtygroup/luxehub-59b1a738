import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const PORTAL_URL = 'https://luxerealtyhub.com/client-portal'

interface Props {
  clientName?: string
  senderName?: string
  messagePreview?: string | null
}

const Email = ({ clientName = 'there', senderName = 'Your agent', messagePreview }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You have a new message in your client portal</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>LUXE Realty Group</Heading>
        <Text style={tag}>New Message</Text>

        <Text style={text}>Hi {clientName},</Text>
        <Text style={text}>{senderName} sent you a message in your client portal.</Text>

        {messagePreview ? (
          <Section style={card}>
            <Text style={cardBody}>{messagePreview}</Text>
          </Section>
        ) : null}

        <Section style={{ textAlign: 'center', margin: '32px 0' }}>
          <Button href={PORTAL_URL} style={button}>Read and reply</Button>
        </Section>

        <Text style={footer}>Replies sent from your portal go straight to your agent.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'New message in your client portal',
  displayName: 'Portal — New Message',
  previewData: {
    clientName: 'Kristen',
    senderName: 'Hana',
    messagePreview: 'Great news — the seller accepted our offer. I will send the paperwork shortly.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Helvetica, Arial, sans-serif' }
const container = { padding: '40px', maxWidth: '600px' }
const h1 = { color: '#0a0a0a', fontSize: '22px', fontWeight: 300, letterSpacing: '0.24em', margin: '0 0 4px 0' }
const tag = { color: '#C9A84C', fontSize: '11px', letterSpacing: '0.28em', textTransform: 'uppercase' as const, margin: '0 0 28px 0' }
const text = { color: '#0a0a0a', fontSize: '14px', lineHeight: '22px', margin: '0 0 14px 0' }
const card = { border: '1px solid #eaeaea', borderLeft: '3px solid #C9A84C', borderRadius: '4px', padding: '16px 18px', margin: '18px 0' }
const cardBody = { color: '#3f3f3f', fontSize: '13px', lineHeight: '20px', margin: 0 }
const button = { backgroundColor: '#0a0a0a', color: '#ffffff', padding: '14px 28px', borderRadius: '4px', fontSize: '13px', letterSpacing: '0.14em', textTransform: 'uppercase' as const, textDecoration: 'none' }
const footer = { color: '#787878', fontSize: '11px', marginTop: '28px', borderTop: '1px solid #eaeaea', paddingTop: '16px' }
