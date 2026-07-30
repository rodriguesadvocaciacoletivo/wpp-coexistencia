import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ExternalLink, Phone, Search, Send } from 'lucide-react';
import {
  CATEGORY_LABELS,
  isTemplateSendable,
  missingTemplateVariables,
  renderTemplatePreview,
  templateBodyText,
  templateVariables,
  type ConversationDto,
  type MessageDto,
  type TemplateDto,
} from '@coexistente/shared';
import { ApiError, apiRequest } from '../../lib/api';
import { Modal } from '../../components/Modal';
import { Button, Input, Spinner, cn } from '../../components/ui';

/**
 * Escolha, preenchimento e envio de template.
 *
 * Só lista templates aprovados: os demais não podem ser enviados, e mostrá-los
 * no meio de um atendimento só gera tentativa frustrada. Quem administra vê o
 * catálogo completo, com status e motivo de recusa, na tela da caixa de entrada.
 */
export function TemplatePicker({
  conversation,
  open,
  onClose,
}: {
  conversation: ConversationDto;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  const templatesQuery = useQuery({
    queryKey: ['templates', conversation.inboxId],
    queryFn: () =>
      apiRequest<TemplateDto[]>(`/inboxes/${conversation.inboxId}/templates`),
    enabled: open,
  });

  // Reabrir o modal deve partir do zero: manter a escolha anterior faria o
  // atendente enviar o template da conversa passada sem perceber.
  useEffect(() => {
    if (!open) {
      setSearch('');
      setSelectedName(null);
      setLanguage(null);
      setValues({});
    }
  }, [open]);

  const groups = useMemo(
    () => groupByName(templatesQuery.data ?? [], search),
    [templatesQuery.data, search],
  );

  const group = groups.find((item) => item.name === selectedName) ?? null;
  const template =
    group?.templates.find((item) => item.language === language) ??
    group?.templates[0] ??
    null;

  const variables = useMemo(
    () => (template ? templateVariables(template.components) : []),
    [template],
  );

  const missing = template
    ? missingTemplateVariables(template.components, values)
    : [];

  const send = useMutation({
    mutationFn: () =>
      apiRequest<MessageDto>(
        `/conversations/${conversation.id}/messages/template`,
        {
          method: 'POST',
          body: { templateId: template?.id, variables: values },
        },
      ),
    onSuccess: () => {
      toast.success('Template enviado.');
      void queryClient.invalidateQueries({
        queryKey: ['messages', conversation.id],
      });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      onClose();
    },
    onError: (error: unknown) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível enviar o template.',
      ),
  });

  const select = (name: string): void => {
    setSelectedName(name);
    setLanguage(
      groups.find((item) => item.name === name)?.templates[0]?.language ?? null,
    );
    setValues({});
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Enviar template"
      description="Mensagens aprovadas pela Meta. Únicas aceitas com a janela de 24 horas fechada."
      bodyClassName="min-h-0 flex-1 overflow-hidden"
    >
      <div className="grid h-[26rem] grid-cols-1 divide-y divide-surface-800 sm:grid-cols-[18rem_minmax(0,1fr)] sm:divide-x sm:divide-y-0">
        <div className="flex min-h-0 flex-col">
          <div className="relative shrink-0 p-3">
            <Search
              className="pointer-events-none absolute left-6 top-1/2 size-4 -translate-y-1/2 text-content-400"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome ou texto…"
              aria-label="Buscar template"
              className="pl-9"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {templatesQuery.isPending && <Spinner label="Carregando…" />}

            {templatesQuery.data && groups.length === 0 && (
              <p className="px-1 py-6 text-center text-xs text-content-400">
                {search
                  ? 'Nenhum template corresponde à busca.'
                  : 'Nenhum template aprovado nesta caixa de entrada.'}
              </p>
            )}

            <ul className="flex flex-col gap-1">
              {groups.map((item) => (
                <li key={item.name}>
                  <button
                    type="button"
                    onClick={() => select(item.name)}
                    className={cn(
                      'w-full rounded-lg px-3 py-2 text-left transition-colors',
                      item.name === selectedName
                        ? 'bg-brand-600/15 ring-1 ring-brand-500/40'
                        : 'hover:bg-surface-850',
                    )}
                  >
                    <span className="block truncate text-sm text-content-100">
                      {item.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-content-400">
                      {CATEGORY_LABELS[item.templates[0]!.category]} ·{' '}
                      {item.templates.map((t) => t.language).join(', ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex min-h-0 flex-col">
          {!template && (
            <p className="grid flex-1 place-items-center px-6 text-center text-sm text-content-400">
              Escolha um template à esquerda para preencher e pré-visualizar.
            </p>
          )}

          {template && group && (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {group.templates.length > 1 && (
                  <div className="mb-4 flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-xs text-content-400">
                      Idioma:
                    </span>
                    {group.templates.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setLanguage(option.language);
                          setValues({});
                        }}
                        className={cn(
                          'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                          option.language === template.language
                            ? 'bg-brand-600 text-white'
                            : 'bg-surface-800 text-content-300 hover:text-content-100',
                        )}
                      >
                        {option.language}
                      </button>
                    ))}
                  </div>
                )}

                {variables.length > 0 && (
                  <div className="mb-4 flex flex-col gap-2.5">
                    {variables.map((variable) => (
                      <label key={variable.key} className="block">
                        <span className="mb-1 block text-xs text-content-400">
                          {variable.label}
                        </span>
                        <Input
                          value={values[variable.key] ?? ''}
                          onChange={(event) =>
                            setValues((current) => ({
                              ...current,
                              [variable.key]: event.target.value,
                            }))
                          }
                          placeholder={`{{${variable.position}}}`}
                        />
                      </label>
                    ))}
                  </div>
                )}

                <Preview template={template} values={values} />
              </div>

              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-surface-800 px-4 py-3">
                <p className="text-[11px] text-content-400">
                  {missing.length > 0
                    ? `${missing.length} variável(is) por preencher`
                    : 'Pronto para enviar'}
                </p>

                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={onClose}>
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    loading={send.isPending}
                    disabled={missing.length > 0}
                    onClick={() => send.mutate()}
                  >
                    <Send className="size-3.5" aria-hidden />
                    Enviar
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Como a mensagem vai chegar no aparelho do contato. */
function Preview({
  template,
  values,
}: {
  template: TemplateDto;
  values: Record<string, string>;
}) {
  const preview = renderTemplatePreview(template.components, values);

  return (
    <div>
      <p className="mb-1.5 text-[11px] uppercase tracking-wide text-content-400">
        Pré-visualização
      </p>

      <div className="rounded-xl rounded-tl-sm bg-surface-800 px-3.5 py-2.5">
        {preview.header && (
          <p className="mb-1 whitespace-pre-wrap break-words text-sm font-semibold text-content-100">
            {preview.header}
          </p>
        )}

        <p className="whitespace-pre-wrap break-words text-sm text-content-100">
          {preview.body}
        </p>

        {preview.footer && (
          <p className="mt-1.5 whitespace-pre-wrap break-words text-[11px] text-content-400">
            {preview.footer}
          </p>
        )}

        {preview.buttons.length > 0 && (
          <div className="-mx-1 mt-2 flex flex-col gap-1 border-t border-surface-700 pt-2">
            {preview.buttons.map((button, index) => (
              <span
                key={`${button.text}-${index}`}
                className="flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-brand-400"
              >
                {button.type === 'URL' && (
                  <ExternalLink className="size-3" aria-hidden />
                )}
                {button.type === 'PHONE_NUMBER' && (
                  <Phone className="size-3" aria-hidden />
                )}
                {button.text}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface TemplateGroup {
  name: string;
  templates: TemplateDto[];
}

/**
 * Agrupa por nome, porque a Meta trata o mesmo nome em idiomas diferentes como
 * templates distintos — para quem atende é uma mensagem só, com uma escolha de
 * idioma. A busca cobre nome e corpo: o atendente lembra do texto ("aquele do
 * boleto"), raramente do identificador.
 */
function groupByName(templates: TemplateDto[], search: string): TemplateGroup[] {
  const term = normalize(search);

  const matches = templates.filter((template) => {
    if (!isTemplateSendable(template.status)) {
      return false;
    }
    if (!term) {
      return true;
    }

    return (
      normalize(template.name).includes(term) ||
      normalize(templateBodyText(template.components)).includes(term)
    );
  });

  const groups = new Map<string, TemplateDto[]>();

  for (const template of matches) {
    const list = groups.get(template.name) ?? [];
    list.push(template);
    groups.set(template.name, list);
  }

  return [...groups.entries()]
    .map(([name, list]) => ({
      name,
      templates: [...list].sort((a, b) => a.language.localeCompare(b.language)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Busca sem acento: "sao paulo" acha "São Paulo". */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}
