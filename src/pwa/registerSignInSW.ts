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

/** How often to re-check for a new build while a tab stays open. */
const UPDATE_CHECK_MS = 60 * 1000;

function announceUpdate(): void {
  void import('sonner').then(({ toast }) => {
    toast('A new version is available', {
      description: 'Refresh to load the latest version of LUXEhub.',
      duration: Infinity,
      action: { label: 'Refresh', onClick: () => window.location.reload() },
    });
  });
}

export function registerSignInSW(): void {
  if (!('serviceWorker' in navigator)) return;
  if (isRefusedContext()) {
    void unregisterOwn();
    return;
  }

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');

      // Check for a new build on every load, and periodically while open.
      void reg.update();
      setInterval(() => void reg.update(), UPDATE_CHECK_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update();
      });

      // A new worker took control after this page already had one: the user is
      // mid-task on an old bundle, so ask rather than swapping under them.
      const hadController = Boolean(navigator.serviceWorker.controller);
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController) announceUpdate();
      });
    } catch {
      /* registration failures are non-fatal */
    }
  });
}
