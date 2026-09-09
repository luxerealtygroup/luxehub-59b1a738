/**
 * The only place a service worker is registered.
 *
 * Offline sign-in matters (basements and rural listings have no signal), but a
 * service worker must never run in dev or a Lovable preview, where it would
 * serve stale HTML.
 */
const BLOCKED_HOST_SUFFIXES = [
  'lovableproject.com',
  'lovableproject-dev.com',
  'beta.lovable.dev',
];

function isRefusedContext(): boolean {
  if (!import.meta.env.PROD) return true;
  if (window.self !== window.top) return true;
  const host = window.location.hostname.toLowerCase();
  if (host.startsWith('id-preview--') || host.startsWith('preview--')) return true;
  if (BLOCKED_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) return true;
  if (new URLSearchParams(window.location.search).get('sw') === 'off') return true;
  return false;
}

async function unregisterOwn(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    regs
      .filter((r) => (r.active?.scriptURL || r.installing?.scriptURL || '').endsWith('/sw.js'))
      .map((r) => r.unregister()),
  );
}

export function registerSignInSW(): void {
  if (!('serviceWorker' in navigator)) return;
  if (isRefusedContext()) {
    void unregisterOwn();
    return;
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
