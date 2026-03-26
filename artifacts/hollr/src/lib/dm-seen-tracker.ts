/**
 * Shared module-level map tracking the last seen message ID per DM thread.
 * Used by both the WebSocket handler and the polling effect to prevent
 * double-counting unread badges when both paths detect the same new message.
 *
 * Also persists to localStorage so page reloads start with accurate badge counts.
 */

const LS_KEY = 'hollr:dm-seen-v2';

function loadFromStorage(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function saveToStorage(map: Map<string, string>) {
  try {
    const obj: Record<string, string> = {};
    map.forEach((v, k) => { obj[k] = v; });
    localStorage.setItem(LS_KEY, JSON.stringify(obj));
  } catch {}
}

// Seed from localStorage on first import
const _stored = loadFromStorage();
export const dmLastSeenMsgId: Map<string, string> = new Map(Object.entries(_stored));

/**
 * Mark a DM thread as read up to a given message ID.
 * Updates both the in-memory map and localStorage.
 */
export function markDmThreadRead(threadId: string, messageId: string) {
  dmLastSeenMsgId.set(threadId, messageId);
  saveToStorage(dmLastSeenMsgId);
}

/**
 * Get the last seen message ID for a thread (or undefined if never seen).
 */
export function getLastSeenId(threadId: string): string | undefined {
  return dmLastSeenMsgId.get(threadId);
}
