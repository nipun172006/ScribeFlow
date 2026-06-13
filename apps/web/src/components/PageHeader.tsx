import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="sf-fade-up overflow-hidden rounded-panel border border-white/10 bg-white/[0.055] p-6 shadow-soft backdrop-blur-xl md:p-7 lg:p-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="max-w-4xl">
          {eyebrow ? (
            <p className="mb-3 font-ui text-xs font-semibold uppercase tracking-[0.22em] text-accent">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="font-display text-4xl font-semibold leading-[1.02] tracking-normal text-primary md:text-5xl lg:text-6xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-4 max-w-3xl font-body text-base leading-7 text-muted md:text-lg">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
      <div className="mt-6 h-px w-full bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      <div className="mt-4 flex flex-wrap gap-2 font-ui text-xs font-medium text-muted">
        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-emerald-200">
          Secure server-side AI
        </span>
        <span className="rounded-full border border-cyan/30 bg-cyan/10 px-3 py-1 text-cyan">
          Evidence-backed
        </span>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
          No silent fallbacks
        </span>
      </div>
    </header>
  );
}
