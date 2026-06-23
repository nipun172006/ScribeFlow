import { useCallback, useEffect, useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { useLocation, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  BarChart3,
  CheckSquare,
  Copy,
  Download,
  FileDown,
  FileText,
  Gauge,
  ListChecks,
  LocateFixed,
  MessageSquareText,
  Play,
  RefreshCw,
  Save,
  Search,
  Tags,
  UsersRound,
} from "lucide-react";
import type { ActionItem, MeetingDetail, MeetingSpeaker } from "@scribeflow/shared";
import { ActionItemRow } from "../components/ActionItemRow";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { SpeakerBadge } from "../components/SpeakerBadge";
import { StatusBadge } from "../components/StatusBadge";
import { TranscriptSegmentRow } from "../components/TranscriptSegmentRow";
import { useToastNotifier } from "../hooks/toastContext";
import {
  analyzeMeeting,
  ApiClientError,
  getMeetingDetail,
  renameSpeaker,
  updateActionItemStatus,
} from "../lib/apiClient";
import { copyToClipboard } from "../lib/clipboard";
import {
  downloadTextFile,
  formatMeetingMarkdown,
  formatTranscriptSrt,
  formatTranscriptTxt,
  formatTranscriptVtt,
  slugify,
  type TranscriptEntry,
} from "../lib/exporters";
import { formatBytes, formatDate, formatDuration } from "../lib/format";

const detailTabs = [
  { value: "overview", label: "Overview", icon: FileText },
  { value: "transcript", label: "Transcript", icon: MessageSquareText },
  { value: "actions", label: "Action Items", icon: CheckSquare },
  { value: "analytics", label: "Analytics", icon: BarChart3 },
];

const summarySections = [
  "Attendees",
  "Executive overview",
  "Key decisions",
  "Discussion points",
  "Open questions",
  "Next steps",
] as const;

const analysisFailureCodes = new Set([
  "GEMINI_AUTH_FAILED",
  "GEMINI_RATE_LIMITED",
  "GEMINI_REQUEST_TIMEOUT",
  "GEMINI_REQUEST_FAILED",
  "GEMINI_INVALID_RESPONSE",
  "MEETING_ANALYSIS_OUTPUT_INVALID",
  "ANALYSIS_PERSISTENCE_FAILED",
]);

export function MeetingDetailPage() {
  const { meetingId } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { notify } = useToastNotifier();
  const [transcriptQuery, setTranscriptQuery] = useState("");
  const [speakerFilter, setSpeakerFilter] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [highlightedSegmentId, setHighlightedSegmentId] = useState<string | null>(null);
  const [hasScrolledToUrlSegment, setHasScrolledToUrlSegment] = useState(false);
  const meetingQuery = useQuery({
    queryKey: ["meeting-detail", meetingId],
    queryFn: () => getMeetingDetail(meetingId ?? ""),
    enabled: Boolean(meetingId),
    staleTime: 60_000,
  });

  const renameMutation = useMutation({
    mutationFn: renameSpeaker,
    onSuccess: () => {
      notify("Speaker renamed", "success");
      void queryClient.invalidateQueries({ queryKey: ["meeting-detail", meetingId] });
    },
    onError: (error) => {
      notify(
        error instanceof Error ? error.message : "Could not rename speaker",
        "error",
      );
    },
  });

  const actionMutation = useMutation({
    mutationFn: ({
      item,
      status,
    }: {
      item: ActionItem;
      status: ActionItem["status"];
    }) =>
      updateActionItemStatus(item.id, {
        status,
      }),
    onSuccess: (_data, variables) => {
      notify(
        variables.status === "completed"
          ? "Action item completed"
          : "Action item reopened",
        "success",
      );
      void queryClient.invalidateQueries({ queryKey: ["meeting-detail", meetingId] });
    },
    onError: (error) => {
      notify(
        error instanceof Error ? error.message : "Could not update action item",
        "error",
      );
    },
  });

  const analysisMutation = useMutation({
    mutationFn: () => analyzeMeeting(meetingId ?? ""),
    onSuccess: () => {
      notify("Analysis complete", "success");
      void queryClient.invalidateQueries({ queryKey: ["meeting-detail", meetingId] });
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
    onError: (error) => {
      notify(error instanceof Error ? error.message : "Analysis failed", "error");
    },
  });

  const detail = meetingQuery.data;
  const meeting = detail?.meeting;
  const speakers = useMemo(() => detail?.speakers ?? [], [detail?.speakers]);
  const speakersById = useMemo(
    () => new Map(speakers.map((speaker) => [speaker.id, speaker])),
    [speakers],
  );
  const speakersByRawIndex = useMemo(
    () => new Map(speakers.map((speaker) => [speaker.rawSpeakerIndex, speaker])),
    [speakers],
  );
  const getSegmentSpeaker = useCallback(
    (segment: MeetingDetail["transcriptSegments"][number]) =>
      (segment.speakerId ? speakersById.get(segment.speakerId) : null) ??
      (segment.rawSpeakerIndex != null
        ? speakersByRawIndex.get(segment.rawSpeakerIndex)
        : null),
    [speakersById, speakersByRawIndex],
  );
  const filteredSegments = useMemo(() => {
    const normalizedQuery = transcriptQuery.trim().toLocaleLowerCase();

    return (detail?.transcriptSegments ?? []).filter((segment) => {
      const speaker = getSegmentSpeaker(segment);
      const matchesQuery =
        !normalizedQuery ||
        segment.text.toLocaleLowerCase().includes(normalizedQuery) ||
        speaker?.displayName.toLocaleLowerCase().includes(normalizedQuery);
      const matchesSpeaker =
        !speakerFilter ||
        segment.speakerId === speakerFilter ||
        (segment.rawSpeakerIndex != null &&
          String(segment.rawSpeakerIndex) === speakerFilter);

      return matchesQuery && matchesSpeaker;
    });
  }, [detail?.transcriptSegments, getSegmentSpeaker, speakerFilter, transcriptQuery]);
  const speakerAnalytics = useMemo(
    () =>
      (detail?.speakers ?? []).map((speaker) => ({
        name: speaker.displayName,
        seconds: speaker.totalSpeakingSeconds,
        percentage: speaker.speakingPercentage,
      })),
    [detail?.speakers],
  );
  const totalDetectedSpeakingSeconds = speakerAnalytics.reduce(
    (sum, speaker) => sum + speaker.seconds,
    0,
  );
  const dominantSpeaker = speakerAnalytics.reduce<
    (typeof speakerAnalytics)[number] | null
  >(
    (current, speaker) =>
      !current || speaker.percentage > current.percentage ? speaker : current,
    null,
  );
  const canRenderResponsiveChart =
    typeof window !== "undefined" && "ResizeObserver" in window;
  const topics = useMemo(() => {
    const persistedTopics = detail?.topics.map((topic) => topic.displayLabel) ?? [];
    return persistedTopics.length > 0
      ? persistedTopics
      : (detail?.summary?.topics ?? []);
  }, [detail?.summary?.topics, detail?.topics]);
  const isAnalysisFailure =
    meeting?.status === "failed" &&
    meeting.errorCode != null &&
    analysisFailureCodes.has(meeting.errorCode) &&
    (detail?.transcriptSegments.length ?? 0) > 0 &&
    !detail?.summary;
  const canRunAnalysis =
    (meeting?.status === "transcribed" || isAnalysisFailure) &&
    (detail?.transcriptSegments.length ?? 0) > 0 &&
    !detail?.summary;
  const handleEvidenceJump = useCallback((segmentId: string) => {
    setTranscriptQuery("");
    setSpeakerFilter("");
    setActiveTab("transcript");
    setHighlightedSegmentId(segmentId);

    window.setTimeout(() => {
      document
        .querySelector(`[data-transcript-segment-id="${segmentId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);

    window.setTimeout(() => {
      setHighlightedSegmentId((current) => (current === segmentId ? null : current));
    }, 4500);
  }, []);

  const transcriptionConfidence = useMemo(() => {
    const meta = meeting?.metadata as Record<string, unknown> | undefined;
    const transcription =
      meta && typeof meta.transcription === "object" && meta.transcription !== null
        ? (meta.transcription as Record<string, unknown>)
        : null;
    const value = transcription?.confidence;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }, [meeting?.metadata]);

  const handleCopySummary = useCallback(async () => {
    if (!detail) {
      return;
    }
    const copied = await copyToClipboard(formatMeetingMarkdown(detail));
    notify(
      copied ? "Summary copied to clipboard" : "Could not copy summary",
      copied ? "success" : "error",
    );
  }, [detail, notify]);

  const handleExportMarkdown = useCallback(() => {
    if (!detail || !meeting) {
      return;
    }
    downloadTextFile(
      `${slugify(meeting.title)}.md`,
      formatMeetingMarkdown(detail),
      "text/markdown;charset=utf-8",
    );
    notify("Markdown exported", "success");
  }, [detail, meeting, notify]);

  const handleDownloadTranscript = useCallback(
    (format: "txt" | "srt" | "vtt") => {
      if (!detail || !meeting) {
        return;
      }
      const entries: TranscriptEntry[] = detail.transcriptSegments.map((segment) => ({
        speaker: getSegmentSpeaker(segment)?.displayName ?? "Unknown speaker",
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text,
      }));
      const base = slugify(meeting.title);
      if (format === "txt") {
        downloadTextFile(`${base}.txt`, formatTranscriptTxt(entries));
      } else if (format === "srt") {
        downloadTextFile(
          `${base}.srt`,
          formatTranscriptSrt(entries),
          "application/x-subrip",
        );
      } else {
        downloadTextFile(`${base}.vtt`, formatTranscriptVtt(entries), "text/vtt");
      }
      notify(`Transcript downloaded (.${format})`, "success");
    },
    [detail, meeting, getSegmentSpeaker, notify],
  );

  useEffect(() => {
    if (!detail || hasScrolledToUrlSegment) return;

    const searchParams = new URLSearchParams(location.search);
    const segmentIdFromUrl = searchParams.get("segmentId");

    if (segmentIdFromUrl) {
      handleEvidenceJump(segmentIdFromUrl);
    }

    setHasScrolledToUrlSegment(true);
  }, [detail, hasScrolledToUrlSegment, handleEvidenceJump, location.search]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Meeting"
        title={meeting?.title ?? "Meeting detail"}
        description={
          meeting
            ? "Persisted metadata, transcript, summary, actions and analytics are shown from Supabase-backed API responses."
            : `Record ${meetingId ?? "unknown"} is being loaded from the API.`
        }
        actions={
          meeting ? (
            <div className="flex flex-wrap items-center gap-2">
              {detail?.summary ? (
                <>
                  <button
                    type="button"
                    onClick={handleCopySummary}
                    className="sf-secondary-button px-3 py-2"
                  >
                    <Copy size={16} aria-hidden="true" />
                    Copy summary
                  </button>
                  <button
                    type="button"
                    onClick={handleExportMarkdown}
                    className="sf-secondary-button px-3 py-2"
                  >
                    <FileDown size={16} aria-hidden="true" />
                    Export Markdown
                  </button>
                </>
              ) : null}
              <StatusBadge status={meeting.status} />
            </div>
          ) : null
        }
      />

      {meetingQuery.isLoading ? <LoadingState label="Loading meeting detail" /> : null}

      {meetingQuery.error instanceof Error ? (
        <ErrorState
          title="Meeting detail is unavailable"
          message={meetingQuery.error.message}
        />
      ) : null}

      {meeting ? (
        <>
          <section className="grid gap-4 rounded-card border border-border bg-surface p-5 sm:grid-cols-2 xl:grid-cols-4">
            <MetadataCell label="Recorded" value={formatDate(meeting.recordedAt)} />
            <MetadataCell
              label="Duration"
              value={
                meeting.durationSeconds == null
                  ? "Not available"
                  : formatDuration(meeting.durationSeconds)
              }
            />
            <MetadataCell label="Language" value={meeting.language ?? "Not set"} />
            <MetadataCell label="Source" value={meeting.sourceType} />
            <MetadataCell
              label="File"
              value={meeting.originalFileName ?? "No recording file"}
            />
            <MetadataCell
              label="Size"
              value={formatBytes(
                meeting.fileSizeBytes ?? meeting.expectedFileSizeBytes,
              )}
            />
            <MetadataCell
              label="Known participants"
              value={
                meeting.knownParticipants.length > 0
                  ? meeting.knownParticipants.join(", ")
                  : "None provided"
              }
            />
            <MetadataCell
              label="Technical terms"
              value={
                meeting.technicalTerms.length > 0
                  ? meeting.technicalTerms.join(", ")
                  : "None provided"
              }
            />
          </section>

          <Tabs.Root
            value={activeTab}
            onValueChange={setActiveTab}
            className="space-y-6"
          >
            <Tabs.List
              className="flex flex-wrap gap-2 rounded-card border border-border bg-surface p-1"
              aria-label="Meeting detail sections"
            >
              {detailTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <Tabs.Trigger
                    key={tab.value}
                    value={tab.value}
                    className="inline-flex items-center gap-2 rounded-control px-3 py-2 text-sm font-medium text-muted transition duration-fast data-[state=active]:bg-surface-raised data-[state=active]:text-primary"
                  >
                    <Icon size={16} aria-hidden="true" />
                    {tab.label}
                  </Tabs.Trigger>
                );
              })}
            </Tabs.List>

            <Tabs.Content value="overview" className="space-y-4">
              {detail.summary ? (
                <>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {summarySections.map((section) => (
                      <SummarySection
                        key={section}
                        section={section}
                        detail={detail}
                        onEvidenceClick={handleEvidenceJump}
                      />
                    ))}
                  </div>
                  <TopicSection topics={topics} />
                </>
              ) : isAnalysisFailure ? (
                <section className="rounded-card border border-error/35 bg-error/10 p-5 shadow-soft">
                  <div className="flex gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-error/30 bg-error/10 text-error">
                      <AlertTriangle size={18} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-semibold text-primary">
                        Analysis failed
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-muted">
                        {meeting.errorMessage ??
                          "Gemini analysis failed after the transcript was saved."}
                      </p>
                      {meeting.errorCode ? (
                        <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-error/85">
                          {meeting.errorCode}
                        </p>
                      ) : null}
                      <p className="mt-3 text-sm leading-6 text-muted">
                        The transcript remains available. Retry analysis when Gemini is
                        reachable, or use the transcript directly for review.
                      </p>
                      <button
                        type="button"
                        disabled={analysisMutation.isPending}
                        onClick={() => analysisMutation.mutate()}
                        className="mt-4 inline-flex items-center gap-2 rounded-control bg-accent px-3 py-2 text-sm font-semibold text-accent-contrast transition duration-fast hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <RefreshCw size={17} aria-hidden="true" />
                        {analysisMutation.isPending
                          ? "Retrying analysis"
                          : "Retry analysis"}
                      </button>
                    </div>
                  </div>
                </section>
              ) : (
                <EmptyState
                  icon={<FileText size={20} aria-hidden="true" />}
                  title="Analysis has not been generated yet"
                  message={
                    canRunAnalysis
                      ? "A speaker-labelled transcript exists. You can run Gemini structured analysis now to persist the summary, topics and action items."
                      : "Gemini analysis runs after uploaded-audio transcription creates persisted transcript segments."
                  }
                  action={
                    canRunAnalysis ? (
                      <button
                        type="button"
                        disabled={analysisMutation.isPending}
                        onClick={() => analysisMutation.mutate()}
                        className="inline-flex items-center gap-2 rounded-control bg-accent px-3 py-2 text-sm font-semibold text-accent-contrast transition duration-fast hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Play size={17} aria-hidden="true" />
                        {analysisMutation.isPending
                          ? "Running analysis"
                          : "Run analysis"}
                      </button>
                    ) : null
                  }
                />
              )}

              {analysisMutation.error instanceof Error ? (
                <ErrorState
                  title="Analysis was not generated"
                  message={analysisMutation.error.message}
                  requestId={
                    analysisMutation.error instanceof ApiClientError
                      ? analysisMutation.error.requestId
                      : null
                  }
                />
              ) : null}

              {meeting.status === "analysing" ? (
                <LoadingState label="Gemini analysis is running" />
              ) : null}

              {detail.speakers.length > 0 ? (
                <section className="space-y-3 rounded-card border border-border bg-surface p-5">
                  <h2 className="text-base font-semibold text-primary">Speakers</h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    {detail.speakers.map((speaker) => (
                      <SpeakerRenameRow
                        key={speaker.id}
                        speaker={speaker}
                        isSaving={renameMutation.isPending}
                        onSave={(displayName) =>
                          renameMutation.mutate({
                            meetingId: meeting.id,
                            speakerId: speaker.id,
                            displayName,
                          })
                        }
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </Tabs.Content>

            <Tabs.Content value="transcript" className="space-y-3">
              {detail.transcriptSegments.length > 0 ? (
                <>
                  <section className="grid gap-3 rounded-card border border-border bg-surface p-4 md:grid-cols-[1fr_14rem]">
                    <label className="block">
                      <span className="sf-label flex items-center gap-2">
                        <Search size={16} aria-hidden="true" />
                        Search transcript
                      </span>
                      <input
                        className="sf-field mt-2"
                        value={transcriptQuery}
                        onChange={(event) => setTranscriptQuery(event.target.value)}
                        placeholder="Search spoken content or speaker names"
                      />
                    </label>
                    <label className="block">
                      <span className="sf-label">Speaker</span>
                      <select
                        className="sf-field mt-2"
                        value={speakerFilter}
                        onChange={(event) => setSpeakerFilter(event.target.value)}
                      >
                        <option value="">All speakers</option>
                        {detail.speakers.map((speaker) => (
                          <option key={speaker.id} value={speaker.id}>
                            {speaker.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                  </section>

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface px-4 py-3">
                    <span className="text-sm text-muted">
                      {detail.transcriptSegments.length} segment
                      {detail.transcriptSegments.length === 1 ? "" : "s"} ·{" "}
                      {detail.speakers.length} speaker
                      {detail.speakers.length === 1 ? "" : "s"}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                        <Download size={14} aria-hidden="true" /> Download
                      </span>
                      {(["txt", "srt", "vtt"] as const).map((fmt) => (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() => handleDownloadTranscript(fmt)}
                          className="rounded-control border border-border bg-surface-raised px-2.5 py-1.5 text-xs font-semibold text-primary transition duration-fast hover:border-accent/70"
                        >
                          {fmt.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredSegments.length > 0 ? (
                    filteredSegments.map((segment) => {
                      const speaker = getSegmentSpeaker(segment);
                      return (
                        <TranscriptSegmentRow
                          key={segment.id}
                          segment={segment}
                          speakerName={speaker?.displayName ?? "Unknown speaker"}
                          highlighted={highlightedSegmentId === segment.id}
                        />
                      );
                    })
                  ) : (
                    <EmptyState
                      icon={<MessageSquareText size={20} aria-hidden="true" />}
                      title="No matching transcript segments"
                      message="Clear the search query or speaker filter to return to the full persisted transcript."
                    />
                  )}
                </>
              ) : (
                <EmptyState
                  icon={<MessageSquareText size={20} aria-hidden="true" />}
                  title="Transcript unavailable"
                  message="No transcript segments are stored yet. Use the processing page to run uploaded-audio transcription after the recording is uploaded."
                />
              )}
            </Tabs.Content>

            <Tabs.Content value="actions" className="space-y-3">
              {detail.actionItems.length > 0 ? (
                <>
                  {actionMutation.error instanceof Error ? (
                    <ErrorState
                      title="Action item was not updated"
                      message={actionMutation.error.message}
                    />
                  ) : null}
                  {detail.actionItems.map((item) => (
                    <ActionItemRow
                      key={item.id}
                      item={item}
                      disabled={actionMutation.isPending}
                      onStatusChange={(status) =>
                        actionMutation.mutate({ item, status })
                      }
                      onEvidenceClick={handleEvidenceJump}
                    />
                  ))}
                </>
              ) : (
                <EmptyState
                  icon={<ListChecks size={20} aria-hidden="true" />}
                  title="No action items"
                  message="Action items will appear here after Gemini structured analysis has persisted real transcript-backed tasks."
                />
              )}
            </Tabs.Content>

            <Tabs.Content value="analytics">
              {speakerAnalytics.length > 0 ? (
                <section className="space-y-5 rounded-card border border-border bg-surface p-5">
                  <div>
                    <h2 className="text-base font-semibold text-primary">
                      Speaking-time distribution
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-muted">
                      Calculated deterministically from persisted Deepgram word
                      timestamps. Cross-meeting trends are available on the Analytics
                      page.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <MetricCard
                      label="Speaker count"
                      value={String(detail.speakers.length)}
                      detail={
                        detail.speakers.length < 3
                          ? "Fewer than 3 speakers separated"
                          : "Persisted diarised speaker records"
                      }
                      icon={<UsersRound size={18} aria-hidden="true" />}
                    />
                    <MetricCard
                      label="Detected spoken time"
                      value={`${totalDetectedSpeakingSeconds.toFixed(1)} seconds`}
                      detail="Sum of speaker word durations"
                      icon={<BarChart3 size={18} aria-hidden="true" />}
                    />
                    <MetricCard
                      label="Dominant speaker"
                      value={dominantSpeaker?.name ?? "-"}
                      detail={
                        dominantSpeaker
                          ? `${dominantSpeaker.percentage.toFixed(1)}% of detected speech`
                          : "No speaker timing stored"
                      }
                      icon={<UsersRound size={18} aria-hidden="true" />}
                    />
                    {transcriptionConfidence != null ? (
                      <MetricCard
                        label="Transcript confidence"
                        value={`${Math.round(transcriptionConfidence * 100)}%`}
                        detail="Avg word confidence (WER proxy)"
                        icon={<Gauge size={18} aria-hidden="true" />}
                      />
                    ) : null}
                  </div>
                  {canRenderResponsiveChart ? (
                    <div
                      className="h-72 w-full"
                      role="img"
                      aria-label="Bar chart of speaking time per speaker in seconds"
                    >
                      <ResponsiveContainer minWidth={320} minHeight={240}>
                        <BarChart data={speakerAnalytics}>
                          <XAxis
                            dataKey="name"
                            tick={{ fill: "currentColor", fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fill: "currentColor", fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                            width={48}
                          />
                          <Tooltip
                            cursor={{ fill: "rgba(255,255,255,0.04)" }}
                            contentStyle={{
                              background: "#111827",
                              border: "1px solid rgba(255,255,255,0.14)",
                              borderRadius: 8,
                              color: "#f9fafb",
                            }}
                          />
                          <Bar dataKey="seconds" fill="#67e8f9" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="space-y-3" aria-label="Speaking-time chart">
                      {speakerAnalytics.map((speaker) => (
                        <div key={speaker.name}>
                          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                            <span className="font-medium text-primary">
                              {speaker.name}
                            </span>
                            <span className="text-muted">
                              {speaker.percentage.toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-background">
                            <div
                              className="h-2 rounded-full bg-accent"
                              style={{
                                width: `${Math.min(
                                  Math.max(speaker.percentage, 0),
                                  100,
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-muted">
                        <tr>
                          <th className="py-2 font-medium">Speaker</th>
                          <th className="py-2 font-medium">Speaking time</th>
                          <th className="py-2 font-medium">Share</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {detail.speakers.map((speaker) => (
                          <tr key={speaker.id}>
                            <td className="py-3 text-primary">{speaker.displayName}</td>
                            <td className="py-3 text-muted">
                              {formatDuration(speaker.totalSpeakingSeconds)}
                            </td>
                            <td className="py-3 text-muted">
                              {speaker.speakingPercentage.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : (
                <EmptyState
                  icon={<UsersRound size={20} aria-hidden="true" />}
                  title="No speaker analytics yet"
                  message={`Persisted speakers: ${detail.speakers.length}. Transcript chunks indexed for semantic search: ${detail.chunkCount}. Run uploaded-audio transcription to populate speaker timing.`}
                />
              )}
            </Tabs.Content>
          </Tabs.Root>
        </>
      ) : null}
    </div>
  );
}

function MetadataCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 break-words font-medium text-primary">{value}</p>
    </div>
  );
}

function SummarySection({
  section,
  detail,
  onEvidenceClick,
}: {
  section: (typeof summarySections)[number];
  detail: MeetingDetail;
  onEvidenceClick?: (segmentId: string) => void;
}) {
  const summary = detail.summary;
  const analysis = detail.analysis;
  const values =
    section === "Attendees"
      ? summary?.attendees
      : section === "Key decisions"
        ? (analysis?.keyDecisions ?? summary?.keyDecisions)
        : section === "Discussion points"
          ? (analysis?.discussionPoints ?? summary?.discussionPoints)
          : section === "Open questions"
            ? (analysis?.openQuestions ?? summary?.openQuestions)
            : section === "Next steps"
              ? (analysis?.nextSteps ?? summary?.nextSteps)
              : null;
  const overview = section === "Executive overview" ? summary?.executiveOverview : null;

  return (
    <section className="rounded-card border border-border bg-surface p-5">
      <h2 className="text-base font-semibold text-primary">{section}</h2>
      {overview ? (
        <p className="mt-3 text-sm leading-6 text-muted">{overview}</p>
      ) : null}
      {values && values.length > 0 ? (
        <ul className="mt-3 space-y-3 text-sm leading-6 text-muted">
          {values.map((value, idx) => {
            const isObject =
              typeof value === "object" && value !== null && "text" in value;
            const text = isObject ? (value as { text: string }).text : String(value);
            const evidenceSegmentIds = isObject
              ? (value as { evidenceSegmentIds?: string[] }).evidenceSegmentIds
              : [];
            const primaryEvidenceSegmentId = evidenceSegmentIds?.[0] ?? null;

            return (
              <li key={idx} className="flex items-start justify-between gap-3 group">
                <span className="flex-1">{text}</span>
                {primaryEvidenceSegmentId && onEvidenceClick && (
                  <button
                    type="button"
                    onClick={() => onEvidenceClick(primaryEvidenceSegmentId)}
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-control border border-white/10 bg-white/[0.055] text-primary transition opacity-0 group-hover:opacity-100 focus:opacity-100 hover:border-accent/70"
                    aria-label={`Jump to evidence for ${text}`}
                  >
                    <LocateFixed size={12} aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {!overview && (!values || values.length === 0) ? (
        <p className="mt-3 text-sm leading-6 text-muted">No content stored yet.</p>
      ) : null}
    </section>
  );
}

function TopicSection({ topics }: { topics: string[] }) {
  return (
    <section className="rounded-card border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <Tags size={17} aria-hidden="true" className="text-accent" />
        <h2 className="text-base font-semibold text-primary">Topics</h2>
      </div>
      {topics.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {topics.map((topic) => (
            <span
              key={topic}
              className="rounded-control border border-border bg-surface-raised px-2.5 py-1 text-xs font-medium text-primary"
            >
              {topic}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-muted">No topics stored yet.</p>
      )}
    </section>
  );
}

function SpeakerRenameRow({
  speaker,
  isSaving,
  onSave,
}: {
  speaker: MeetingSpeaker;
  isSaving: boolean;
  onSave: (displayName: string) => void;
}) {
  const [displayName, setDisplayName] = useState(speaker.displayName);

  useEffect(() => {
    setDisplayName(speaker.displayName);
  }, [speaker.displayName]);

  return (
    <div className="rounded-card border border-border bg-background/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <SpeakerBadge name={speaker.displayName} />
        <span className="text-sm text-muted">
          {speaker.speakingPercentage.toFixed(1)}%
        </span>
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          className="sf-field"
          aria-label={`Display name for ${speaker.displayName}`}
        />
        <button
          type="button"
          disabled={isSaving || !displayName.trim()}
          onClick={() => onSave(displayName.trim())}
          className="inline-flex items-center gap-2 rounded-control border border-border px-3 py-2 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={16} aria-hidden="true" />
          Save
        </button>
      </div>
    </div>
  );
}
