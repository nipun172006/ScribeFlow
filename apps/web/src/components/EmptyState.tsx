import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
};

export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center rounded-card border border-dashed border-white/[0.14] bg-white/[0.055] px-6 py-10 text-center shadow-soft backdrop-blur-xl">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.075] text-accent">
        {icon}
      </div>
      <h2 className="mt-5 font-display text-xl font-semibold text-primary">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">{message}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
