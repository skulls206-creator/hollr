import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getListMessagesQueryKey, getListDmMessagesQueryKey, getListDmThreadsQueryKey } from '@workspace/api-client-react';
import type { Message } from '@workspace/api-client-react';
import type { MusicState } from '@workspace/api-zod';
import { useAppStore } from '@/store/use-app-store';
import { playNotificationSound, playVoiceJoinSound, playVoiceLeaveSound, startCallRinging, stopCallRinging } from '@/lib/notification-sound';

// Module-level singleton so any module can send signals without creating a second WS connection
let _sendSignal: ((payload: any) => void) | null = null;
let _sendRaw: ((msg: object) => void) | null = null;

// Called by use-webrtc.ts to receive incoming WebRTC signaling messages
let _onVoiceSignal: ((payload: any) => void) | null = null;

// Called by use-webrtc.ts to be notified when a new peer joins the channel
let _onNewPeer: ((userId: string) => void) | null = null;

// Music state listener — called whenever a MUSIC_STATE_UPDATE arrives
let _onMusicStateUpdate: ((payload: MusicState) => void) | null = null;

// DM call signal handler (set by DmCallOverlay)
let _onDmCallSignal: ((payload: any) => void) | null = null;

export function setDmCallSignalListener(listener: ((payload: any) => void) | null) {
  _onDmCallSignal = listener;
}

export function sendDmCallSignal(payload: any) {
  if (_sendRaw) {
    _sendRaw({ type: 'DM_CALL_SIGNAL', payload });
  } else {
    console.warn('[WS] sendDmCallSignal called before WebSocket connected');
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

function showBrowserNotification(title: string, body: string, avatarUrl?: string | null) {
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    try {
      const n = new Notification(title, {
        body,
        icon: avatarUrl ?? '/favicon.ico',
        tag: 'hollr-message',
        silent: true,
      });
      setTimeout(() => n.close(), 6000);
    } catch {}
  }
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
  | { type: 'CONNECTED' };

export function useRealtime(userId?: string) {
  const queryClient = useQueryClient();
  const ws = useRef<WebSocket | null>(null);

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

  useEffect(() => {
    if (!userId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;

    ws.current = new WebSocket(wsUrl);

    const sendSignal = (payload: any) => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'VOICE_SIGNAL', payload }));
      }
    };
    const sendRaw = (msg: object) => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify(msg));
      }
    };
    _sendSignal = sendSignal;
    _sendRaw = sendRaw;

    ws.current.onopen = () => {
      // Only identify — the server reads our saved status from DB and broadcasts it.
      // No hardcoded "online" here, so the user's chosen status (idle/dnd/invisible) is preserved.
      ws.current?.send(JSON.stringify({ type: 'IDENTIFY', payload: { userId } }));
    };

    ws.current.onmessage = (event) => {
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

                // DM unread badge: increment if not the active DM thread
                if (msg.dmThreadId && msg.dmThreadId !== activeDmThreadId) {
                  incrementDmUnreadCount(msg.dmThreadId);
                }

                // Check for @mention of current user
                let mentionsList: string[] = [];
                try {
                  const rawMentions = (msg as any).mentions;
                  mentionsList = rawMentions ? JSON.parse(rawMentions as string) : [];
                } catch {}
                const isMentioned = mentionsList.includes(userId);

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
            if (user.userId !== userId) playVoiceJoinSound();
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
            break;
          }

          case 'MUSIC_STATE_UPDATE': {
            if (_onMusicStateUpdate) _onMusicStateUpdate(data.payload);
            break;
          }

          case 'DM_CALL_SIGNAL': {
            if (_onDmCallSignal) {
              _onDmCallSignal(data.payload);
              break;
            }
            // Read latest store state to avoid stale closure
            const storeSnap = useAppStore.getState();
            const { type: ctype, callerId, callerName, callerAvatar, dmThreadId } = data.payload ?? {};
            if (ctype === 'call_ring') {
              // Ignore call from ourselves (same-account test)
              if (callerId === userId) break;
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
                // Ring sound + browser notification for incoming calls
                startCallRinging();
                showBrowserNotification(
                  `📞 Incoming call from ${callerName ?? 'Someone'}`,
                  callState === 'incoming_request' ? 'Tap to review the call request' : 'Tap to answer',
                  callerAvatar,
                );
              }
            } else if (ctype === 'call_accept') {
              stopCallRinging();
              storeSnap.setDmCallState({ state: 'connected', startedAt: Date.now() });
            } else if (ctype === 'call_decline' || ctype === 'call_end') {
              stopCallRinging();
              storeSnap.endDmCall();
            }
            break;
          }
        }
      } catch (e) {
        console.error('WebSocket message parse error', e);
      }
    };

    return () => {
      _sendSignal = null;
      _sendRaw = null;
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'PRESENCE_UPDATE', payload: { userId, status: 'offline' } }));
      }
      ws.current?.close();
    };
  }, [userId, queryClient]);

  const sendSignal = (payload: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'VOICE_SIGNAL', payload }));
    }
  };

  return { sendSignal };
}
