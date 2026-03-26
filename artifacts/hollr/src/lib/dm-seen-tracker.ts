/**
 * Shared module-level map tracking the last seen message ID per DM thread.
 * Used by both the WebSocket handler and the polling effect to prevent
 * double-counting unread badges when both paths detect the same new message.
 */
export const dmLastSeenMsgId: Map<string, string> = new Map();
