import type { ComponentType } from 'npm:react@18.3.1'
import { template as openHouseFeedback } from './open-house-feedback.tsx'
import { template as clientPortalInvite } from './client-portal-invite.tsx'
import { template as supportTicketEscalated } from './support-ticket-escalated.tsx'
import { template as portalNewDocuments } from './portal-new-documents.tsx'
import { template as portalNewPhotos } from './portal-new-photos.tsx'
import { template as portalNewTask } from './portal-new-task.tsx'
import { template as portalNewMessage } from './portal-new-message.tsx'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: any) => string)
  displayName?: string
  previewData?: Record<string, any>
  to?: string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'open-house-feedback': openHouseFeedback,
  'client-portal-invite': clientPortalInvite,
  'support-ticket-escalated': supportTicketEscalated,
  'portal-new-documents': portalNewDocuments,
  'portal-new-photos': portalNewPhotos,
  'portal-new-task': portalNewTask,
  'portal-new-message': portalNewMessage,
}