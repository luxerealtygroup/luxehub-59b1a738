import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const PORTAL_URL = 'https://luxerealtyhub.com/client-portal'

interface Props {
  clientName?: string
  category?: string
}

const Email = ({ clientName = 'there', category = 'Property photo' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New photos were added to your client portal</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>LUXE Realty Group</Heading>
        <Text style={tag}>New Photos</Text>

        <Text style={text}>Hi {clientName},</Text>
        <Text style={text}>
          Your agent added new photos ({category.toLowerCase()}s) to your client portal. Open the
          Photos tab to browse the full gallery.
        </Text>

        <Section style={{ textAlign: 'center', margin: '32px 0' }}>
          <Button href={PORTAL_URL} style={button}>View photos</Button>
        </Section>

        <Text style={footer}>
          Photos are grouped by Property and Milestone so you can find them quickly.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'New photos are in your client portal',
  displayName: 'Portal — New Photos',
  previewData: { clientName: 'Kristen', category: 'Property photo' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Helvetica, Arial, sans-serif' }
const container = { padding: '40px', maxWidth: '600px' }
const h1 = { color: '#0a0a0a', fontSize: '22px', fontWeight: 300, letterSpacing: '0.24em', margin: '0 0 4px 0' }
const tag = { color: '#C9A84C', fontSize: '11px', letterSpacing: '0.28em', textTransform: 'uppercase' as const, margin: '0 0 28px 0' }
const text = { color: '#0a0a0a', fontSize: '14px', lineHeight: '22px', margin: '0 0 14px 0' }
const button = { backgroundColor: '#0a0a0a', color: '#ffffff', padding: '14px 28px', borderRadius: '4px', fontSize: '13px', letterSpacing: '0.14em', textTransform: 'uppercase' as const, textDecoration: 'none' }
const footer = { color: '#787878', fontSize: '11px', marginTop: '28px', borderTop: '1px solid #eaeaea', paddingTop: '16px' }
