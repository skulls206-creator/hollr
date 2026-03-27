import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getListMessagesQueryKey, getListDmMessagesQueryKey, getListDmThreadsQueryKey } from '@workspace/api-client-react';
import type { Message } from '@workspace/api-client-react';
import type { MusicState } from '@workspace/api-zod';
import { useAppStore } from '@/store/use-app-store';
import { playNotificationSound, playVoiceJoinSound, playVoiceLeaveSound, startCallRinging, stopCallRinging } from '@/lib/notification-sound';
import { dmLastSeenMsgId, markDmThreadRead } from '@/lib/dm-seen-tracker';
import { flushMessageQueue, getQueue } from '@/lib/bg-sync';

// Module-level singleton so any module can send signals without creating a second WS connection
let _sendSignal: ((payload: any) => void) | null = null;
let _sendRaw: ((msg: object) => void) | null = null;

// Deduplicate signals that arrive via BOTH WS and REST (same signal, two paths)
const _processedSignalIds = new Set<string>();

// Called by use-webrtc.ts to receive incoming WebRTC signaling messages
let _onVoiceSignal: ((payload: any) => void) | null = null;

// Called by use-webrtc.ts to be notified when a new peer joins the channel
let _onNewPeer: ((userId: string) => void) | null = null;

// Music state listener — called whenever a MUSIC_STATE_UPDATE arrives
let _onMusicStateUpdate: ((payload: MusicState) => void) | null = null;

// DM call WebRTC signals (offer/answer/ice) — separate from state management
let _onDmCallRtcSignal: ((payload: any) => void) | null = null;

// Triggered whenever PRESENCE_UPDATE arrives so useDockPresence can refetch immediately
let _presenceRefetchTrigger: (() => void) | null = null;

export function setPresenceRefetchTrigger(fn: (() => void) | null) {
  _presenceRefetchTrigger = fn;
}

export function setDmCallRtcSignalListener(listener: ((payload: any) => void) | null) {
  _onDmCallRtcSignal = listener;
}

export function sendDmCallSignal(payload: any) {
  // 1. WebSocket — instant delivery when on the same server instance
  if (_sendRaw) {
    _sendRaw({ type: 'DM_CALL_SIGNAL', payload });
  }
  // 2. REST API — guaranteed delivery even across different server instances
  //    (preview vs production, different deploy instances, etc.)
  const { targetId, type: signalType, callerId: _ignore, ...rest } = payload;
  if (targetId && signalType) {
    fetch(`${import.meta.env.BASE_URL}api/dm/call-signal`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toUserId: targetId, threadId: payload.dmThreadId ?? payload.threadId ?? null, signalType, payload: rest }),
    }).catch(() => {});
  }
}

// Video call signal handler (set by useVideoCall hook)
let _onVideoCallSignal: ((payload: any) => void) | null = null;

export function setVideoCallSignalListener(listener: ((payload: any) => void) | null) {
  _onVideoCallSignal = listener;
}

export function sendVideoCallSignal(payload: any) {
  if (_sendRaw) {
    _sendRaw({ type: 'VIDEO_CALL_SIGNAL', payload });
  } else {
    console.warn('[WS] sendVideoCallSignal called before WebSocket connected');
  }
}

export function setMusicStateListener(listener: ((payload: MusicState) => void) | null) {
  _onMusicStateUpdate = listener;
}

export function sendVoiceSignal(payload: any) {
  if (_sendSignal) {
    _sendSignal(payload);
  } else {
    console.warn('[WS] sendVoiceSignal called before WebSocket connected');
  }
}

export function sendPresenceUpdate(userId: string, status: string) {
  if (_sendRaw) {
    _sendRaw({ type: 'PRESENCE_UPDATE', payload: { userId, status } });
  }
}

export function setVoiceSignalListener(listener: ((payload: any) => void) | null) {
  _onVoiceSignal = listener;
}

export function setNewPeerHandler(handler: ((userId: string) => void) | null) {
  _onNewPeer = handler;
}

// Request browser notification permission once
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

