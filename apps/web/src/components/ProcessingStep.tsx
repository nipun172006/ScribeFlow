import { CheckCircle2, Circle, CircleDot, XCircle } from "lucide-react";
import { cx } from "../lib/classNames";

type ProcessingStepState = "pending" | "active" | "complete" | "failed";

type ProcessingStepProps = {
  label: string;
  description: string;
  state: ProcessingStepState;
};

export function ProcessingStep({ label, description, state }: ProcessingStepProps) {
  const Icon =
    state === "complete"
      ? CheckCircle2
      : state === "active"
        ? CircleDot
        : state === "failed"
          ? XCircle
          : Circle;

  return (
    <li className="flex gap-4">
      <span
        className={cx(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
          state === "complete" && "border-success/50 text-success",
          state === "active" && "border-accent/60 text-accent",
          state === "failed" && "border-danger/60 text-danger",
          state === "pending" && "border-border text-muted",
        )}
      >
        <Icon size={18} aria-hidden="true" />
      </span>
      <span>
        <span className="block text-sm font-semibold text-primary">{label}</span>
        <span className="mt-1 block text-sm leading-6 text-muted">{description}</span>
      </span>
    </li>
  );
}
