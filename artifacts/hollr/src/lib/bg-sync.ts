/**
 * Background Sync queue for failed message sends.
 * When the network is down, messages are stored here.
 * The service worker fires `sync` when connectivity returns,
 * which triggers FLUSH_MESSAGE_QUEUE → flushMessageQueue().
 */

const QUEUE_KEY = 'hollr:bg-sync-queue';

export interface QueuedMessage {
  id: string;
  channelId?: string;
  dmThreadId?: string;
  content: string;
  queuedAt: number;
}

export function enqueueMessage(msg: Omit<QueuedMessage, 'id' | 'queuedAt'>) {
  try {
    const queue = getQueue();
    queue.push({ ...msg, id: crypto.randomUUID(), queuedAt: Date.now() });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    registerSync();
  } catch {}
}

export function getQueue(): QueuedMessage[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function clearQueue() {
  try { localStorage.removeItem(QUEUE_KEY); } catch {}
}

export function removeFromQueue(id: string) {
  try {
    const queue = getQueue().filter(m => m.id !== id);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

/** Register a one-shot background sync with the service worker. */
export async function registerSync() {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    if ('sync' in reg) {
      await (reg as any).sync.register('hollr-message-queue');
    }
  } catch {}
}

/**
 * Flush queued messages — called when the SW fires FLUSH_MESSAGE_QUEUE
 * or when the app regains focus after an offline period.
 * Returns the number of messages successfully sent.
 */
export async function flushMessageQueue(
  base: string,
  onSent?: (msg: QueuedMessage) => void,
): Promise<number> {
  const queue = getQueue();
  if (queue.length === 0) return 0;

  let sent = 0;
  for (const msg of queue) {
    try {
      const url = msg.channelId
        ? `${base}api/channels/${msg.channelId}/messages`
        : `${base}api/dms/${msg.dmThreadId}/messages`;
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: msg.content }),
      });
      if (res.ok) {
        removeFromQueue(msg.id);
        onSent?.(msg);
        sent++;
      }
    } catch {
      break;
    }
  }
  return sent;
}
