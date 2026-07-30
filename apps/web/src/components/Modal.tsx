import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

const WIDTHS = {
  md: 'max-w-md',
  lg: 'max-w-3xl',
} as const;

export function Modal({
  open,
  title,
  description,
  onClose,
  size = 'md',
  bodyClassName,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  /** `lg` para diálogos com duas colunas, como a escolha de template. */
  size?: keyof typeof WIDTHS;
  bodyClassName?: string;
  children: ReactNode;
}) {
  // Fechar com Esc é esperado por qualquer usuário de teclado e evita que o
  // diálogo vire uma armadilha quando o botão de fechar sai da viewport.
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[90vh] w-full flex-col rounded-xl border border-surface-700 bg-surface-900 shadow-2xl ${WIDTHS[size]}`}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-surface-800 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-content-100">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm text-content-400">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-content-400 transition-colors hover:bg-surface-800 hover:text-content-100"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <div className={bodyClassName ?? 'min-h-0 flex-1 overflow-y-auto p-5'}>
          {children}
        </div>
      </div>
    </div>
  );
}
