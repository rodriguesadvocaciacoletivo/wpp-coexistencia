import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-surface-800 px-8 py-6">
      <div>
        <h1 className="text-lg font-semibold text-content-100">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-content-400">
            {description}
          </p>
        )}
      </div>
      {actions}
    </header>
  );
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-6 px-8 py-6">{children}</div>;
}
