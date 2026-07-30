import { useEffect, useState } from 'react';
import { isWindowOpen, windowRemainingLabel } from '@coexistente/shared';

/** Meio minuto: o rótulo tem resolução de minutos, então basta. */
const TICK_MS = 30_000;

export interface WindowState {
  open: boolean;
  label: string;
}

/**
 * Estado da janela de 24h, recalculado sozinho.
 *
 * Sem o tick, um atendente com a conversa aberta continuaria vendo o composer
 * liberado depois da janela expirar, e só descobriria ao tomar 403 no envio.
 * Aqui a tela fecha o composer no momento certo, sem depender de recarregar.
 */
export function useConversationWindow(
  windowExpiresAt: string | null,
): WindowState {
  const compute = (): WindowState => ({
    open: isWindowOpen(windowExpiresAt),
    label: windowRemainingLabel(windowExpiresAt),
  });

  const [state, setState] = useState<WindowState>(compute);

  useEffect(() => {
    setState(compute());

    const timer = window.setInterval(() => setState(compute()), TICK_MS);
    return () => window.clearInterval(timer);
    // `compute` fecha sobre `windowExpiresAt` e é recriada a cada render — só
    // a data importa como dependência.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowExpiresAt]);

  return state;
}
