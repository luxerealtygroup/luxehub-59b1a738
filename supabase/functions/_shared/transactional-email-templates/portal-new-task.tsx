import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { tenant } from '../tenant.ts'

const PORTAL_URL = `${tenant.appUrl}/client-portal`

interface Props {
  clientName?: string
  taskTitle?: string
  taskDescription?: string | null
  dueDate?: string | null
}

const Email = ({ clientName = 'there', taskTitle = 'A new task', taskDescription, dueDate }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your agent added a new task to your client portal</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{tenant.brokerageName}</Heading>
        <Text style={tag}>New Task</Text>

        <Text style={text}>Hi {clientName},</Text>
        <Text style={text}>Your agent added a next step for you:</Text>

        <Section style={card}>
          <Text style={cardTitle}>{taskTitle}</Text>
          {taskDescription ? <Text style={cardBody}>{taskDescription}</Text> : null}
          {dueDate ? <Text style={cardMeta}>Due {dueDate}</Text> : null}
        </Section>

        <Section style={{ textAlign: 'center', margin: '32px 0' }}>
          <Button href={PORTAL_URL} style={button}>Open your tasks</Button>
        </Section>

        <Text style={footer}>
          You can mark tasks complete in your portal so your agent stays in the loop.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'A new task was added to your client portal',
  displayName: 'Portal — New Task',
  previewData: {
    clientName: 'Kristen',
    taskTitle: 'Send mortgage pre-approval letter',
    taskDescription: 'Forward the pre-approval PDF from your lender so we can submit offers quickly.',
    dueDate: '2026-09-02',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Helvetica, Arial, sans-serif' }
const container = { padding: '40px', maxWidth: '600px' }
const h1 = { color: '#0a0a0a', fontSize: '22px', fontWeight: 300, letterSpacing: '0.24em', margin: '0 0 4px 0' }
const tag = { color: '#C9A84C', fontSize: '11px', letterSpacing: '0.28em', textTransform: 'uppercase' as const, margin: '0 0 28px 0' }
const text = { color: '#0a0a0a', fontSize: '14px', lineHeight: '22px', margin: '0 0 14px 0' }
const card = { border: '1px solid #eaeaea', borderLeft: '3px solid #C9A84C', borderRadius: '4px', padding: '16px 18px', margin: '18px 0' }
const cardTitle = { color: '#0a0a0a', fontSize: '15px', fontWeight: 600, margin: '0 0 6px 0' }
const cardBody = { color: '#3f3f3f', fontSize: '13px', lineHeight: '20px', margin: '0 0 6px 0' }
const cardMeta = { color: '#787878', fontSize: '12px', margin: 0 }
const button = { backgroundColor: '#0a0a0a', color: '#ffffff', padding: '14px 28px', borderRadius: '4px', fontSize: '13px', letterSpacing: '0.14em', textTransform: 'uppercase' as const, textDecoration: 'none' }
const footer = { color: '#787878', fontSize: '11px', marginTop: '28px', borderTop: '1px solid #eaeaea', paddingTop: '16px' }
