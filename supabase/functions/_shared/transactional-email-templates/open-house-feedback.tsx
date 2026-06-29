import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Preview, Row, Column,
  Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface FeedbackRow {
  label: string
  value: string
}

interface Props {
  propertyAddress?: string
  openHouseDate?: string
  attendeeName?: string
  listingAgentName?: string
  submittedBy?: string
  rows?: FeedbackRow[]
  notes?: string
}

const Email = ({
  propertyAddress = 'Property',
  openHouseDate = '',
  attendeeName = 'Attendee',
  listingAgentName = '',
  submittedBy = '',
  rows = [],
  notes = '',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New open house feedback — {propertyAddress}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={h1}>Open House Feedback</Heading>
          <Text style={subhead}>{propertyAddress}</Text>
          {openHouseDate && <Text style={meta}>{openHouseDate}</Text>}
        </Section>

        <Section style={card}>
          <Row>
            <Column>
              <Text style={labelStyle}>Attendee</Text>
              <Text style={valueStyle}>{attendeeName}</Text>
            </Column>
            {listingAgentName && (
              <Column>
                <Text style={labelStyle}>Listing Agent</Text>
                <Text style={valueStyle}>{listingAgentName}</Text>
              </Column>
            )}
          </Row>

          <Hr style={hr} />

          {rows.map((r, i) => (
            <Row key={i} style={{ marginBottom: 8 }}>
              <Column style={{ width: '40%' }}>
                <Text style={labelStyle}>{r.label}</Text>
              </Column>
              <Column>
                <Text style={valueStyle}>{r.value}</Text>
              </Column>
            </Row>
          ))}

          {notes && (
            <>
              <Hr style={hr} />
              <Text style={labelStyle}>Notes</Text>
              <Text style={valueStyle}>{notes}</Text>
            </>
          )}
        </Section>

        {submittedBy && (
          <Text style={footer}>Submitted by {submittedBy}</Text>
        )}
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Props) => `Open House Feedback — ${d?.propertyAddress || 'Property'}`,
  displayName: 'Open House Feedback',
  previewData: {
    propertyAddress: '123 Main St, Toronto',
    openHouseDate: 'Sunday, June 29, 2026',
    attendeeName: 'Jane Doe',
    listingAgentName: 'Erin Smith',
    submittedBy: 'Terra',
    rows: [
      { label: 'Interest Level', value: 'High' },
      { label: 'Price Feedback', value: 'Priced right' },
      { label: 'Condition', value: 'Excellent' },
      { label: 'Pre-approved', value: 'Yes' },
      { label: 'Working with Realtor', value: 'No' },
      { label: 'Home to Sell', value: 'No' },
    ],
    notes: 'Loved the kitchen renovation, wants to see again with partner.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Helvetica, Arial, sans-serif' }
const container = { padding: '32px 24px', maxWidth: '600px' }
const header = { borderBottom: '3px solid #b8860b', paddingBottom: '16px', marginBottom: '24px' }
const h1 = { color: '#0f172a', fontSize: '24px', fontWeight: 700, margin: '0 0 8px 0' }
const subhead = { color: '#0f172a', fontSize: '16px', fontWeight: 600, margin: '0' }
const meta = { color: '#64748b', fontSize: '13px', margin: '4px 0 0 0' }
const card = { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px' }
const labelStyle = { color: '#64748b', fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 2px 0', fontWeight: 600 }
const valueStyle = { color: '#0f172a', fontSize: '14px', margin: '0 0 4px 0' }
const hr = { borderColor: '#e2e8f0', margin: '16px 0' }
const footer = { color: '#94a3b8', fontSize: '12px', marginTop: '24px', textAlign: 'center' as const }