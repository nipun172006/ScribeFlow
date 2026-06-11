import type { ReactNode } from "react";

type MetricCardProps = {
  label: string;
  value: string;
  detail?: string;
  icon: ReactNode;
};

export function MetricCard({ label, value, detail, icon }: MetricCardProps) {
  return (
    <section className="rounded-card border border-border/80 bg-surface p-5 shadow-soft">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-muted">{label}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-control border border-border bg-surface-raised text-accent">
          {icon}
        </span>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-normal text-primary">
        {value}
      </p>
      {detail ? <p className="mt-2 text-sm text-muted">{detail}</p> : null}
    </section>
  );
}
