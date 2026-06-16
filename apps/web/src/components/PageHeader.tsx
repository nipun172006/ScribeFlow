import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="sf-fade-up relative overflow-hidden py-8 sm:py-10 lg:py-12">
      <div
        className="pointer-events-none absolute -left-10 top-2 h-56 w-[32rem] rounded-full bg-[radial-gradient(circle,rgba(129,140,248,0.16),transparent_68%)] blur-2xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute right-0 top-10 h-44 w-[28rem] rounded-full bg-[radial-gradient(circle,rgba(54,211,194,0.11),transparent_70%)] blur-2xl"
        aria-hidden="true"
      />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-5xl">
          {eyebrow ? (
            <p className="mb-3 font-ui text-xs font-semibold uppercase tracking-[0.22em] text-accent">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="font-display text-4xl font-semibold leading-[1.02] tracking-normal text-primary md:text-5xl lg:text-[4rem]">
            {title}
          </h1>
          {description ? (
            <p className="mt-5 max-w-3xl font-body text-base leading-7 text-muted md:text-lg">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap gap-3 md:justify-end md:pb-2">{actions}</div>
        ) : null}
      </div>
      <div className="relative mt-5 flex flex-wrap gap-2 font-ui text-xs font-medium text-muted">
        <span className="rounded-full border border-emerald-400/25 bg-emerald-400/[0.07] px-3 py-1 text-emerald-200">
          Secure server-side AI
        </span>
        <span className="rounded-full border border-cyan/25 bg-cyan/[0.07] px-3 py-1 text-cyan">
          Evidence-backed
        </span>
        <span className="rounded-full border border-white/[0.09] bg-white/[0.025] px-3 py-1">
          No silent fallbacks
        </span>
      </div>
    </header>
  );
}
