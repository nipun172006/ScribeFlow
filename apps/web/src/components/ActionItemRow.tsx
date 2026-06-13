import type { ActionItem } from "@scribeflow/shared";
import { CheckCircle2, Circle, LocateFixed } from "lucide-react";
import { formatTimestamp } from "../lib/format";

type ActionItemRowProps = {
  item: ActionItem;
  onStatusChange?: (status: ActionItem["status"]) => void;
  onEvidenceClick?: (segmentId: string) => void;
  disabled?: boolean;
};

export function ActionItemRow({
  item,
  onStatusChange,
  onEvidenceClick,
  disabled,
}: ActionItemRowProps) {
  const complete = item.status === "completed";
  const primaryEvidenceSegmentId =
    item.sourceSegmentId ?? item.evidenceSegmentIds?.[0] ?? null;

  return (
    <article className="rounded-card border border-white/10 bg-white/[0.055] p-4 shadow-soft backdrop-blur-xl">
      <div className="flex items-start gap-3">
        {onStatusChange ? (
          <button
            type="button"
            disabled={disabled}
            className={complete ? "text-success" : "text-muted"}
            onClick={() => onStatusChange(complete ? "open" : "completed")}
            aria-label={complete ? "Reopen action item" : "Complete action item"}
          >
            {complete ? (
              <CheckCircle2 size={18} aria-hidden="true" />
            ) : (
              <Circle size={18} aria-hidden="true" />
            )}
          </button>
        ) : (
          <span className={complete ? "text-success" : "text-muted"}>
            {complete ? (
              <CheckCircle2 size={18} aria-hidden="true" />
            ) : (
              <Circle size={18} aria-hidden="true" />
            )}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-primary">{item.task}</p>
          <p className="mt-1 text-sm text-muted">
            Owner: {item.ownerName ?? "Unassigned"} · Deadline:{" "}
            {item.deadlineText ?? item.deadline ?? "Not mentioned"}
          </p>
          {item.confidence != null ? (
            <p className="mt-1 text-xs font-medium text-muted">
              Confidence {(item.confidence * 100).toFixed(0)}%
            </p>
          ) : null}
          {item.evidenceText ? (
            <p className="mt-2 text-sm leading-6 text-muted">
              Evidence {formatTimestamp(item.sourceStartMs)}: {item.evidenceText}
            </p>
          ) : null}
          {primaryEvidenceSegmentId ? (
            <button
              type="button"
              onClick={() => onEvidenceClick?.(primaryEvidenceSegmentId)}
              className="mt-3 inline-flex items-center gap-2 rounded-control border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs font-semibold text-primary hover:border-accent/70"
            >
              <LocateFixed size={14} aria-hidden="true" />
              Jump to evidence
            </button>
          ) : item.sourceStartMs != null || item.sourceEndMs != null ? (
            <p className="mt-2 text-xs text-muted">
              Evidence timestamp {formatTimestamp(item.sourceStartMs)}
              {item.sourceEndMs != null ? `-${formatTimestamp(item.sourceEndMs)}` : ""}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
