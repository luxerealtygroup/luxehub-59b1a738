import { createContext, useContext, useEffect, ReactNode } from 'react';
import { toast } from '@/hooks/use-toast';

/**
 * Client-portal preview mode.
 *
 * When an admin (or the portal's assigned agent) previews a client portal, the
 * exact same client components render with the portal's real data, but every
 * write path must be inert. The flag below is intentionally module-level (not
 * only React context) so data-layer helpers can consult it synchronously from
 * anywhere, including callbacks that fire after the component unmounts.
 */
let readOnlyDepth = 0;

/** True while a read-only client-portal preview is mounted. */
export const isPortalReadOnly = () => readOnlyDepth > 0;

/**
 * Call at the top of any portal write handler. Returns true when the write was
 * blocked (preview mode), in which case the caller must return immediately.
 */
export function blockPortalWrite(action = 'This action'): boolean {
  if (!isPortalReadOnly()) return false;
  toast({
    title: 'Read-only preview',
    description: `${action} is disabled while previewing as the client.`,
  });
  return true;
}

interface PortalPreviewValue {
  isPreview: boolean;
  clientName: string | null;
}

const PortalPreviewContext = createContext<PortalPreviewValue>({
  isPreview: false,
  clientName: null,
});

export function usePortalPreview() {
  return useContext(PortalPreviewContext);
}

export function PortalPreviewProvider({
  clientName,
  children,
}: {
  clientName: string | null;
  children: ReactNode;
}) {
  useEffect(() => {
    readOnlyDepth += 1;
    return () => {
      readOnlyDepth = Math.max(0, readOnlyDepth - 1);
    };
  }, []);

  return (
    <PortalPreviewContext.Provider value={{ isPreview: true, clientName }}>
      {children}
    </PortalPreviewContext.Provider>
  );
}
