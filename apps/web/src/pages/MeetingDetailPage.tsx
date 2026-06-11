import { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CheckSquare,
  FileText,
  ListChecks,
  MessageSquareText,
  Save,
  UsersRound,
} from "lucide-react";
import type { ActionItem, MeetingDetail, MeetingSpeaker } from "@scribeflow/shared";
import { ActionItemRow } from "../components/ActionItemRow";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { SpeakerBadge } from "../components/SpeakerBadge";
import { StatusBadge } from "../components/StatusBadge";
import { TranscriptSegmentRow } from "../components/TranscriptSegmentRow";
import {
  getMeetingDetail,
  renameSpeaker,
  updateActionItemStatus,
} from "../lib/apiClient";
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

export function MeetingDetailPage() {
  const { meetingId } = useParams();
  const queryClient = useQueryClient();
  const meetingQuery = useQuery({
    queryKey: ["meeting-detail", meetingId],
    queryFn: () => getMeetingDetail(meetingId ?? ""),
    enabled: Boolean(meetingId),
  });

  const renameMutation = useMutation({
    mutationFn: renameSpeaker,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["meeting-detail", meetingId] });
    },
  });

  const actionMutation = useMutation({
    mutationFn: (item: ActionItem) =>
      updateActionItemStatus(item.id, {
        status: item.status === "completed" ? "open" : "completed",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["meeting-detail", meetingId] });
    },
  });

  const detail = meetingQuery.data;
  const meeting = detail?.meeting;
  const speakersById = new Map(
    detail?.speakers.map((speaker) => [speaker.id, speaker]),
  );
  const speakersByRawIndex = new Map(
    detail?.speakers.map((speaker) => [speaker.rawSpeakerIndex, speaker]),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Meeting"
        title={meeting?.title ?? "Meeting detail"}
        description={
          meeting
            ? "Persisted metadata and future AI outputs are shown from Supabase-backed API responses."
            : `Record ${meetingId ?? "unknown"} is being loaded from the API.`
        }
        actions={meeting ? <StatusBadge status={meeting.status} /> : null}
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

          <Tabs.Root defaultValue="overview" className="space-y-6">
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
                <div className="grid gap-4 lg:grid-cols-2">
                  {summarySections.map((section) => (
                    <SummarySection key={section} section={section} detail={detail} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<FileText size={20} aria-hidden="true" />}
                  title="Summary unavailable"
                  message="No AI-generated summary row exists yet. This will be created after the structured analysis phase succeeds."
                />
              )}

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
                detail.transcriptSegments.map((segment) => {
                  const speaker =
                    (segment.speakerId ? speakersById.get(segment.speakerId) : null) ??
                    (segment.rawSpeakerIndex != null
                      ? speakersByRawIndex.get(segment.rawSpeakerIndex)
                      : null);
                  return (
                    <TranscriptSegmentRow
                      key={segment.id}
                      segment={segment}
                      speakerName={speaker?.displayName ?? "Unknown speaker"}
                    />
                  );
                })
              ) : (
                <EmptyState
                  icon={<MessageSquareText size={20} aria-hidden="true" />}
                  title="Transcript unavailable"
                  message="No transcript segments are stored yet. Uploaded-audio transcription remains the next implementation phase."
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
                      onStatusChange={() => actionMutation.mutate(item)}
                    />
                  ))}
                </>
              ) : (
                <EmptyState
                  icon={<ListChecks size={20} aria-hidden="true" />}
                  title="No action items"
                  message="Action items will be extracted from transcript evidence after Gemini structured analysis is connected."
                />
              )}
            </Tabs.Content>

            <Tabs.Content value="analytics">
              <EmptyState
                icon={<UsersRound size={20} aria-hidden="true" />}
                title="No analytics yet"
                message={`Persisted speakers: ${detail.speakers.length}. Transcript chunks indexed for future RAG: ${detail.chunkCount}. Cross-meeting analytics remain a later phase.`}
              />
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
}: {
  section: (typeof summarySections)[number];
  detail: MeetingDetail;
}) {
  const summary = detail.summary;
  const values =
    section === "Attendees"
      ? summary?.attendees
      : section === "Key decisions"
        ? summary?.keyDecisions
        : section === "Discussion points"
          ? summary?.discussionPoints
          : section === "Open questions"
            ? summary?.openQuestions
            : section === "Next steps"
              ? summary?.nextSteps
              : null;
  const overview = section === "Executive overview" ? summary?.executiveOverview : null;

  return (
    <section className="rounded-card border border-border bg-surface p-5">
      <h2 className="text-base font-semibold text-primary">{section}</h2>
      {overview ? (
        <p className="mt-3 text-sm leading-6 text-muted">{overview}</p>
      ) : null}
      {values && values.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-muted">
          {values.map((value) => (
            <li key={value}>{value}</li>
          ))}
        </ul>
      ) : null}
      {!overview && (!values || values.length === 0) ? (
        <p className="mt-3 text-sm leading-6 text-muted">No content stored yet.</p>
      ) : null}
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

  return (
    <div className="rounded-card border border-border bg-background/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <SpeakerBadge name={`Speaker ${speaker.rawSpeakerIndex}`} />
        <span className="text-sm text-muted">
          {speaker.speakingPercentage.toFixed(1)}%
        </span>
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          className="sf-field"
          aria-label={`Display name for speaker ${speaker.rawSpeakerIndex}`}
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
