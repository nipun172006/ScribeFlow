import type { ActionItem } from "@scribeflow/shared";
import { CheckCircle2, Circle } from "lucide-react";
import { formatTimestamp } from "../lib/format";

type ActionItemRowProps = {
  item: ActionItem;
  onStatusChange?: (status: ActionItem["status"]) => void;
  disabled?: boolean;
};

export function ActionItemRow({ item, onStatusChange, disabled }: ActionItemRowProps) {
  const complete = item.status === "completed";

  return (
    <article className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        {onStatusChange ? (
          <button
            type="button"
            disabled={disabled}
            className={complete ? "text-success" : "text-muted"}
            onClick={() => onStatusChange(complete ? "open" : "completed")}
            aria-label={complete ? "Reopen action item" : "Complete action item"}
          >
            {complete ? <CheckCircle2 size={18} /> : <Circle size={18} />}
          </button>
        ) : (
          <span className={complete ? "text-success" : "text-muted"}>
            {complete ? <CheckCircle2 size={18} /> : <Circle size={18} />}
          </span>
        )}
        <div>
          <p className="text-sm font-semibold text-primary">{item.task}</p>
          <p className="mt-1 text-sm text-muted">
            Owner: {item.ownerName ?? "Unassigned"} · Deadline:{" "}
            {item.deadlineText ?? "Not detected"}
          </p>
          {item.evidenceText ? (
            <p className="mt-2 text-sm leading-6 text-muted">
              {formatTimestamp(item.sourceStartMs)} {item.evidenceText}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