/** Show a notification via the Service Worker — works on locked screens and backgrounded tabs. */
async function showSwNotification(
  title: string,
  body: string,
  opts: {
    icon?: string | null;
    tag?: string;
    requireInteraction?: boolean;
    silent?: boolean;
    vibrate?: number[];
    actions?: { action: string; title: string }[];
    data?: Record<string, unknown>;
  } = {},
) {
  if (!('serviceWorker' in navigator) || Notification.permission !== 'granted') return;
  if (!document.hidden && !opts.requireInteraction) return; // only when backgrounded (unless forced)
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body,
      icon: opts.icon ?? '/icon-192.png',
      badge: '/icon-192.png',
      tag: opts.tag ?? 'hollr-notification',
      renotify: true,
      silent: opts.silent ?? true,
      vibrate: opts.vibrate ?? (opts.silent === false ? [150, 80, 150] : []),
      requireInteraction: opts.requireInteraction ?? false,
      data: opts.data ?? {},
      actions: opts.actions ?? [
        { action: 'open', title: 'Open' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    } as NotificationOptions);
  } catch { /* ignore — push may not be set up */ }
}

/** Dismiss any open call notification (e.g. when call is answered/declined). */
async function dismissCallNotification() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const notifs = await reg.getNotifications({ tag: 'incoming-call' });
    notifs.forEach((n) => n.close());
  } catch {}
}

function showBrowserNotification(title: string, body: string, avatarUrl?: string | null) {
  showSwNotification(title, body, { icon: avatarUrl, tag: 'hollr-message', silent: true });
}

type WsEvent =
  | { type: 'MESSAGE_CREATE'; payload: Message }
  | { type: 'MESSAGE_UPDATE'; payload: Message }
  | { type: 'MESSAGE_DELETE'; payload: { id: string; channelId?: string; dmThreadId?: string } }
  | { type: 'THREAD_REPLY_CREATE'; payload: { reply: Message; parentMessageId: string } }
  | { type: 'VOICE_SIGNAL'; payload: any }
  | { type: 'VOICE_ROOMS_SNAPSHOT'; payload: { rooms: { channelId: string; users: any[] }[] } }
  | { type: 'VOICE_ROOM_STATE'; payload: { channelId: string; users: any[] } }
  | { type: 'VOICE_USER_JOINED'; payload: { channelId: string; user: any } }
  | { type: 'VOICE_USER_LEFT'; payload: { channelId: string; userId: string } }
  | { type: 'VOICE_USER_UPDATED'; payload: { channelId: string; userId: string; muted?: boolean; streaming?: boolean; hasCamera?: boolean } }
  | { type: 'VOICE_SPEAKING_START'; payload: { channelId: string; userId: string } }
  | { type: 'VOICE_SPEAKING_STOP'; payload: { channelId: string; userId: string } }
  | { type: 'PRESENCE_UPDATE'; payload: { userId: string; status: string } }
  | { type: 'MUSIC_STATE_UPDATE'; payload: MusicState }
  | { type: 'DM_CALL_SIGNAL'; payload: any }
  | { type: 'VIDEO_CALL_SIGNAL'; payload: any }
  | { type: 'NOTIFICATION'; payload: { id: string; userId: string; type: string; title: string; body: string; link: string | null; read: boolean; createdAt: string } }
  | { type: 'CONNECTED' }
  | { type: 'PONG' };

