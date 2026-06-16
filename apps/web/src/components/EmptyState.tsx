import type { ReactNode } from "react";
import { cx } from "../lib/classNames";

type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
  variant?: "card" | "open";
};

export function EmptyState({
  icon,
  title,
  message,
  action,
  variant = "card",
}: EmptyStateProps) {
  return (
    <div
      className={cx(
        "flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center",
        variant === "card"
          ? "rounded-card border border-dashed border-white/[0.14] bg-white/[0.055] shadow-soft backdrop-blur-xl"
          : "rounded-panel bg-transparent",
      )}
    >
      <div
        className={cx(
          "flex h-12 w-12 items-center justify-center rounded-2xl border text-accent",
          variant === "card"
            ? "border-white/10 bg-white/[0.075]"
            : "border-white/[0.08] bg-white/[0.035]",
        )}
      >
        {icon}
      </div>
      <h2 className="mt-5 font-display text-xl font-semibold text-primary">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">{message}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
