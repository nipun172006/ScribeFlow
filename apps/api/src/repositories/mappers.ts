import {
  actionItemStatusSchema,
  meetingSourceTypeSchema,
  meetingStatusSchema,
  type ActionItem,
  type Meeting,
  type MeetingDetail,
  type MeetingSpeaker,
  type MeetingSummary,
  type MeetingTopic,
  type TranscriptSegment,
  type TranscriptWord,
} from "@scribeflow/shared";
import type { Database, Json } from "../types/database.types.js";

type MeetingRow = Database["public"]["Tables"]["meetings"]["Row"];
type SpeakerRow = Database["public"]["Tables"]["meeting_speakers"]["Row"];
type SegmentRow = Database["public"]["Tables"]["transcript_segments"]["Row"];
type SummaryRow = Database["public"]["Tables"]["meeting_summaries"]["Row"];
type ActionItemRow = Database["public"]["Tables"]["action_items"]["Row"];
type TopicRow = Database["public"]["Tables"]["meeting_topics"]["Row"];

const asRecord = (value: Json): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asStringArray = (value: Json): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }

          if (item && typeof item === "object" && !Array.isArray(item)) {
            const record = item as Record<string, unknown>;
            return typeof record.text === "string" ? record.text : null;
          }

          return null;
        })
        .filter((item): item is string => typeof item === "string")
    : [];

const mapNullableDate = (value: string | null) =>
  value ? new Date(value).toISOString() : null;

const mapRequiredDate = (value: string) => new Date(value).toISOString();

const asTranscriptWords = (value: Json): TranscriptWord[] =>
  Array.isArray(value)
    ? value.filter((item): item is TranscriptWord => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return false;
        }

        const word = item as Record<string, unknown>;
        return (
          typeof word.text === "string" &&
          typeof word.startMs === "number" &&
          typeof word.endMs === "number" &&
          (typeof word.confidence === "number" || word.confidence === null)
        );
      })
    : [];

export function mapMeeting(row: MeetingRow): Meeting {
  return {
    id: row.id,
    title: row.title,
    sourceType: meetingSourceTypeSchema.parse(row.source_type),
    status: meetingStatusSchema.parse(row.status),
    originalFileName: row.original_file_name,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    expectedFileSizeBytes: row.expected_file_size_bytes,
    fileSizeBytes: row.file_size_bytes,
    durationSeconds: row.duration_seconds,
    language: row.language,
    recordedAt: mapNullableDate(row.recorded_at),
    processingStartedAt: mapNullableDate(row.processing_started_at),
    uploadCompletedAt: mapNullableDate(row.upload_completed_at),
    createdAt: mapRequiredDate(row.created_at),
    updatedAt: mapRequiredDate(row.updated_at),
    completedAt: mapNullableDate(row.completed_at),
    processingTimeMs: row.processing_time_ms,
    knownParticipants: row.known_participants,
    technicalTerms: row.technical_terms,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    metadata: asRecord(row.metadata),
  };
}

export function mapMeetingSpeaker(row: SpeakerRow): MeetingSpeaker {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    rawSpeakerIndex: row.raw_speaker_index,
    displayName: row.display_name,
    totalSpeakingSeconds: row.total_speaking_seconds,
    speakingPercentage: row.speaking_percentage,
    createdAt: mapRequiredDate(row.created_at),
    updatedAt: mapRequiredDate(row.updated_at),
  };
}

export function mapTranscriptSegment(row: SegmentRow): TranscriptSegment {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    speakerId: row.speaker_id,
    rawSpeakerIndex: row.raw_speaker_index,
    segmentIndex: row.segment_index,
    startMs: row.start_ms,
    endMs: row.end_ms,
    text: row.text,
    confidence: row.confidence,
    words: asTranscriptWords(row.words),
  };
}

export function mapMeetingSummary(row: SummaryRow): MeetingSummary {
  return {
    attendees: asStringArray(row.attendees),
    executiveOverview: row.executive_overview,
    keyDecisions: asStringArray(row.key_decisions),
    discussionPoints: asStringArray(row.discussion_points),
    openQuestions: asStringArray(row.open_questions),
    nextSteps: asStringArray(row.next_steps),
    topics: [],
  };
}

export function mapActionItem(row: ActionItemRow): ActionItem {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    task: row.task,
    ownerName: row.owner_name,
    ownerSpeakerId: row.owner_speaker_id,
    deadline: mapNullableDate(row.deadline),
    deadlineText: row.deadline_text,
    status: actionItemStatusSchema.parse(row.status),
    confidence: row.confidence,
    sourceSegmentId: row.source_segment_id,
    sourceStartMs: row.source_start_ms,
    sourceEndMs: row.source_end_ms,
    evidenceText: row.evidence_text,
    evidenceSegmentIds: row.evidence_segment_ids,
    completedAt: mapNullableDate(row.completed_at),
    createdAt: mapRequiredDate(row.created_at),
    updatedAt: mapRequiredDate(row.updated_at),
  };
}

export function mapMeetingTopic(row: TopicRow): MeetingTopic {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    normalizedLabel: row.normalized_label,
    displayLabel: row.display_label,
    confidence: row.confidence,
    mentionCount: row.mention_count,
    createdAt: mapRequiredDate(row.created_at),
    updatedAt: mapRequiredDate(row.updated_at),
  };
}

export function mapMeetingDetail(input: {
  meeting: MeetingRow;
  speakers: SpeakerRow[];
  transcriptSegments: SegmentRow[];
  summary: SummaryRow | null;
  actionItems: ActionItemRow[];
  topics: TopicRow[];
  chunkCount: number;
}): MeetingDetail {
  return {
    meeting: mapMeeting(input.meeting),
    speakers: input.speakers.map(mapMeetingSpeaker),
    transcriptSegments: input.transcriptSegments.map(mapTranscriptSegment),
    summary: input.summary ? mapMeetingSummary(input.summary) : null,
    actionItems: input.actionItems.map(mapActionItem),
    topics: input.topics.map(mapMeetingTopic),
    chunkCount: input.chunkCount,
  };
}
