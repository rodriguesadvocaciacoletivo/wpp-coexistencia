import { Inbox } from 'lucide-react';
import { useIsAdmin } from '../stores/auth.store';
import { PageBody, PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/ui';

/**
 * Espaço reservado das conversas.
 *
 * A tela real chega na Fase 3, depois que a Fase 2 conectar a primeira caixa de
 * entrada à Cloud API. Fica aqui para que a navegação e o controle de acesso já
 * possam ser exercitados de ponta a ponta na Fase 1.
 */
export function ConversationsPage() {
  const isAdmin = useIsAdmin();

  return (
    <>
      <PageHeader
        title="Conversas"
        description="Atendimento das caixas de entrada conectadas."
      />
      <PageBody>
        <EmptyState
          title="Nenhuma caixa de entrada conectada"
          description={
            isAdmin
              ? 'A conexão com a WhatsApp Cloud API entra na Fase 2. Por enquanto, use as configurações para montar a equipe e validar o envio de e-mails.'
              : 'Assim que um administrador conectar uma caixa de entrada, as conversas aparecem aqui.'
          }
          action={
            <span className="mt-2 inline-flex items-center gap-2 text-xs text-content-400">
              <Inbox className="size-4" aria-hidden />
              Minhas · Não atribuídas · Todos
            </span>
          }
        />
      </PageBody>
    </>
  );
}
