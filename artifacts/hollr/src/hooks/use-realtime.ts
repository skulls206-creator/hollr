import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getListMessagesQueryKey, getListDmMessagesQueryKey, getListDmThreadsQueryKey } from '@workspace/api-client-react';
import type { Message } from '@workspace/api-client-react';
import { useAppStore } from '@/store/use-app-store';
import { playNotificationSound } from '@/lib/notification-sound';

// Module-level singleton so any module can send signals without creating a second WS connection
let _sendSignal: ((payload: any) => void) | null = null;

// Called by use-webrtc.ts to receive incoming WebRTC signaling messages
let _onVoiceSignal: ((payload: any) => void) | null = null;

// Called by use-webrtc.ts to be notified when a new peer joins the channel
let _onNewPeer: ((userId: string) => void) | null = null;

export function sendVoiceSignal(payload: any) {
  if (_sendSignal) {
    _sendSignal(payload);
  } else {
    console.warn('[WS] sendVoiceSignal called before WebSocket connected');
  }
}

export function setVoiceSignalListener(listener: ((payload: any) => void) | null) {
  _onVoiceSignal = listener;
}

export function setNewPeerHandler(handler: ((userId: string) => void) | null) {
  _onNewPeer = handler;
}

type WsEvent =
  | { type: 'MESSAGE_CREATE'; payload: Message }
  | { type: 'MESSAGE_UPDATE'; payload: Message }
  | { type: 'MESSAGE_DELETE'; payload: { id: string; channelId?: string; dmThreadId?: string } }
  | { type: 'THREAD_REPLY_CREATE'; payload: { reply: Message; parentMessageId: string } }
  | { type: 'VOICE_SIGNAL'; payload: any }
  | { type: 'VOICE_ROOM_STATE'; payload: { channelId: string; users: any[] } }
  | { type: 'VOICE_USER_JOINED'; payload: { channelId: string; user: any } }
  | { type: 'VOICE_USER_LEFT'; payload: { channelId: string; userId: string } }
  | { type: 'VOICE_USER_UPDATED'; payload: { channelId: string; userId: string; muted?: boolean; streaming?: boolean } }
  | { type: 'VOICE_SPEAKING_START'; payload: { channelId: string; userId: string } }
  | { type: 'VOICE_SPEAKING_STOP'; payload: { channelId: string; userId: string } }
  | { type: 'PRESENCE_UPDATE'; payload: { userId: string; status: string } }
  | { type: 'CONNECTED' };

export function useRealtime(userId?: string) {
  const queryClient = useQueryClient();
  const ws = useRef<WebSocket | null>(null);

  const {
    setVoiceRoomState,
    addVoiceChannelUser,
    removeVoiceChannelUser,
    updateVoiceChannelUser,
  } = useAppStore();

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
    _sendSignal = sendSignal;

    ws.current.onopen = () => {
      ws.current?.send(JSON.stringify({ type: 'IDENTIFY', payload: { userId } }));
      ws.current?.send(JSON.stringify({ type: 'PRESENCE_UPDATE', payload: { userId, status: 'online' } }));
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
            // Play notification sound for messages from other users in non-muted channels/DMs
            if (msg.authorId !== userId) {
              const { isChannelMuted } = useAppStore.getState();
              const isMuted = msg.channelId ? isChannelMuted(msg.channelId) : false;
              if (!isMuted) playNotificationSound();
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
            // Dispatch to WebRTC hook listener
            if (_onVoiceSignal) _onVoiceSignal(data.payload);
            break;
          }

          case 'VOICE_ROOM_STATE': {
            const { channelId, users } = data.payload;
            setVoiceRoomState(channelId, users);
            // Notify WebRTC hook about existing peers to connect to
            users.forEach(u => {
              if (u.userId !== userId && _onNewPeer) _onNewPeer(u.userId);
            });
            break;
          }

          case 'VOICE_USER_JOINED': {
            const { channelId, user } = data.payload;
            addVoiceChannelUser(channelId, user);
            // Do NOT call _onNewPeer here. The joining user already receives VOICE_ROOM_STATE
            // and creates the offer for each existing peer. Existing peers only respond to
            // incoming offers — if both sides create offers simultaneously (glare), both
            // setRemoteDescription calls throw and audio never connects.
            break;
          }

          case 'VOICE_USER_LEFT': {
            const { channelId, userId: leftUserId } = data.payload;
            removeVoiceChannelUser(channelId, leftUserId);
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
        }
      } catch (e) {
        console.error('WebSocket message parse error', e);
      }
    };

    return () => {
      _sendSignal = null;
      ws.current?.send(JSON.stringify({ type: 'PRESENCE_UPDATE', payload: { userId, status: 'offline' } }));
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