export function useRealtime(userId?: string) {
  const queryClient = useQueryClient();
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);
  const isDestroyed = useRef(false);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Messages queued while the socket is connecting (before onopen fires)
  const sendQueue = useRef<object[]>([]);

  const {
    setVoiceRoomState,
    addVoiceChannelUser,
    removeVoiceChannelUser,
    updateVoiceChannelUser,
    incrementUnreadCount,
    clearUnreadCount,
    incrementDmUnreadCount,
    setDmCallState,
    endDmCall,
    isCallerApproved,
    allowCallsFrom,
  } = useAppStore();

  // Request notification permission early
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Listen for messages from the service worker (notification actions)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Flush queued messages on reconnect (triggered by background sync or on startup)
    if (getQueue().length > 0) {
      flushMessageQueue(import.meta.env.BASE_URL);
    }

    const onSwMessage = (event: MessageEvent) => {
      const { type, callerId, notifType } = event.data ?? {};

      if (type === 'FLUSH_MESSAGE_QUEUE') {
        flushMessageQueue(import.meta.env.BASE_URL);
        return;
      }

      if (type === 'CALL_DECLINE_FROM_NOTIFICATION') {
        const snap = useAppStore.getState();
        const { dmCall } = snap;
        // Decline the call if it's still in incoming state
        if (
          (dmCall.state === 'incoming_ringing' || dmCall.state === 'incoming_request') &&
          dmCall.targetUserId === callerId
        ) {
          if (_sendRaw) {
            _sendRaw({ type: 'DM_CALL_SIGNAL', payload: { type: 'call_decline', targetId: callerId } });
          }
          stopCallRinging();
          dismissCallNotification();
          snap.endDmCall();
        } else if (notifType === 'video_call') {
          // Video call decline from notification
          const { videoCall } = snap;
          if (videoCall.state === 'incoming_ringing' && videoCall.targetUserId === callerId) {
            if (_sendRaw) {
              _sendRaw({ type: 'VIDEO_CALL_SIGNAL', payload: { type: 'video_decline', targetId: callerId } });
            }
            stopCallRinging();
            dismissCallNotification();
            snap.endVideoCall();
          }
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', onSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onSwMessage);
  }, []);

  useEffect(() => {
    if (!userId) return;
    isDestroyed.current = false;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;

    function connect() {
      if (isDestroyed.current) return;

      const newWs = new WebSocket(wsUrl);
      ws.current = newWs;

      // Keep module-level senders pointed at the live socket.
      // When the socket is connecting (not yet OPEN), queue messages and flush on open.
      _sendSignal = (payload: any) => {
        const msg = JSON.stringify({ type: 'VOICE_SIGNAL', payload });
        if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(msg);
        else sendQueue.current.push({ type: 'VOICE_SIGNAL', payload });
      };
      _sendRaw = (msg: object) => {
        if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
        else sendQueue.current.push(msg);
      };

      newWs.onopen = () => {
        reconnectDelay.current = 1000; // reset backoff on successful connect
        // Only identify — the server reads our saved status from DB and broadcasts it.
        // No hardcoded "online" here, so the user's chosen status (idle/dnd/invisible) is preserved.
        newWs.send(JSON.stringify({ type: 'IDENTIFY', payload: { userId } }));
        // Flush any messages queued while we were reconnecting
        const queued = sendQueue.current.splice(0);
        for (const m of queued) newWs.send(JSON.stringify(m));

        // Send a JSON ping every 25 s to keep the connection alive through
        // production proxies that close idle WebSocket connections.
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (newWs.readyState === WebSocket.OPEN) {
            newWs.send(JSON.stringify({ type: 'PING' }));
          }
        }, 25_000);
      };

      newWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WsEvent;

        switch (data.type) {
          case 'MESSAGE_CREATE': {
            const msg = data.payload;
            if (msg.channelId) {
              queryClient.setQueryData<Message[]>(
                getListMessagesQueryKey(msg.channelId),
                (old) => {
                  if (!old) return [msg];
                  if (old.some(m => m.id === msg.id)) return old;
                  return [...old, msg];
                }
              );
            }
            if (msg.dmThreadId) {
              queryClient.setQueryData<Message[]>(
                getListDmMessagesQueryKey(msg.dmThreadId),
                (old) => {
                  if (!old) return [msg];
                  if (old.some(m => m.id === msg.id)) return old;
                  return [...old, msg];
                }
              );
              queryClient.invalidateQueries({ queryKey: getListDmThreadsQueryKey() });
            }

            if (msg.authorId !== userId) {
              const { isChannelMuted, activeChannelId, activeDmThreadId } = useAppStore.getState();
              const isMuted = msg.channelId ? isChannelMuted(msg.channelId) : false;

              if (!isMuted) {
                playNotificationSound();

                // Unread badge: increment if not the active channel
                if (msg.channelId && msg.channelId !== activeChannelId) {
                  incrementUnreadCount(msg.channelId);
                }

                // DM unread badge: always mark seen so poll never double-counts
                if (msg.dmThreadId) {
                  markDmThreadRead(msg.dmThreadId, msg.id);
                  // Only show badge when the DM thread isn't currently open
                  if (msg.dmThreadId !== activeDmThreadId) {
                    incrementDmUnreadCount(msg.dmThreadId);
                  }
                }

                // Check for @mention of current user
                let mentionsList: string[] = [];
                try {
                  const rawMentions = (msg as any).mentions;
                  mentionsList = rawMentions ? JSON.parse(rawMentions as string) : [];
                } catch {}
                const isMentioned = mentionsList.includes(userId as string);

                // Browser notification: always show if tab is hidden (for DMs and mentions)
                const isDm = !!msg.dmThreadId;
                if (isDm || isMentioned || msg.channelId !== activeChannelId) {
                  const author = (msg as any).author;
                  const senderName = author?.displayName || author?.username || 'Someone';
                  const preview = msg.content?.slice(0, 80) || '📎 Attachment';
                  const notifTitle = isMentioned
                    ? `${senderName} mentioned you`
                    : isDm
                    ? `DM from ${senderName}`
                    : senderName;
                  showBrowserNotification(notifTitle, preview, author?.avatarUrl);
                }
              }
            }
            break;
          }

          case 'MESSAGE_UPDATE': {
            const msg = data.payload;
            if (msg.channelId) {
              queryClient.setQueryData<Message[]>(
                getListMessagesQueryKey(msg.channelId),
                (old) => old ? old.map(m => m.id === msg.id ? msg : m) : old
              );
            }
            if (msg.dmThreadId) {
              queryClient.setQueryData<Message[]>(
                getListDmMessagesQueryKey(msg.dmThreadId),
                (old) => old ? old.map(m => m.id === msg.id ? msg : m) : old
              );
            }
            break;
          }

          case 'MESSAGE_DELETE': {
            const { id, channelId, dmThreadId } = data.payload;
            if (channelId) {
              queryClient.setQueryData<Message[]>(
                getListMessagesQueryKey(channelId),
                (old) => old ? old.filter(m => m.id !== id) : old
              );
            }
            if (dmThreadId) {
              queryClient.setQueryData<Message[]>(
                getListDmMessagesQueryKey(dmThreadId),
                (old) => old ? old.filter(m => m.id !== id) : old
              );
            }
            break;
          }

          case 'THREAD_REPLY_CREATE': {
            break;
          }

          case 'VOICE_SIGNAL': {
            if (_onVoiceSignal) _onVoiceSignal(data.payload);
            break;
          }

          case 'VOICE_ROOMS_SNAPSHOT': {
            for (const room of data.payload.rooms) {
              setVoiceRoomState(room.channelId, room.users);
            }
            break;
          }

          case 'VOICE_ROOM_STATE': {
            const { channelId, users } = data.payload;
            setVoiceRoomState(channelId, users);
            users.forEach(u => {
              if (u.userId !== userId && _onNewPeer) _onNewPeer(u.userId);
            });
            break;
          }

          case 'VOICE_USER_JOINED': {
            const { channelId, user } = data.payload;
            addVoiceChannelUser(channelId, user);
            if (user.userId !== userId) {
              playVoiceJoinSound();
              // Existing participants must also create a fresh peer for the joiner.
              // This is critical when the local user has an active screen-share: createPeer
              // adds the video track, triggering onnegotiationneeded → the joiner receives
              // an offer that already includes the video stream without needing a separate
              // renegotiation round-trip.
              if (_onNewPeer) _onNewPeer(user.userId);
            }
            break;
          }

          case 'VOICE_USER_LEFT': {
            const { channelId, userId: leftUserId } = data.payload;
            removeVoiceChannelUser(channelId, leftUserId);
            if (leftUserId !== userId) playVoiceLeaveSound();
            break;
          }

          case 'VOICE_USER_UPDATED': {
            const { channelId, userId: updatedId, ...update } = data.payload;
            updateVoiceChannelUser(channelId, updatedId, update as any);
            break;
          }

          case 'VOICE_SPEAKING_START': {
            const { channelId, userId: speakingId } = data.payload;
            updateVoiceChannelUser(channelId, speakingId, { speaking: true });
            break;
          }

          case 'VOICE_SPEAKING_STOP': {
            const { channelId, userId: speakingId } = data.payload;
            updateVoiceChannelUser(channelId, speakingId, { speaking: false });
            break;
          }

          case 'PRESENCE_UPDATE': {
            queryClient.invalidateQueries({ queryKey: ['server-members'] });
            // Trigger immediate presence count refetch in DockBar
            if (_presenceRefetchTrigger) _presenceRefetchTrigger();
            break;
          }

          case 'NOTIFICATION': {
            const store = useAppStore.getState();
            store.prependNotification(data.payload as import('@/store/use-app-store').AppNotification);
            break;
          }

          case 'MUSIC_STATE_UPDATE': {
            if (_onMusicStateUpdate) _onMusicStateUpdate(data.payload);
            break;
          }

          case 'VIDEO_CALL_SIGNAL': {
            if (_onVideoCallSignal) {
              _onVideoCallSignal(data.payload);
            } else {
              // Fallback: incoming ring when hook not yet mounted
              const snap = useAppStore.getState();
              const { type: vtype, callerId, callerName, callerAvatar, dmThreadId } = data.payload ?? {};
              if (vtype === 'video_ring' && callerId !== userId) {
                // Guard: already showing this caller's ring — don't re-alert
                const vcAlreadyRinging =
                  (snap.videoCall.state === 'incoming_ringing') &&
                  snap.videoCall.targetUserId === callerId;
                if (vcAlreadyRinging) break;

                snap.setVideoCallState({
                  state: 'incoming_ringing',
                  targetUserId: callerId,
                  targetDisplayName: callerName ?? null,
                  targetAvatarUrl: callerAvatar ?? null,
                  dmThreadId: dmThreadId ?? null,
                });
                startCallRinging(useAppStore.getState().ringtoneId);
                showSwNotification(
                  `📹 Incoming video call`,
                  `${callerName ?? 'Someone'} is calling you`,
                  {
                    icon: callerAvatar,
                    tag: 'incoming-call',
                    requireInteraction: true,
                    silent: false,
                    vibrate: [200, 100, 200],
                    actions: [{ action: 'answer', title: '📹 Answer' }, { action: 'decline', title: '🚫 Decline' }],
                    data: { notifType: 'video_call', callerId, callerName, dmThreadId, url: '/app' },
                  },
                );
              } else if (vtype === 'video_accept') {
                stopCallRinging();
                dismissCallNotification();
              } else if (vtype === 'video_decline' || vtype === 'video_end') {
                stopCallRinging();
                dismissCallNotification();
                snap.endVideoCall();
              }
            }
            break;
          }

          case 'DM_CALL_SIGNAL': {
            // Deduplicate: if this signal came via REST too, skip the WS copy
            if (data.payload?._signalId) {
              if (_processedSignalIds.has(data.payload._signalId)) break;
              _processedSignalIds.add(data.payload._signalId);
            }
            // Read latest store state to avoid stale closure
            const storeSnap = useAppStore.getState();
            const { type: ctype, callerId, callerName, callerAvatar, dmThreadId } = data.payload ?? {};

            // ── State machine (always runs) ────────────────────────────────
            if (ctype === 'call_ring') {
              // Ignore call from ourselves (same-account test)
              if (callerId === (userId as string)) break;

              // Re-ring guard: if we're already showing this caller's ring, don't
              // restart the ringtone or fire another notification — just let it ring.
              const alreadyRinging =
                (storeSnap.dmCall.state === 'incoming_ringing' || storeSnap.dmCall.state === 'incoming_request') &&
                storeSnap.dmCall.targetUserId === callerId;
              if (alreadyRinging) break;

              const liveAllowCalls = storeSnap.allowCallsFrom;
              const liveIsApproved = storeSnap.isCallerApproved(callerId);
              const callState = liveAllowCalls === 'nobody'
                ? null
                : liveIsApproved || liveAllowCalls === 'everyone'
                  ? 'incoming_ringing'
                  : 'incoming_request';
              if (callState) {
                storeSnap.setDmCallState({
                  state: callState,
                  targetUserId: callerId,
                  targetDisplayName: callerName,
                  targetAvatarUrl: callerAvatar ?? null,
                  dmThreadId: dmThreadId ?? null,
                  minimized: false,
                });
                startCallRinging(useAppStore.getState().ringtoneId);
                showSwNotification(
                  `📞 Incoming call`,
                  `${callerName ?? 'Someone'} is calling you`,
                  {
                    icon: callerAvatar,
                    tag: 'incoming-call',
                    requireInteraction: true,
                    silent: false,
                    vibrate: [200, 100, 200],
                    actions: [{ action: 'answer', title: '📞 Answer' }, { action: 'decline', title: '🚫 Decline' }],
                    data: { notifType: 'call', callerId, callerName, dmThreadId, url: '/app' },
                  },
                );
              }
            } else if (ctype === 'call_accept') {
              stopCallRinging();
              dismissCallNotification();
              storeSnap.setDmCallState({ state: 'connected', startedAt: Date.now() });
            } else if (ctype === 'call_decline' || ctype === 'call_end' || ctype === 'call_unavailable') {
              stopCallRinging();
              dismissCallNotification();
              storeSnap.endDmCall();
            }

            // ── WebRTC signals forwarded to audio hook ─────────────────────
            if (_onDmCallRtcSignal && (
              ctype === 'call_offer' || ctype === 'call_answer' || ctype === 'call_ice' ||
              ctype === 'call_decline' || ctype === 'call_end'
            )) {
              _onDmCallRtcSignal(data.payload);
            }
            break;
          }
        }
      } catch (e) {
        console.error('WebSocket message parse error', e);
      }
    };

      newWs.onclose = () => {
        if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; }
        if (isDestroyed.current) return;
        // Exponential backoff: 1s → 2s → 4s → … → 30s
        reconnectTimer.current = setTimeout(() => {
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30_000);
          connect();
        }, reconnectDelay.current);
      };

      newWs.onerror = () => {
        newWs.close(); // triggers onclose which schedules reconnect
      };
    } // end connect()

    connect();

    return () => {
      isDestroyed.current = true;
      if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
      if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; }
      _sendSignal = null;
      _sendRaw = null;
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'PRESENCE_UPDATE', payload: { userId, status: 'offline' } }));
      }
      ws.current?.close();
    };
  }, [userId, queryClient]);

  // REST polling for call signals — catches cross-server signals that WS can't deliver
  useEffect(() => {
    if (!userId) return;

    const poll = async () => {
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}api/dm/call-signal/pending`, { credentials: 'include' });
        if (!r.ok) return;
        const signals: Array<{ id: string; fromUserId: string; toUserId: string; threadId: string | null; signalType: string; payload: any }> = await r.json();
        for (const sig of signals) {
          if (_processedSignalIds.has(sig.id)) continue;
          _processedSignalIds.add(sig.id);

          const storeSnap = useAppStore.getState();
          const ctype = sig.signalType;
          const callerId = sig.fromUserId;
          const callerName = sig.payload?.callerName;
          const callerAvatar = sig.payload?.callerAvatar ?? null;
          const dmThreadId = sig.threadId;

          if (ctype === 'call_ring') {
            if (callerId === userId) continue;
            const alreadyRinging =
              (storeSnap.dmCall.state === 'incoming_ringing' || storeSnap.dmCall.state === 'incoming_request') &&
              storeSnap.dmCall.targetUserId === callerId;
            if (alreadyRinging) continue;
            const liveAllowCalls = storeSnap.allowCallsFrom;
            const liveIsApproved = storeSnap.isCallerApproved(callerId);
            const callState = liveAllowCalls === 'nobody'
              ? null
              : liveIsApproved || liveAllowCalls === 'everyone'
                ? 'incoming_ringing'
                : 'incoming_request';
            if (callState) {
              storeSnap.setDmCallState({ state: callState, targetUserId: callerId, targetDisplayName: callerName, targetAvatarUrl: callerAvatar, dmThreadId: dmThreadId ?? null, minimized: false });
              startCallRinging(storeSnap.ringtoneId);
            }
          } else if (ctype === 'call_accept') {
            stopCallRinging();
            storeSnap.setDmCallState({ state: 'connected', startedAt: Date.now() });
          } else if (ctype === 'call_decline' || ctype === 'call_end' || ctype === 'call_unavailable') {
            stopCallRinging();
            storeSnap.endDmCall();
          }

          if (_onDmCallRtcSignal && (ctype === 'call_offer' || ctype === 'call_answer' || ctype === 'call_ice' || ctype === 'call_decline' || ctype === 'call_end')) {
            _onDmCallRtcSignal({ type: ctype, callerId, callerName, callerAvatar, dmThreadId, ...sig.payload });
          }
        }
      } catch {}
    };

    const interval = setInterval(poll, 2000);
    poll(); // immediate first poll
    return () => clearInterval(interval);
  }, [userId]);

  const sendSignal = (payload: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'VOICE_SIGNAL', payload }));
    }
  };

  return { sendSignal };
}
