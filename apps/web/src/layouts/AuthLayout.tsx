import type { ReactNode } from 'react';
import { MessagesSquare } from 'lucide-react';

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-brand-600">
            <MessagesSquare className="size-5 text-white" aria-hidden />
          </span>
          <span className="text-base font-semibold">Atendimento WhatsApp</span>
        </div>

        <h1 className="text-xl font-semibold text-content-100">{title}</h1>
        {subtitle && (
          <p className="mt-2 text-sm text-content-400">{subtitle}</p>
        )}

        <div className="mt-6">{children}</div>

        {footer && <div className="mt-6 text-sm">{footer}</div>}
      </div>
    </div>
  );
}
