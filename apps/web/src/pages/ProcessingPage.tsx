import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Play, RefreshCw, Workflow } from "lucide-react";
import type { MeetingDetail, MeetingStatus } from "@scribeflow/shared";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { ProcessingStep } from "../components/ProcessingStep";
import { StatusBadge } from "../components/StatusBadge";
import {
  analyzeMeeting,
  ApiClientError,
  getMeetingDetail,
  transcribeMeeting,
} from "../lib/apiClient";

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
  transcribed: 3,
  analysing: 4,
  indexing: 5,
  completed: 6,
  failed: -1,
};

const analysisFailureCodes = new Set([
  "GEMINI_AUTH_FAILED",
  "GEMINI_RATE_LIMITED",
  "GEMINI_REQUEST_TIMEOUT",
  "GEMINI_REQUEST_FAILED",
  "GEMINI_INVALID_RESPONSE",
  "MEETING_ANALYSIS_OUTPUT_INVALID",
  "ANALYSIS_PERSISTENCE_FAILED",
]);

const autoStartedMeetingIds = new Set<string>();
const autoStartedAnalysisIds = new Set<string>();

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const formatDuration = (seconds: number | null) => {
  if (seconds == null) {
    return null;
  }

  return `${Math.round(seconds)}s`;
};

export function ProcessingPage() {
  const { meetingId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const meetingQuery = useQuery({
    queryKey: ["meeting-detail", meetingId],
    queryFn: () => getMeetingDetail(meetingId ?? ""),
    enabled: Boolean(meetingId),
    refetchInterval: (query) => {
      const detail = query.state.data as MeetingDetail | undefined;
      return detail?.meeting.status === "transcribing" ||
        detail?.meeting.status === "analysing"
        ? 2000
        : false;
    },
  });
  const transcribeMutation = useMutation({
    mutationFn: () => transcribeMeeting(meetingId ?? ""),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["meeting-detail", meetingId] });
    },
  });
  const analyzeMutation = useMutation({
    mutationFn: () => analyzeMeeting(meetingId ?? ""),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["meeting-detail", meetingId],
      });
      await queryClient.invalidateQueries({ queryKey: ["meetings"] });
      if (meetingId) {
        navigate(`/meetings/${meetingId}`);
      }
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ["meeting-detail", meetingId] });
    },
  });

  const meeting = meetingQuery.data?.meeting;
  const transcriptionMetadata = asRecord(meeting?.metadata.transcription);
  const elapsedSeconds =
    meeting?.processingStartedAt && meeting.status === "transcribing"
      ? Math.max(
          0,
          Math.round(
            (Date.now() - new Date(meeting.processingStartedAt).getTime()) / 1000,
          ),
        )
      : null;
  const wordCount = asNumber(transcriptionMetadata.wordCount);
  const processingTimeMs =
    asNumber(transcriptionMetadata.processingTimeMs) ??
    meeting?.processingTimeMs ??
    null;
  const transcribedMessage = meetingQuery.data
    ? [
        `Detected ${meetingQuery.data.speakers.length} speaker${meetingQuery.data.speakers.length === 1 ? "" : "s"} across ${meetingQuery.data.transcriptSegments.length} transcript segment${meetingQuery.data.transcriptSegments.length === 1 ? "" : "s"}.`,
        wordCount != null ? `${wordCount} words were persisted.` : null,
        processingTimeMs != null
          ? `Provider processing took ${Math.round(processingTimeMs / 1000)}s.`
          : null,
        "Gemini summary and action extraction will start automatically from this processing page.",
      ]
        .filter(Boolean)
        .join(" ")
    : "Speaker-labelled transcript segments are persisted. Gemini summary and action extraction will start automatically from this processing page.";
  const activeIndex = meeting ? statusOrder[meeting.status] : -1;
  const hasTranscript = (meetingQuery.data?.transcriptSegments.length ?? 0) > 0;
  const isAnalysisFailure =
    meeting?.status === "failed" &&
    meeting.errorCode != null &&
    analysisFailureCodes.has(meeting.errorCode) &&
    hasTranscript &&
    !meetingQuery.data?.summary;
  const canStartTranscription =
    meeting?.sourceType === "upload" &&
    (meeting.status === "created" || (meeting.status === "failed" && !hasTranscript));
  const canStartAnalysis =
    (meeting?.status === "transcribed" || isAnalysisFailure) &&
    hasTranscript &&
    !meetingQuery.data?.summary;
  const canAutoStartAnalysis = meeting?.status === "transcribed" && canStartAnalysis;

  useEffect(() => {
    if (!meetingId || !canStartTranscription || meeting?.status !== "created") {
      return;
    }

    if (autoStartedMeetingIds.has(meetingId)) {
      return;
    }

    autoStartedMeetingIds.add(meetingId);
    transcribeMutation.mutate();
  }, [canStartTranscription, meeting?.status, meetingId, transcribeMutation]);

  useEffect(() => {
    if (!meetingId || !canAutoStartAnalysis) {
      return;
    }

    if (autoStartedAnalysisIds.has(meetingId)) {
      return;
    }

    autoStartedAnalysisIds.add(meetingId);
    analyzeMutation.mutate();
  }, [analyzeMutation, canAutoStartAnalysis, meetingId]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Processing"
        title={meeting?.title ?? "Meeting processing"}
        description={
          meeting
            ? "This page reflects persisted meeting status. Deepgram transcription, Gemini analysis and search indexing run from the stored recording."
            : `Meeting ${meetingId ?? "record"} is waiting for repository lookup.`
        }
        actions={
          <div className="flex flex-wrap gap-3">
            {meeting ? <StatusBadge status={meeting.status} /> : null}
            {canStartTranscription ? (
              <button
                type="button"
                disabled={transcribeMutation.isPending}
                onClick={() => transcribeMutation.mutate()}
                className="inline-flex items-center gap-2 rounded-control bg-accent px-3 py-2 text-sm font-semibold text-accent-contrast transition duration-fast hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {meeting?.status === "failed" ? (
                  <RefreshCw size={17} aria-hidden="true" />
                ) : (
                  <Play size={17} aria-hidden="true" />
                )}
                {meeting?.status === "failed" ? "Retry transcription" : "Start now"}
              </button>
            ) : null}
            {isAnalysisFailure ? (
              <button
                type="button"
                disabled={analyzeMutation.isPending}
                onClick={() => analyzeMutation.mutate()}
                className="inline-flex items-center gap-2 rounded-control bg-accent px-3 py-2 text-sm font-semibold text-accent-contrast transition duration-fast hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={17} aria-hidden="true" />
                Retry analysis
              </button>
            ) : null}
            <Link to="/archive" className="sf-secondary-button px-3 py-2">
              <ArrowLeft size={17} aria-hidden="true" />
              Archive
            </Link>
          </div>
        }
      />

      {meetingQuery.isLoading ? <LoadingState label="Loading meeting status" /> : null}

      {transcribeMutation.isPending ? (
        <LoadingState label="Starting Deepgram transcription" />
      ) : null}

      {analyzeMutation.isPending ? (
        <LoadingState label="Running Gemini meeting analysis" />
      ) : null}

      {transcribeMutation.error instanceof Error ? (
        <ErrorState
          title="Transcription could not start"
          message={transcribeMutation.error.message}
          requestId={
            transcribeMutation.error instanceof ApiClientError
              ? transcribeMutation.error.requestId
              : null
          }
        />
      ) : null}

      {analyzeMutation.error instanceof Error ? (
        <ErrorState
          title="Analysis could not start"
          message={analyzeMutation.error.message}
          requestId={
            analyzeMutation.error instanceof ApiClientError
              ? analyzeMutation.error.requestId
              : null
          }
        />
      ) : null}

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
            message="The audio object has been verified. Deepgram transcription will start automatically once from this page, or you can start it manually."
          />
        ) : null}

        {meeting?.status === "transcribing" ? (
          <LoadingState
            label={`Deepgram is transcribing and diarising the uploaded recording${elapsedSeconds == null ? "" : ` (${formatDuration(elapsedSeconds)} elapsed)`}`}
          />
        ) : null}

        {meeting?.status === "transcribed" ? (
          <EmptyState
            icon={<CheckCircle2 size={20} aria-hidden="true" />}
            title="Transcript is ready"
            message={transcribedMessage}
            action={
              <div className="flex flex-wrap justify-center gap-3">
                {canStartAnalysis ? (
                  <button
                    type="button"
                    disabled={analyzeMutation.isPending}
                    onClick={() => analyzeMutation.mutate()}
                    className="inline-flex items-center gap-2 rounded-control bg-accent px-3 py-2 text-sm font-semibold text-accent-contrast transition duration-fast hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Play size={17} aria-hidden="true" />
                    Start analysis
                  </button>
                ) : null}
                <Link
                  to={`/meetings/${meeting.id}`}
                  className="inline-flex items-center gap-2 rounded-control border border-border bg-surface-raised px-3 py-2 text-sm font-semibold text-primary hover:border-accent/70"
                >
                  Open transcript
                </Link>
              </div>
            }
          />
        ) : null}

        {meeting?.status === "analysing" ? (
          <LoadingState label="Gemini is extracting the summary, topics and action items" />
        ) : null}

        {meeting?.status === "completed" ? (
          <EmptyState
            icon={<CheckCircle2 size={20} aria-hidden="true" />}
            title="Meeting analysis is complete"
            message="The transcript, summary, topics and action items are available on the meeting detail page."
            action={
              <Link
                to={`/meetings/${meeting.id}`}
                className="inline-flex items-center gap-2 rounded-control bg-accent px-3 py-2 text-sm font-semibold text-accent-contrast transition duration-fast hover:bg-accent/90"
              >
                Open meeting
              </Link>
            }
          />
        ) : null}

        {meeting?.status === "failed" ? (
          isAnalysisFailure ? (
            <div className="space-y-4">
              <ErrorState
                title="Analysis failed"
                message={
                  meeting.errorMessage ??
                  "Gemini analysis failed after transcription was saved."
                }
              />
              <div className="flex flex-wrap justify-center gap-3 rounded-card border border-border bg-surface p-4">
                <button
                  type="button"
                  disabled={analyzeMutation.isPending}
                  onClick={() => analyzeMutation.mutate()}
                  className="inline-flex items-center gap-2 rounded-control bg-accent px-3 py-2 text-sm font-semibold text-accent-contrast transition duration-fast hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw size={17} aria-hidden="true" />
                  Retry analysis
                </button>
                <Link
                  to={`/meetings/${meeting.id}`}
                  className="inline-flex items-center gap-2 rounded-control border border-border bg-surface-raised px-3 py-2 text-sm font-semibold text-primary hover:border-accent/70"
                >
                  Open meeting
                </Link>
              </div>
            </div>
          ) : (
            <ErrorState
              title={meeting.errorCode ?? "Meeting failed"}
              message={meeting.errorMessage ?? "The meeting failed during processing."}
            />
          )
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
