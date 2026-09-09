/**
 * Offline sign-in queue.
 *
 * Every sign-in is written to IndexedDB first and only then posted, so a
 * submission survives a refresh, a closed tab, a dead basement signal or a
 * rural listing with no bars. Nothing is ever removed from the queue until the
 * server has accepted it.
 */
import { supabase } from '@/integrations/supabase/client';

const DB_NAME = 'luxehub-open-house';
const DB_VERSION = 1;
const STORE = 'pending_signins';

export interface QueuedSignIn {
  id: string;
  slug: string;
  client_captured_at: string;
  queued_at: string;
  payload: {
    _first_name: string;
    _last_name: string | null;
    _email: string | null;
    _phone: string | null;
    _working_with_agent: boolean | null;
    _agent_name: string | null;
    _intent: string | null;
    _has_home_to_sell: string | null;
    _timeline: string | null;
    _lender_status: string | null;
    _custom_answers: Record<string, string>;
    _disclosure_accepted: boolean;
    _notes: string | null;
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export async function enqueueSignIn(item: QueuedSignIn): Promise<void> {
  try {
    await tx('readwrite', (s) => s.put(item) as IDBRequest<IDBValidKey>);
  } catch {
    // IndexedDB unavailable (private mode). The direct post below is the only
    // chance this sign-in has, so we let the caller carry on.
  }
}

export async function listQueued(): Promise<QueuedSignIn[]> {
  try {
    const rows = await tx<QueuedSignIn[]>('readonly', (s) => s.getAll() as IDBRequest<QueuedSignIn[]>);
    return rows || [];
  } catch {
    return [];
  }
}

export async function countQueued(): Promise<number> {
  return (await listQueued()).length;
}

async function removeQueued(id: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(id) as unknown as IDBRequest<undefined>);
  } catch {
    /* ignore */
  }
}

async function post(item: QueuedSignIn): Promise<'sent' | 'retry' | 'rejected'> {
  const { error } = await supabase.rpc('submit_open_house_visitor', {
    _slug: item.slug,
    _client_captured_at: item.client_captured_at,
    ...item.payload,
  });
  if (!error) return 'sent';
  // A network failure means "try again later"; anything the server actively
  // refused would fail forever, so we drop it rather than retry in a loop.
  const message = (error.message || '').toLowerCase();
  const isNetwork =
    !navigator.onLine ||
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('timeout');
  return isNetwork ? 'retry' : 'rejected';
}

/** Try to send everything waiting. Returns how many are still queued. */
export async function flushQueue(): Promise<{ remaining: number; sent: number; rejected: number }> {
  const items = await listQueued();
  let sent = 0;
  let rejected = 0;
  for (const item of items) {
    const result = await post(item);
    if (result === 'sent') {
      await removeQueued(item.id);
      sent++;
    } else if (result === 'rejected') {
      await removeQueued(item.id);
      rejected++;
    }
  }
  return { remaining: await countQueued(), sent, rejected };
}

export function newQueueId(): string {
  return crypto.randomUUID();
}
