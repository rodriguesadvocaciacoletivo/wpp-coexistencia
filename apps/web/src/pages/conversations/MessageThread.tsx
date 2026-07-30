import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  Download,
  FileText,
  LayoutTemplate,
  MapPin,
  Smartphone,
} from 'lucide-react';
import type { AttachmentDto, MessageDto, Paginated } from '@coexistente/shared';
import { apiRequest } from '../../lib/api';
import { Spinner, cn } from '../../components/ui';

export function MessageThread({ conversationId }: { conversationId: string }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const messagesQuery = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () =>
      apiRequest<Paginated<MessageDto>>(
        `/conversations/${conversationId}/messages`,
      ),
  });

  const messages = messagesQuery.data?.items;

  // Rola para o fim quando a conversa abre e a cada mensagem nova, como em
  // qualquer aplicativo de mensagem.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages?.length, conversationId]);

  if (messagesQuery.isPending) {
    return <Spinner label="Carregando mensagens…" />;
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      {messages?.length === 0 && (
        <p className="py-12 text-center text-sm text-content-400">
          Nenhuma mensagem nesta conversa ainda.
        </p>
      )}

      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        {messages?.map((message, index) => (
          <MessageRow
            key={message.id}
            message={message}
            showDate={shouldShowDate(messages, index)}
          />
        ))}
      </div>

      <div ref={bottomRef} />
    </div>
  );
}

function MessageRow({
  message,
  showDate,
}: {
  message: MessageDto;
  showDate: boolean;
}) {
  return (
    <>
      {showDate && (
        <div className="my-3 flex justify-center">
          <span className="rounded-full bg-surface-800 px-3 py-1 text-[11px] text-content-400">
            {formatDay(message.createdAt)}
          </span>
        </div>
      )}

      {message.type === 'system_event' ? (
        <SystemEvent message={message} />
      ) : (
        <MessageBubble message={message} />
      )}
    </>
  );
}

function SystemEvent({ message }: { message: MessageDto }) {
  return (
    <div className="my-1 flex justify-center">
      <span className="rounded-full bg-surface-850 px-3 py-1 text-[11px] text-content-400">
        {message.content}
      </span>
    </div>
  );
}

function MessageBubble({ message }: { message: MessageDto }) {
  const isInbound = message.direction === 'in';
  const isNote = message.type === 'private_note';
  const isEcho = message.origin === 'coexistence_echo';
  const isTemplate = message.type === 'template';

  return (
    <div className={cn('flex', isInbound ? 'justify-start' : 'justify-end')}>
      <div
        className={cn(
          'max-w-[80%] rounded-xl px-3.5 py-2.5',
          isNote
            ? 'border border-warning-400/30 bg-warning-400/10'
            : isInbound
              ? 'bg-surface-800'
              : 'bg-brand-600',
        )}
      >
        {isNote && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-warning-400">
            Nota interna · visível só para a equipe
          </p>
        )}

        {!isInbound && !isNote && (message.author || isTemplate) && (
          <p className="mb-1 flex items-center gap-1.5 text-[11px] text-white/70">
            {message.author?.name}
            {isTemplate && (
              <span className="flex items-center gap-1 rounded bg-white/15 px-1.5 py-0.5">
                <LayoutTemplate className="size-2.5" aria-hidden />
                Template
              </span>
            )}
          </p>
        )}

        {message.attachments.map((attachment) => (
          <AttachmentView key={attachment.id} attachment={attachment} />
        ))}

        {message.type === 'location' && <LocationView message={message} />}

        {message.content && (
          <p
            className={cn(
              'whitespace-pre-wrap break-words text-sm',
              isNote
                ? 'text-content-200'
                : isInbound
                  ? 'text-content-100'
                  : 'text-white',
            )}
          >
            {message.content}
          </p>
        )}

        {message.type === 'unsupported' && (
          <p className="text-sm italic text-content-300">
            Mensagem de tipo não suportado.
          </p>
        )}

        <div
          className={cn(
            'mt-1 flex items-center justify-end gap-1.5 text-[11px]',
            isInbound || isNote ? 'text-content-400' : 'text-white/70',
          )}
        >
          {isEcho && (
            <span
              className="flex items-center gap-1"
              title="Enviada pelo aplicativo do celular"
            >
              <Smartphone className="size-3" aria-hidden />
              celular
            </span>
          )}
          <span>{formatTime(message.createdAt)}</span>
          {!isInbound && !isNote && <StatusIcon message={message} />}
        </div>

        {message.status === 'failed' && message.errorMessage && (
          <p className="mt-1.5 flex items-start gap-1 text-[11px] text-danger-400">
            <AlertCircle className="mt-0.5 size-3 shrink-0" aria-hidden />
            {message.errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ message }: { message: MessageDto }) {
  switch (message.status) {
    case 'pending':
      return <Clock className="size-3" aria-label="Enviando" />;
    case 'sent':
      return <Check className="size-3" aria-label="Enviada" />;
    case 'delivered':
      return <CheckCheck className="size-3" aria-label="Entregue" />;
    case 'read':
      return (
        <CheckCheck className="size-3 text-sky-300" aria-label="Lida" />
      );
    case 'failed':
      return (
        <AlertCircle className="size-3 text-danger-400" aria-label="Falhou" />
      );
    default:
      return null;
  }
}

function AttachmentView({ attachment }: { attachment: AttachmentDto }) {
  const kind = attachment.mimeType.split('/')[0];

  if (kind === 'image') {
    return (
      <a href={attachment.url} target="_blank" rel="noreferrer" className="block">
        <img
          src={attachment.url}
          alt={attachment.originalName ?? 'Imagem recebida'}
          loading="lazy"
          className="mb-1.5 max-h-80 rounded-lg object-contain"
        />
      </a>
    );
  }

  if (kind === 'video') {
    return (
      <video
        controls
        preload="metadata"
        className="mb-1.5 max-h-80 rounded-lg"
        src={attachment.url}
      />
    );
  }

  if (kind === 'audio') {
    return <audio controls preload="metadata" className="mb-1.5 w-64" src={attachment.url} />;
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className="mb-1.5 flex items-center gap-2.5 rounded-lg bg-black/20 px-3 py-2.5 transition-colors hover:bg-black/30"
    >
      <FileText className="size-5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">
          {attachment.originalName ?? 'Documento'}
        </span>
        <span className="block text-[11px] opacity-70">
          {formatBytes(attachment.sizeBytes)}
        </span>
      </span>
      <Download className="size-4 shrink-0 opacity-70" aria-hidden />
    </a>
  );
}

function LocationView({ message }: { message: MessageDto }) {
  const payload = message.payload as
    | { latitude?: number; longitude?: number; address?: string }
    | null;

  if (!payload?.latitude || !payload?.longitude) {
    return null;
  }

  return (
    <a
      href={`https://www.google.com/maps?q=${payload.latitude},${payload.longitude}`}
      target="_blank"
      rel="noreferrer"
      className="mb-1.5 flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2.5 text-sm transition-colors hover:bg-black/30"
    >
      <MapPin className="size-4 shrink-0" aria-hidden />
      {payload.address ?? 'Ver no mapa'}
    </a>
  );
}

function shouldShowDate(messages: MessageDto[], index: number): boolean {
  if (index === 0) {
    return true;
  }

  const previous = messages[index - 1];
  const current = messages[index];

  if (!previous || !current) {
    return false;
  }

  return (
    new Date(previous.createdAt).toDateString() !==
    new Date(current.createdAt).toDateString()
  );
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDay(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);

  if (date.toDateString() === today.toDateString()) {
    return 'Hoje';
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Ontem';
  }

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
