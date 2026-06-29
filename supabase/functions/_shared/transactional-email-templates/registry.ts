import type { ComponentType } from 'npm:react@18.3.1'
import { template as openHouseFeedback } from './open-house-feedback.tsx'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: any) => string)
  displayName?: string
  previewData?: Record<string, any>
  to?: string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'open-house-feedback': openHouseFeedback,
}