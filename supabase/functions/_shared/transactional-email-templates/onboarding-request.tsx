import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { tenant } from '../tenant.ts'

interface Props {
  contactName?: string
  businessName?: string
  legalName?: string | null
  email?: string
  phone?: string | null
  website?: string | null
  desiredDomain?: string | null
  teamSize?: string | null
  serviceArea?: string | null
  slackAdminName?: string | null
  slackAdminEmail?: string | null
  usesFub?: boolean | null
  usesStripe?: boolean | null
  usesAsana?: boolean | null
  extraNotes?: string | null
  logoPath?: string | null
  requestId?: string
}

const yesNo = (v?: boolean | null) => (v === true ? 'Yes' : v === false ? 'No' : '—')
const val = (v?: string | null) => (v && String(v).trim().length > 0 ? String(v) : '—')

const Row = ({ label, value }: { label: string; value: string }) => (
  <Text style={row}>
    <span style={rowLabel}>{label}: </span>
    <span>{value}</span>
  </Text>
)

const Email = (p: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New setup request from {val(p.contactName)}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{tenant.brokerageName}</Heading>
        <Text style={tag}>New Setup Request</Text>

        <Section style={card}>
          <Row label="Name" value={val(p.contactName)} />
          <Row label="Business name" value={val(p.businessName)} />
          <Row label="Legal name" value={val(p.legalName)} />
          <Row label="Email" value={val(p.email)} />
          <Row label="Phone" value={val(p.phone)} />
          <Row label="Website" value={val(p.website)} />
          <Row label="Desired portal domain" value={val(p.desiredDomain)} />
          <Row label="Team size" value={val(p.teamSize)} />
          <Row label="Area served" value={val(p.serviceArea)} />
          <Row label="Slack admin" value={`${val(p.slackAdminName)} (${val(p.slackAdminEmail)})`} />
          <Row label="Uses Follow Up Boss" value={yesNo(p.usesFub)} />
          <Row label="Uses Stripe" value={yesNo(p.usesStripe)} />
          <Row label="Uses Asana" value={yesNo(p.usesAsana)} />
          <Row label="Logo uploaded" value={p.logoPath ? 'Yes' : 'No'} />
          <Row label="Notes" value={val(p.extraNotes)} />
        </Section>

        <Text style={footer}>
          Open {tenant.appName} › Admin › Setup Requests to review this, set its status and copy
          the generated config sheet.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'New setup request',
  displayName: 'Internal — New Setup Request',
  to: tenant.supportEmail,
  previewData: {
    contactName: 'Jordan Reid',
    businessName: 'Jordan Reid Real Estate',
    legalName: 'Jordan Reid Realty Inc.',
    email: 'jordan@example.com',
    phone: '416-555-0199',
    website: 'jordanreid.ca',
    desiredDomain: 'portal.jordanreid.ca',
    teamSize: 'Just me',
    serviceArea: 'Durham Region, ON',
    slackAdminName: 'Jordan Reid',
    slackAdminEmail: 'jordan@example.com',
    usesFub: true,
    usesStripe: false,
    usesAsana: false,
    extraNotes: 'Looking to launch this fall.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Helvetica, Arial, sans-serif' }
const container = { padding: '40px', maxWidth: '600px' }
const h1 = { color: '#0a0a0a', fontSize: '22px', fontWeight: 300, letterSpacing: '0.24em', margin: '0 0 4px 0' }
const tag = { color: '#C9A84C', fontSize: '11px', letterSpacing: '0.28em', textTransform: 'uppercase' as const, margin: '0 0 28px 0' }
const card = { border: '1px solid #eaeaea', borderLeft: '3px solid #C9A84C', borderRadius: '4px', padding: '16px 18px', margin: '18px 0' }
const row = { color: '#0a0a0a', fontSize: '13px', lineHeight: '20px', margin: '0 0 6px 0' }
const rowLabel = { color: '#787878' }
const footer = { color: '#787878', fontSize: '11px', marginTop: '28px', borderTop: '1px solid #eaeaea', paddingTop: '16px' }
