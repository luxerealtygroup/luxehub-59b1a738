import { MessageSquare, FileText, Image as ImageIcon, CheckSquare } from 'lucide-react';
import type { NotificationType } from '@/hooks/useNotifications';

export type PortalTab = 'setup' | 'timeline' | 'tasks' | 'documents' | 'photos' | 'messages';

interface Meta {
  label: string;
  tab: PortalTab;
  action: string;
  Icon: typeof MessageSquare;
}

export const NOTIFICATION_META: Record<NotificationType, Meta> = {
  message: { label: 'New message', tab: 'messages', action: 'Open chat', Icon: MessageSquare },
  document: { label: 'New document', tab: 'documents', action: 'View documents', Icon: FileText },
  photo: { label: 'New photos', tab: 'photos', action: 'View photos', Icon: ImageIcon },
  task: { label: 'New task', tab: 'tasks', action: 'View tasks', Icon: CheckSquare },
};

export function notificationMeta(type: NotificationType | null | undefined): Meta {
  return NOTIFICATION_META[(type ?? 'message') as NotificationType] ?? NOTIFICATION_META.message;
}
