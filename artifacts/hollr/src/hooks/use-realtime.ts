import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getListMessagesQueryKey } from '@workspace/api-client-react';
import type { Message, Channel } from '@workspace/api-client-react';

type WsEvent = 
  | { type: 'MESSAGE_CREATE', payload: Message }
  | { type: 'MESSAGE_UPDATE', payload: Message }
  | { type: 'MESSAGE_DELETE', payload: { id: string, channelId: string } }
  | { type: 'CHANNEL_UPDATE', payload: Channel }
  | { type: 'VOICE_SIGNAL', payload: any };

export function useRealtime(userId?: string) {
  const queryClient = useQueryClient();
  const ws = useRef<WebSocket | null>(null);

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
            if (msg.channelId) {
              const queryKey = getListMessagesQueryKey(msg.channelId);
              queryClient.setQueryData<Message[]>(queryKey, (old) => {
                if (!old) return [msg];
                // Prevent duplicates
                if (old.some(m => m.id === msg.id)) return old;
                // Append at the beginning (assuming descending sort from API)
                return [msg, ...old];
              });
            }
            break;
          }
          case 'MESSAGE_UPDATE': {
            const msg = data.payload;
            if (msg.channelId) {
              const queryKey = getListMessagesQueryKey(msg.channelId);
              queryClient.setQueryData<Message[]>(queryKey, (old) => {
                if (!old) return old;
                return old.map(m => m.id === msg.id ? msg : m);
              });
            }
            break;
          }
          case 'MESSAGE_DELETE': {
            const { id, channelId } = data.payload;
            const queryKey = getListMessagesQueryKey(channelId);
            queryClient.setQueryData<Message[]>(queryKey, (old) => {
              if (!old) return old;
              return old.filter(m => m.id !== id);
            });
            break;
          }
          // Handle other real-time events as needed
        }
      } catch (e) {
        console.error("WebSocket message parse error", e);
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

  return { sendSignal };
}
