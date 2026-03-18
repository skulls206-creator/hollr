import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getListMessagesQueryKey, getListDmMessagesQueryKey, getListDmThreadsQueryKey } from '@workspace/api-client-react';
import type { Message } from '@workspace/api-client-react';

type WsEvent =
  | { type: 'MESSAGE_CREATE'; payload: Message }
  | { type: 'MESSAGE_UPDATE'; payload: Message }
  | { type: 'MESSAGE_DELETE'; payload: { id: string; channelId?: string; dmThreadId?: string } }
  | { type: 'VOICE_SIGNAL'; payload: any }
  | { type: 'CONNECTED' };

export function useRealtime(userId?: string) {
  const queryClient = useQueryClient();
  const ws = useRef<WebSocket | null>(null);
  const sendSignalRef = useRef<(payload: any) => void>(() => {});

  useEffect(() => {
    if (!userId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;

    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      ws.current?.send(JSON.stringify({ type: 'IDENTIFY', payload: { userId } }));
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WsEvent;

        switch (data.type) {
          case 'MESSAGE_CREATE': {
            const msg = data.payload;

            // Server channel message
            if (msg.channelId) {
              queryClient.setQueryData<Message[]>(
                getListMessagesQueryKey(msg.channelId),
                (old) => {
                  if (!old) return [msg];
                  if (old.some(m => m.id === msg.id)) return old;
                  return [msg, ...old];
                }
              );
            }

            // DM message
            if (msg.dmThreadId) {
              queryClient.setQueryData<Message[]>(
                getListDmMessagesQueryKey(msg.dmThreadId),
                (old) => {
                  if (!old) return [msg];
                  if (old.some(m => m.id === msg.id)) return old;
                  return [msg, ...old];
                }
              );
              // Refresh thread list so lastMessage updates
              queryClient.invalidateQueries({ queryKey: getListDmThreadsQueryKey() });
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
        }
      } catch (e) {
        console.error('WebSocket message parse error', e);
      }
    };

    return () => {
      ws.current?.close();
    };
  }, [userId, queryClient]);

  const sendSignal = (payload: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'VOICE_SIGNAL', payload }));
    }
  };
  sendSignalRef.current = sendSignal;

  return { sendSignal };
}
