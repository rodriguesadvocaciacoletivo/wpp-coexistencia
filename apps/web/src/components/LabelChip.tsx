import { X } from 'lucide-react';
import { cn } from './ui';

/**
 * Etiqueta colorida.
 *
 * A cor escolhida pelo administrador vira o texto e a borda, e entra no fundo
 * bem diluída. Pintar o fundo sólido com uma cor arbitrária obrigaria a
 * calcular o contraste do texto a cada renderização, e um amarelo forte com
 * texto branco fica ilegível.
 */
export function LabelChip({
  label,
  onRemove,
  className,
}: {
  label: { name: string; color: string };
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        className,
      )}
      style={{
        color: label.color,
        borderColor: withAlpha(label.color, 0.4),
        backgroundColor: withAlpha(label.color, 0.12),
      }}
    >
      <span className="truncate">{label.name}</span>

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover etiqueta ${label.name}`}
          className="-mr-0.5 shrink-0 rounded-full p-0.5 transition-opacity hover:opacity-70"
        >
          <X className="size-2.5" aria-hidden />
        </button>
      )}
    </span>
  );
}

/** `#RRGGBB` → `rgb(r g b / alpha)`. Devolve a cor original se não casar. */
function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);

  if (!match) {
    return hex;
  }

  const [, r, g, b] = match as unknown as [string, string, string, string];

  return `rgb(${parseInt(r, 16)} ${parseInt(g, 16)} ${parseInt(b, 16)} / ${alpha})`;
}
