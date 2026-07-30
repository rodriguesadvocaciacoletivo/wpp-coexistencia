import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  LayoutTemplate,
  Mic,
  Paperclip,
  Send,
  Square,
  TriangleAlert,
  X,
} from 'lucide-react';
import type { ConversationDto } from '@coexistente/shared';
import { ApiError, getAccessToken } from '../../lib/api';
import { Button, cn } from '../../components/ui';
import { TemplatePicker } from './TemplatePicker';
import { useConversationWindow } from './use-window-state';

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  'http://localhost:3333/api';

type Tab = 'reply' | 'note';

export function Composer({ conversation }: { conversation: ConversationDto }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [tab, setTab] = useState<Tab>('reply');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const recorder = useAudioRecorder();

  const messageWindow = useConversationWindow(conversation.windowExpiresAt);
  const windowOpen = messageWindow.open;
  const isNote = tab === 'note';
  // Nota interna não passa pela Meta, então a janela de 24h não se aplica.
  const blocked = !isNote && !windowOpen;

  const send = useMutation({
    mutationFn: async () => {
      const form = new FormData();

      if (text.trim()) {
        form.append('content', text.trim());
      }
      if (isNote) {
        form.append('privateNote', 'true');
      }
      if (file) {
        form.append('file', file);
      }

      const response = await fetch(
        `${API_URL}/conversations/${conversation.id}/messages`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` },
          credentials: 'include',
          body: form,
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string | string[];
        } | null;

        const message = Array.isArray(payload?.message)
          ? payload.message.join(' ')
          : (payload?.message ?? 'Não foi possível enviar a mensagem.');

        throw new ApiError(response.status, message);
      }

      return response.json();
    },
    onSuccess: () => {
      setText('');
      setFile(null);
      void queryClient.invalidateQueries({
        queryKey: ['messages', conversation.id],
      });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error: unknown) =>
      toast.error(
        error instanceof ApiError ? error.message : 'Falha ao enviar a mensagem.',
      ),
  });

  const submit = (event?: FormEvent): void => {
    event?.preventDefault();

    if (!text.trim() && !file) {
      return;
    }

    send.mutate();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    // Enter envia, Shift+Enter quebra linha — o comportamento que qualquer
    // atendente já espera de um chat.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const attachRecording = async (): Promise<void> => {
    const recorded = await recorder.stop();

    if (recorded) {
      setFile(recorded);
    }
  };

  return (
    <div className="border-t border-surface-800 bg-surface-900 px-4 py-3">
      <div className="mx-auto max-w-3xl">
        <div className="mb-2 flex items-center gap-1">
          <TabButton active={tab === 'reply'} onClick={() => setTab('reply')}>
            Responder
          </TabButton>
          <TabButton active={tab === 'note'} onClick={() => setTab('note')}>
            Mensagem privada
          </TabButton>

          {!isNote && (
            <span
              className={cn(
                'ml-auto text-[11px]',
                windowOpen ? 'text-content-400' : 'text-warning-400',
              )}
            >
              {messageWindow.label}
            </span>
          )}
        </div>

        {blocked && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-warning-400/30 bg-warning-400/10 p-3 text-xs text-warning-400">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              A janela de 24 horas está fechada. A Meta só aceita template para
              retomar a conversa.
            </span>
            <Button
              type="button"
              variant="secondary"
              className="shrink-0 px-3 py-1.5 text-xs"
              onClick={() => setTemplatesOpen(true)}
            >
              <LayoutTemplate className="size-3.5" aria-hidden />
              Escolher template
            </Button>
          </div>
        )}

        {file && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-surface-800 px-3 py-2 text-sm">
            <Paperclip className="size-4 shrink-0 text-content-400" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <span className="shrink-0 text-xs text-content-400">
              {(file.size / 1024).toFixed(0)} KB
            </span>
            <button
              type="button"
              onClick={() => setFile(null)}
              aria-label="Remover anexo"
              className="rounded p-1 text-content-400 hover:bg-surface-700 hover:text-content-100"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        )}

        {recorder.error && (
          <p className="mb-2 rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-xs text-danger-400">
            {recorder.error}
          </p>
        )}

        <form
          onSubmit={submit}
          className={cn(
            'rounded-xl border bg-surface-850 p-2',
            isNote ? 'border-warning-400/40' : 'border-surface-700',
          )}
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={blocked || send.isPending}
            rows={2}
            maxLength={4096}
            placeholder={
              blocked
                ? 'Janela de 24 horas fechada'
                : isNote
                  ? 'Anotação visível apenas para a equipe…'
                  : 'Shift + Enter para nova linha'
            }
            className="w-full resize-none bg-transparent px-2 py-1.5 text-sm text-content-100 placeholder:text-content-400 focus:outline-none disabled:opacity-50"
          />

          <div className="flex items-center gap-1 px-1">
            <input
              ref={fileInputRef}
              type="file"
              hidden
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) {
                  setFile(selected);
                }
                event.target.value = '';
              }}
            />

            <IconButton
              label="Anexar arquivo"
              disabled={blocked || isNote || send.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="size-4" aria-hidden />
            </IconButton>

            {/* Template também serve dentro da janela — lembrete, confirmação,
                aviso de entrega. Restringir ao bloqueio só criaria atrito. */}
            <IconButton
              label="Enviar template"
              disabled={isNote || send.isPending}
              onClick={() => setTemplatesOpen(true)}
            >
              <LayoutTemplate className="size-4" aria-hidden />
            </IconButton>

            {recorder.recording ? (
              <IconButton
                label="Parar gravação"
                onClick={() => void attachRecording()}
                className="text-danger-400"
              >
                <Square className="size-4" aria-hidden />
              </IconButton>
            ) : (
              <IconButton
                label="Gravar áudio"
                disabled={blocked || isNote || send.isPending}
                onClick={() => void recorder.start()}
              >
                <Mic className="size-4" aria-hidden />
              </IconButton>
            )}

            {recorder.recording && (
              <span className="text-xs text-danger-400">
                Gravando {recorder.seconds}s
              </span>
            )}

            <Button
              type="submit"
              className="ml-auto px-3 py-1.5 text-xs"
              variant={isNote ? 'secondary' : 'primary'}
              loading={send.isPending}
              disabled={blocked || (!text.trim() && !file)}
            >
              <Send className="size-3.5" aria-hidden />
              {isNote ? 'Salvar nota' : 'Enviar'}
            </Button>
          </div>
        </form>
      </div>

      <TemplatePicker
        conversation={conversation}
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-surface-800 text-content-100'
          : 'text-content-400 hover:text-content-200',
      )}
    >
      {children}
    </button>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-lg p-2 text-content-400 transition-colors hover:bg-surface-800 hover:text-content-100 disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Gravação de áudio pelo navegador.
 *
 * A Cloud API aceita OGG/Opus, MP3, AMR, M4A e AAC para áudio. O Firefox grava
 * OGG/Opus nativamente; o Chrome só oferece WebM, que a Meta recusa. Por isso a
 * negociação abaixo tenta OGG primeiro e avisa quando o navegador não consegue
 * produzir um formato aceito, em vez de gravar algo que falharia no envio.
 */
function useAudioRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const start = async (): Promise<void> => {
    setError(null);

    const mimeType = ['audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'].find(
      (candidate) => MediaRecorder.isTypeSupported(candidate),
    );

    if (!mimeType) {
      setError(
        'Este navegador não grava em um formato aceito pelo WhatsApp. Use o Firefox ou anexe um arquivo de áudio.',
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType });

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);

      timerRef.current = window.setInterval(
        () => setSeconds((value) => value + 1),
        1000,
      );
    } catch {
      setError('Não foi possível acessar o microfone. Verifique a permissão do navegador.');
    }
  };

  const stop = async (): Promise<File | null> => {
    const recorder = recorderRef.current;

    if (!recorder) {
      return null;
    }

    return new Promise<File | null>((resolve) => {
      recorder.onstop = () => {
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }

        recorder.stream.getTracks().forEach((track) => track.stop());
        setRecording(false);

        const type = recorder.mimeType.split(';')[0] ?? 'audio/ogg';
        const blob = new Blob(chunksRef.current, { type });
        const extension = type.includes('mp4') ? 'm4a' : 'ogg';

        recorderRef.current = null;
        resolve(new File([blob], `audio-${Date.now()}.${extension}`, { type }));
      };

      recorder.stop();
    });
  };

  return { recording, seconds, error, start, stop };
}
