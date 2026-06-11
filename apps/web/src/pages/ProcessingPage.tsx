import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Workflow } from "lucide-react";
import type { MeetingStatus } from "@scribeflow/shared";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { ProcessingStep } from "../components/ProcessingStep";
import { StatusBadge } from "../components/StatusBadge";
import { getMeetingDetail } from "../lib/apiClient";

const processingSteps = [
  {
    status: "uploading",
    label: "Uploading recording",
    description:
      "The browser uploads the selected audio file directly to private storage.",
  },
  {
    status: "transcribing",
    label: "Transcribing audio",
    description: "Deepgram Nova-3 will convert speech into timestamped text.",
  },
  {
    status: "transcribing",
    label: "Identifying speakers",
    description: "Deepgram diarisation will group words and segments by speaker.",
  },
  {
    status: "analysing",
    label: "Extracting decisions",
    description: "Gemini structured output will identify decisions and summary fields.",
  },
  {
    status: "analysing",
    label: "Building action items",
    description: "Tasks, owners, deadlines and evidence timestamps will be extracted.",
  },
  {
    status: "indexing",
    label: "Indexing meeting",
    description: "Transcript chunks and summaries will be embedded for retrieval.",
  },
  {
    status: "completed",
    label: "Complete",
    description: "The meeting detail page becomes available after processing succeeds.",
  },
] as const;

const statusOrder: Record<MeetingStatus, number> = {
  created: 1,
  uploading: 0,
  transcribing: 2,
  analysing: 4,
  indexing: 5,
  completed: 6,
  failed: -1,
};

export function ProcessingPage() {
  const { meetingId } = useParams();
  const meetingQuery = useQuery({
    queryKey: ["meeting-detail", meetingId],
    queryFn: () => getMeetingDetail(meetingId ?? ""),
    enabled: Boolean(meetingId),
  });

  const meeting = meetingQuery.data?.meeting;
  const activeIndex = meeting ? statusOrder[meeting.status] : -1;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Processing"
        title={meeting?.title ?? "Meeting processing"}
        description={
          meeting
            ? "This page reflects the persisted meeting status. AI transcription and analysis are intentionally not started in Phase 2."
            : `Meeting ${meetingId ?? "record"} is waiting for repository lookup.`
        }
        actions={
          <div className="flex flex-wrap gap-3">
            {meeting ? <StatusBadge status={meeting.status} /> : null}
            <Link
              to="/archive"
              className="inline-flex items-center gap-2 rounded-control border border-border bg-surface px-3 py-2 text-sm font-semibold text-primary hover:border-accent/70"
            >
              <ArrowLeft size={17} aria-hidden="true" />
              Archive
            </Link>
          </div>
        }
      />

      {meetingQuery.isLoading ? <LoadingState label="Loading meeting status" /> : null}

      {meetingQuery.error instanceof Error ? (
        <ErrorState
          title="Meeting status is unavailable"
          message={meetingQuery.error.message}
        />
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <ol className="space-y-5 rounded-card border border-border bg-surface p-5">
          {processingSteps.map((step, index) => (
            <ProcessingStep
              key={step.label}
              label={step.label}
              description={step.description}
              state={
                meeting?.status === "failed"
                  ? index === Math.max(0, activeIndex)
                    ? "failed"
                    : "pending"
                  : index < activeIndex
                    ? "complete"
                    : index === activeIndex && meeting?.status !== "created"
                      ? "active"
                      : "pending"
              }
            />
          ))}
        </ol>

        {meeting?.status === "uploading" ? (
          <EmptyState
            icon={<Workflow size={20} aria-hidden="true" />}
            title="Storage upload is not complete"
            message="The meeting record exists, but the API has not verified the private storage object yet."
          />
        ) : null}

        {meeting?.status === "created" && meeting.sourceType === "upload" ? (
          <EmptyState
            icon={<CheckCircle2 size={20} aria-hidden="true" />}
            title="Recording uploaded successfully"
            message="The audio object has been verified. Uploaded-audio transcription and diarisation will be connected in Phase 3."
          />
        ) : null}

        {meeting?.status === "failed" ? (
          <ErrorState
            title={meeting.errorCode ?? "Meeting failed"}
            message={meeting.errorMessage ?? "The meeting failed during processing."}
          />
        ) : null}

        {!meeting && !meetingQuery.isLoading && !meetingQuery.error ? (
          <EmptyState
            icon={<Workflow size={20} aria-hidden="true" />}
            title="No processing job is running"
            message="This page consumes real meeting status values and does not simulate processing transitions."
          />
        ) : null}
      </section>
    </div>
  );
}
