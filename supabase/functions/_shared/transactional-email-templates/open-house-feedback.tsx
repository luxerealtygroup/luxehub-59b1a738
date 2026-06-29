import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Row, Column,
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

// Styled to mirror the in-app PDF: white page, Helvetica, dark slate table header.
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
    <Preview>Open House Report — {propertyAddress}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Open House Report</Heading>
        <Text style={addressText}>{propertyAddress}</Text>
        {openHouseDate && <Text style={dateText}>{openHouseDate}</Text>}

        <Section style={metaBlock}>
          {listingAgentName && (
            <Row style={metaRow}>
              <Column style={metaKeyCol}><Text style={metaKey}>Listing Agent:</Text></Column>
              <Column><Text style={metaVal}>{listingAgentName}</Text></Column>
            </Row>
          )}
          <Row style={metaRow}>
            <Column style={metaKeyCol}><Text style={metaKey}>Attendee:</Text></Column>
            <Column><Text style={metaVal}>{attendeeName}</Text></Column>
          </Row>
        </Section>

        {rows.length > 0 && (
          <Section style={{ marginTop: 12 }}>
            <Row style={tableHeadRow}>
              <Column style={tableHeadCellLeft}><Text style={tableHeadText}>Field</Text></Column>
              <Column style={tableHeadCell}><Text style={tableHeadText}>Response</Text></Column>
            </Row>
            {rows.map((r, i) => (
              <Row key={i} style={i % 2 === 0 ? tableRow : tableRowAlt}>
                <Column style={tableCellLeft}><Text style={tableCellText}>{r.label}</Text></Column>
                <Column style={tableCell}><Text style={tableCellText}>{r.value}</Text></Column>
              </Row>
            ))}
          </Section>
        )}

        {notes && (
          <Section style={notesSection}>
            <Text style={notesLabel}>Notes</Text>
            <Text style={notesText}>{notes}</Text>
          </Section>
        )}

        {submittedBy && (
          <Text style={footer}>Submitted by {submittedBy}</Text>
        )}
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Props) => `Open House Report — ${d?.propertyAddress || 'Property'}`,
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
const container = { padding: '40px', maxWidth: '600px' }
const h1 = { color: '#000000', fontSize: '22px', fontWeight: 700, margin: '0 0 12px 0' }
const addressText = { color: '#000000', fontSize: '13px', margin: '0 0 4px 0' }
const dateText = { color: '#787878', fontSize: '13px', margin: '0 0 20px 0' }
const metaBlock = { marginBottom: '8px' }
const metaRow = { marginBottom: '2px' }
const metaKeyCol = { width: '110px', verticalAlign: 'top' as const }
const metaKey = { color: '#000000', fontSize: '12px', fontWeight: 700, margin: '0 0 4px 0' }
const metaVal = { color: '#000000', fontSize: '12px', margin: '0 0 4px 0' }
const tableHeadRow = { backgroundColor: '#1e293b' }
const tableHeadCellLeft = { padding: '6px 8px', width: '40%' }
const tableHeadCell = { padding: '6px 8px' }
const tableHeadText = { color: '#ffffff', fontSize: '11px', fontWeight: 700, margin: '0' }
const tableRow = { backgroundColor: '#ffffff' }
const tableRowAlt = { backgroundColor: '#f5f5f5' }
const tableCellLeft = { padding: '6px 8px', width: '40%', borderBottom: '1px solid #e5e7eb' }
const tableCell = { padding: '6px 8px', borderBottom: '1px solid #e5e7eb' }
const tableCellText = { color: '#000000', fontSize: '11px', margin: '0' }
const notesSection = { marginTop: '16px' }
const notesLabel = { color: '#000000', fontSize: '12px', fontWeight: 700, margin: '0 0 4px 0' }
const notesText = { color: '#000000', fontSize: '12px', margin: '0', whiteSpace: 'pre-wrap' as const }
const footer = { color: '#787878', fontSize: '11px', marginTop: '24px' }