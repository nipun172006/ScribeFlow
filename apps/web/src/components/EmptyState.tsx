import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
};

export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-card border border-dashed border-border/90 bg-surface/70 px-5 py-8 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-card border border-border bg-surface-raised text-accent">
        {icon}
      </div>
      <h2 className="mt-4 text-base font-semibold text-primary">{title}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">{message}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
