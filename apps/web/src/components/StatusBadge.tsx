import type { MeetingStatus } from "@scribeflow/shared";
import { cx } from "../lib/classNames";

const statusLabels: Record<MeetingStatus, string> = {
  created: "Created",
  uploading: "Uploading",
  transcribing: "Transcribing",
  transcribed: "Transcript ready",
  analysing: "Analysing",
  indexing: "Indexing",
  completed: "Completed",
  failed: "Failed",
};

const statusDescriptions: Record<MeetingStatus, string> = {
  created: "Recording metadata is ready and processing has not started.",
  uploading: "The private storage upload has not been verified yet.",
  transcribing: "Deepgram transcription and diarisation are running.",
  transcribed: "Transcript is ready; Gemini analysis may still need to run.",
  analysing: "Gemini summary, topics and action items are being generated.",
  indexing: "Retrieval indexing is running.",
  completed: "Transcript and Gemini analysis are ready.",
  failed: "A processing step failed.",
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
      title={statusDescriptions[status]}
      aria-label={`${statusLabels[status]}: ${statusDescriptions[status]}`}
      className={cx(
        "inline-flex items-center rounded-control border px-2.5 py-1 text-xs font-semibold",
        tone,
      )}
    >
      {statusLabels[status]}
    </span>
  );
}
