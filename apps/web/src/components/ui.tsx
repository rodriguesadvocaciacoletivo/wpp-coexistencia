import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Componentes básicos da interface.
 *
 * Deliberadamente pequenos e sem abstração extra: enquanto o design system não
 * for necessário, uma função por elemento resolve e mantém a leitura direta.
 */

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-500 disabled:bg-brand-600/50',
  secondary:
    'bg-surface-700 text-content-100 hover:bg-surface-600 disabled:opacity-50',
  ghost:
    'bg-transparent text-content-200 hover:bg-surface-800 disabled:opacity-50',
  danger:
    'bg-danger-500 text-white hover:bg-danger-400 disabled:bg-danger-500/50',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed',
        BUTTON_VARIANTS[variant],
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}

export function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-content-200"
      >
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-content-400">{hint}</p>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger-400">
          {error}
        </p>
      )}
    </div>
  );
}

const CONTROL_CLASS =
  'w-full rounded-lg border border-surface-700 bg-surface-850 px-3 py-2.5 text-sm text-content-100 placeholder:text-content-400 transition-colors focus:border-brand-500 disabled:opacity-50';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(CONTROL_CLASS, className)} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props} className={cn(CONTROL_CLASS, 'resize-y', className)} />
  );
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(CONTROL_CLASS, className)}>
      {children}
    </select>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-surface-800 bg-surface-900">
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-surface-800 px-5 py-4">
          <div>
            {title && (
              <h2 className="text-base font-semibold text-content-100">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-sm text-content-400">{description}</p>
            )}
          </div>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'brand';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-700 text-content-200',
  success: 'bg-success-500/15 text-success-400',
  warning: 'bg-warning-400/15 text-warning-400',
  danger: 'bg-danger-500/15 text-danger-400',
  brand: 'bg-brand-500/15 text-brand-400',
};

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-surface-700 px-6 py-12 text-center">
      <p className="text-sm font-medium text-content-200">{title}</p>
      {description && (
        <p className="max-w-md text-sm text-content-400">{description}</p>
      )}
      {action}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-content-400">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="text-sm">{label ?? 'Carregando…'}</span>
    </div>
  );
}
