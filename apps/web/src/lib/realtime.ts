import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from './api';

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/api\/?$/, '') ??
  'http://localhost:3333';

let socket: Socket | null = null;

/**
 * Conexão de tempo real com a API.
 *
 * Os eventos carregam apenas identificadores e servem como gatilho de
 * revalidação — quem busca o dado é o React Query. Aplicar payloads direto no
 * cache criaria divergência quando dois eventos chegassem fora de ordem.
 */
export function useRealtime(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = getAccessToken();

    if (!token) {
      return;
    }

    socket = io(`${API_URL}/realtime`, {
      auth: { token },
      transports: ['websocket'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });

    const invalidateConversations = (): void => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-counts'] });
    };

    const invalidateMessages = (payload: { conversationId: string }): void => {
      void queryClient.invalidateQueries({
        queryKey: ['messages', payload.conversationId],
      });
      invalidateConversations();
    };

    socket.on('message.created', invalidateMessages);
    socket.on('message.status_updated', invalidateMessages);
    socket.on('conversation.created', invalidateConversations);
    socket.on('conversation.updated', invalidateConversations);
    socket.on('inbox.connection_changed', () => {
      void queryClient.invalidateQueries({ queryKey: ['inboxes'] });
    });

    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, [queryClient]);
}

/** Reconecta com o token novo depois de uma renovação de sessão. */
export function refreshRealtimeAuth(): void {
  const token = getAccessToken();

  if (socket && token) {
    socket.auth = { token };
    socket.disconnect().connect();
  }
}
