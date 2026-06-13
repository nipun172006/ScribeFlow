import type { ReactNode } from "react";

type MetricCardProps = {
  label: string;
  value: string;
  detail?: string;
  icon: ReactNode;
};

export function MetricCard({ label, value, detail, icon }: MetricCardProps) {
  return (
    <section className="flex min-h-[8.5rem] flex-col justify-between rounded-card border border-white/10 bg-white/[0.06] p-5 shadow-soft backdrop-blur-xl transition duration-normal hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.09]">
      <div className="flex items-center justify-between gap-4">
        <p className="min-h-8 font-ui text-[11px] font-semibold uppercase leading-tight tracking-[0.14em] text-muted">
          {label}
        </p>
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] text-accent">
          {icon}
        </span>
      </div>
      <p className="mt-5 font-metric text-4xl font-semibold leading-none tracking-normal text-primary tabular-nums">
        {value}
      </p>
      {detail ? <p className="mt-2 text-xs leading-5 text-muted">{detail}</p> : null}
    </section>
  );
}
