import type { MeetingStatus } from "@scribeflow/shared";
import { cx } from "../lib/classNames";

const statusLabels: Record<MeetingStatus, string> = {
  created: "Created",
  uploading: "Uploading",
  transcribing: "Transcribing",
  transcribed: "Transcribed",
  analysing: "Analysing",
  indexing: "Indexing",
  completed: "Completed",
  failed: "Failed",
};

type StatusBadgeProps = {
  status: MeetingStatus;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const tone =
    status === "completed"
      ? "border-success/40 bg-success/10 text-success"
      : status === "failed"
        ? "border-danger/40 bg-danger/10 text-danger"
        : "border-warning/40 bg-warning/10 text-warning";

  return (
    <span
      className={cx(
        "inline-flex items-center rounded-control border px-2.5 py-1 text-xs font-semibold",
        tone,
      )}
    >
      {statusLabels[status]}
    </span>
  );
}
