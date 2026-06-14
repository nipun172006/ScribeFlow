import type {
  ActionItem,
  AnalyzeMeetingResponse,
  Meeting,
  MeetingAnalytics,
  MeetingDetail,
  MeetingListQuery,
  MeetingSpeaker,
  PaginatedMeetingList,
  StructuredMeetingAnalysis,
  TranscribeMeetingResponse,
} from "@scribeflow/shared";
import { ApiError } from "../errors/apiError.js";
import type { MeetingRepository } from "../services/interfaces.js";
import type { ScribeFlowSupabaseClient } from "../config/supabaseClient.js";
import type { Database, Json } from "../types/database.types.js";
import {
  mapActionItem,
  mapMeeting,
  mapMeetingDetail,
  mapMeetingSpeaker,
  mapMeetingSummary,
  mapMeetingTopic,
} from "./mappers.js";
import { buildTranscribeMeetingResponse } from "../services/transcriptionResponse.js";

type MeetingInsert = Database["public"]["Tables"]["meetings"]["Insert"];
type MeetingRow = Database["public"]["Tables"]["meetings"]["Row"];
type SummaryRow = Database["public"]["Tables"]["meeting_summaries"]["Row"];
type ActionItemRow = Database["public"]["Tables"]["action_items"]["Row"];
type TopicRow = Database["public"]["Tables"]["meeting_topics"]["Row"];

const meetingSortColumns: Record<MeetingListQuery["sort"], string> = {
  createdAt: "created_at",
  recordedAt: "recorded_at",
  title: "title",
};

const isMissingRowError = (error: { code?: string } | null) =>
  error?.code === "PGRST116";

const asUnknownRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asStringArray = (value: Json): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const asEvidenceItems = (value: Json): StructuredMeetingAnalysis["keyDecisions"] =>
  Array.isArray(value)
    ? value
        .map((item) => {
          if (typeof item === "string" && item.trim()) {
            return {
              text: item,
              evidenceSegmentIds: [],
            };
          }

          if (!item || typeof item !== "object" || Array.isArray(item)) {
            return null;
          }

          const record = item as Record<string, unknown>;
          const text = typeof record.text === "string" ? record.text.trim() : "";
          const evidenceSegmentIds = Array.isArray(record.evidenceSegmentIds)
            ? record.evidenceSegmentIds.filter(
                (segmentId): segmentId is string => typeof segmentId === "string",
              )
            : [];

          return text ? { text, evidenceSegmentIds } : null;
        })
        .filter(
          (item): item is StructuredMeetingAnalysis["keyDecisions"][number] =>
            item !== null,
        )
    : [];

const getAnalysisMetadata = (meeting: Meeting) => {
  const metadata = asUnknownRecord(meeting.metadata);
  return asUnknownRecord(metadata.analysis);
};

const getStringMetadata = (
  metadata: Record<string, unknown>,
  key: string,
): string | null => {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : null;
};

const getNumberMetadata = (
  metadata: Record<string, unknown>,
  key: string,
): number | null => {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

function buildAnalysisFromRows(input: {
  summary: SummaryRow;
  actionItems: ActionItemRow[];
  topics: TopicRow[];
}): StructuredMeetingAnalysis {
  return {
    attendees: asStringArray(input.summary.attendees),
    executiveOverview: input.summary.executive_overview,
    keyDecisions: asEvidenceItems(input.summary.key_decisions),
    discussionPoints: asEvidenceItems(input.summary.discussion_points),
    openQuestions: asEvidenceItems(input.summary.open_questions),
    nextSteps: asEvidenceItems(input.summary.next_steps),
    topics: input.topics.map((topic) => topic.display_label),
    actionItems: input.actionItems.map((item) => ({
      task: item.task,
      ownerName: item.owner_name,
      deadlineText: item.deadline_text,
      confidence: item.confidence ?? 0,
      evidenceSegmentIds:
        item.evidence_segment_ids.length > 0
          ? item.evidence_segment_ids
          : item.source_segment_id
            ? [item.source_segment_id]
            : [],
    })),
  };
}

function buildAnalyzeMeetingResponse(input: {
  meeting: MeetingRow;
  summary: SummaryRow;
  actionItems: ActionItemRow[];
  topics: TopicRow[];
  alreadyAnalysed: boolean;
}): AnalyzeMeetingResponse {
  const meeting = mapMeeting(input.meeting);
  const metadata = getAnalysisMetadata(meeting);

  return {
    meeting,
    summary: mapMeetingSummary(input.summary),
    topics: input.topics.map(mapMeetingTopic),
    actionItems: input.actionItems.map(mapActionItem),
    analysis: buildAnalysisFromRows({
      summary: input.summary,
      actionItems: input.actionItems,
      topics: input.topics,
    }),
    provider: "gemini",
    modelName:
      getStringMetadata(metadata, "model") ??
      input.summary.model_name ??
      "gemini-unknown",
    responseId: getStringMetadata(metadata, "responseId"),
    processingTimeMs: getNumberMetadata(metadata, "processingTimeMs"),
    alreadyAnalysed: input.alreadyAnalysed,
  };
}

export class SupabaseMeetingRepository implements MeetingRepository {
  constructor(private readonly client: ScribeFlowSupabaseClient) {}

  async createUploadMeeting(
    input: Parameters<MeetingRepository["createUploadMeeting"]>[0],
  ): Promise<Meeting> {
    const insert: MeetingInsert = {
      id: input.id,
      title: input.title,
      source_type: "upload",
      status: "uploading",
      original_file_name: input.fileName,
      storage_bucket: input.storageBucket,
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      expected_file_size_bytes: input.fileSizeBytes,
      recorded_at: input.recordedAt ?? null,
      language: input.language ?? null,
      known_participants: input.knownParticipants,
      technical_terms: input.technicalTerms,
      metadata: {},
    };

    const { data, error } = await this.client
      .from("meetings")
      .insert(insert)
      .select("*")
      .single();

    if (error || !data) {
      throw ApiError.databaseOperationFailed("Could not create the upload meeting.");
    }

    return mapMeeting(data);
  }

  async createLiveMeeting(
    input: Parameters<MeetingRepository["createLiveMeeting"]>[0],
  ): Promise<Meeting> {
    const insert: MeetingInsert = {
      title: input.title,
      source_type: "live",
      status: "created",
      recorded_at: input.recordedAt ?? null,
      language: input.language ?? null,
      known_participants: input.knownParticipants,
      technical_terms: input.technicalTerms,
      metadata: {},
    };

    const { data, error } = await this.client
      .from("meetings")
      .insert(insert)
      .select("*")
      .single();

    if (error || !data) {
      throw ApiError.databaseOperationFailed("Could not create the live meeting.");
    }

    return mapMeeting(data);
  }

  async markUploadCompleted(input: {
    meetingId: string;
    fileSizeBytes: number;
    mimeType: string | null;
  }): Promise<Meeting> {
    const { data, error } = await this.client
      .from("meetings")
      .update({
        status: "created",
        file_size_bytes: input.fileSizeBytes,
        mime_type: input.mimeType,
        upload_completed_at: new Date().toISOString(),
        error_code: null,
        error_message: null,
      })
      .eq("id", input.meetingId)
      .select("*")
      .single();

    if (error || !data) {
      throw ApiError.databaseOperationFailed("Could not mark the upload as complete.");
    }

    return mapMeeting(data);
  }

  async markMeetingFailed(input: {
    meetingId: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<Meeting> {
    const { data, error } = await this.client
      .from("meetings")
      .update({
        status: "failed",
        error_code: input.errorCode,
        error_message: input.errorMessage,
      })
      .eq("id", input.meetingId)
      .select("*")
      .single();

    if (error || !data) {
      throw ApiError.databaseOperationFailed("Could not mark the meeting as failed.");
    }

    return mapMeeting(data);
  }

  async markTranscriptionStarted(meetingId: string): Promise<Meeting> {
    const { data, error } = await this.client
      .from("meetings")
      .update({
        status: "transcribing",
        processing_started_at: new Date().toISOString(),
        error_code: null,
        error_message: null,
      })
      .eq("id", meetingId)
      .in("status", ["created", "failed"])
      .select("*")
      .maybeSingle();

    if (error && !isMissingRowError(error)) {
      throw ApiError.databaseOperationFailed(
        "Could not mark transcription as started.",
      );
    }

    if (!data) {
      throw ApiError.conflict(
        "TRANSCRIPTION_ALREADY_RUNNING",
        "This meeting is already being transcribed or is not ready to transcribe.",
      );
    }

    return mapMeeting(data);
  }

  async markAnalysisStarted(meetingId: string): Promise<Meeting> {
    const { data, error } = await this.client
      .from("meetings")
      .update({
        status: "analysing",
        error_code: null,
        error_message: null,
      })
      .eq("id", meetingId)
      .in("status", ["transcribed", "analysing", "completed", "failed"])
      .select("*")
      .maybeSingle();

    if (error && !isMissingRowError(error)) {
      throw ApiError.databaseOperationFailed("Could not mark analysis as started.");
    }

    if (!data) {
      throw ApiError.conflict(
        "INVALID_MEETING_STATE",
        "This meeting is not ready for Gemini analysis.",
      );
    }

    return mapMeeting(data);
  }

  async replaceMeetingTranscription(
    input: Parameters<MeetingRepository["replaceMeetingTranscription"]>[0],
  ): Promise<TranscribeMeetingResponse> {
    const speakers = input.transcription.speakers.map((speaker) => ({
      raw_speaker_index: speaker.rawSpeakerIndex,
      display_name: speaker.displayName,
      total_speaking_seconds: speaker.totalSpeakingSeconds,
      speaking_percentage: speaker.speakingPercentage,
    }));
    const segments = input.transcription.segments.map((segment) => ({
      raw_speaker_index: segment.rawSpeakerIndex,
      segment_index: segment.segmentIndex,
      start_ms: segment.startMs,
      end_ms: segment.endMs,
      text: segment.text,
      confidence: segment.confidence,
      words: segment.words as unknown as Json,
    }));

    const { error } = await this.client.rpc("replace_meeting_transcription", {
      p_meeting_id: input.meetingId,
      p_duration_seconds: input.transcription.durationSeconds ?? 0,
      p_language: input.transcription.language ?? "",
      p_model_name: input.transcription.modelName ?? "unknown",
      p_provider_request_id: input.transcription.providerRequestId ?? "",
      p_diarize_model: input.transcription.diarizeModel,
      p_confidence: input.transcription.confidence ?? 0,
      p_word_count: input.transcription.wordCount,
      p_speaker_count: input.transcription.speakers.length,
      p_segment_count: input.transcription.segments.length,
      p_speakers: speakers as unknown as Json,
      p_segments: segments as unknown as Json,
      p_processing_started_at: input.processingStartedAt,
      p_processing_time_ms: input.processingTimeMs,
    });

    if (error) {
      throw ApiError.transcriptPersistenceFailed();
    }

    const detail = await this.getMeetingDetail(input.meetingId);
    if (!detail) {
      throw ApiError.databaseOperationFailed(
        "Transcription was saved but the meeting could not be reloaded.",
      );
    }

    return buildTranscribeMeetingResponse({
      detail,
      alreadyTranscribed: false,
      transcription: input.transcription,
      processingTimeMs: input.processingTimeMs,
    });
  }

  async listMeetings(query: MeetingListQuery): Promise<PaginatedMeetingList> {
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    const sortColumn = meetingSortColumns[query.sort];

    let request = this.client.from("meetings").select("*", { count: "exact" });

    if (query.status) {
      request = request.eq("status", query.status);
    }

    if (query.sourceType) {
      request = request.eq("source_type", query.sourceType);
    }

    if (query.query) {
      request = request.ilike("title", `%${query.query}%`);
    }

    const { data, error, count } = await request
      .order(sortColumn, { ascending: query.order === "asc" })
      .range(from, to);

    if (error || !data) {
      throw ApiError.databaseOperationFailed("Could not list meetings.");
    }

    const totalItems = count ?? 0;

    return {
      items: data.map(mapMeeting),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }

  async getMeetingById(meetingId: string): Promise<Meeting | null> {
    const { data, error } = await this.client
      .from("meetings")
      .select("*")
      .eq("id", meetingId)
      .maybeSingle();

    if (error && !isMissingRowError(error)) {
      throw ApiError.databaseOperationFailed("Could not retrieve the meeting.");
    }

    return data ? mapMeeting(data) : null;
  }

  async getMeetingDetail(meetingId: string): Promise<MeetingDetail | null> {
    const { data: meeting, error: meetingError } = await this.client
      .from("meetings")
      .select("*")
      .eq("id", meetingId)
      .maybeSingle();

    if (meetingError && !isMissingRowError(meetingError)) {
      throw ApiError.databaseOperationFailed("Could not retrieve the meeting.");
    }

    if (!meeting) {
      return null;
    }

    const [
      speakersResult,
      segmentsResult,
      summaryResult,
      actionItemsResult,
      topicsResult,
      chunksResult,
    ] = await Promise.all([
      this.client
        .from("meeting_speakers")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("raw_speaker_index", { ascending: true }),
      this.client
        .from("transcript_segments")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("segment_index", { ascending: true }),
      this.client
        .from("meeting_summaries")
        .select("*")
        .eq("meeting_id", meetingId)
        .maybeSingle(),
      this.client
        .from("action_items")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("created_at", { ascending: true }),
      this.client
        .from("meeting_topics")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("mention_count", { ascending: false }),
      this.client
        .from("meeting_chunks")
        .select("id", { count: "exact", head: true })
        .eq("meeting_id", meetingId),
    ]);

    const errors = [
      speakersResult.error,
      segmentsResult.error,
      summaryResult.error && !isMissingRowError(summaryResult.error)
        ? summaryResult.error
        : null,
      actionItemsResult.error,
      topicsResult.error,
      chunksResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      throw ApiError.databaseOperationFailed(
        "Could not retrieve the full meeting detail.",
      );
    }

    return mapMeetingDetail({
      meeting,
      speakers: speakersResult.data ?? [],
      transcriptSegments: segmentsResult.data ?? [],
      summary: summaryResult.data ?? null,
      actionItems: actionItemsResult.data ?? [],
      topics: topicsResult.data ?? [],
      chunkCount: chunksResult.count ?? 0,
    });
  }

  async getPersistedMeetingAnalysis(
    meetingId: string,
    options: { alreadyAnalysed?: boolean } = {},
  ): Promise<AnalyzeMeetingResponse | null> {
    const { data: meeting, error: meetingError } = await this.client
      .from("meetings")
      .select("*")
      .eq("id", meetingId)
      .maybeSingle();

    if (meetingError && !isMissingRowError(meetingError)) {
      throw ApiError.databaseOperationFailed("Could not retrieve the meeting.");
    }

    if (!meeting) {
      return null;
    }

    const [summaryResult, actionItemsResult, topicsResult] = await Promise.all([
      this.client
        .from("meeting_summaries")
        .select("*")
        .eq("meeting_id", meetingId)
        .maybeSingle(),
      this.client
        .from("action_items")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("created_at", { ascending: true }),
      this.client
        .from("meeting_topics")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("mention_count", { ascending: false }),
    ]);

    const errors = [
      summaryResult.error && !isMissingRowError(summaryResult.error)
        ? summaryResult.error
        : null,
      actionItemsResult.error,
      topicsResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      throw ApiError.databaseOperationFailed(
        "Could not retrieve the persisted analysis.",
      );
    }

    if (!summaryResult.data) {
      return null;
    }

    return buildAnalyzeMeetingResponse({
      meeting,
      summary: summaryResult.data,
      actionItems: actionItemsResult.data ?? [],
      topics: topicsResult.data ?? [],
      alreadyAnalysed: options.alreadyAnalysed ?? true,
    });
  }

  async persistMeetingAnalysis(input: {
    meetingId: string;
    result: Parameters<MeetingRepository["persistMeetingAnalysis"]>[0]["result"];
  }): Promise<AnalyzeMeetingResponse> {
    const { error } = await this.client.rpc("persist_meeting_analysis", {
      p_meeting_id: input.meetingId,
      p_model_name: input.result.modelName,
      p_response_id: input.result.responseId ?? "",
      p_processing_time_ms: input.result.processingTimeMs,
      p_analysis: input.result.analysis as unknown as Json,
    });

    if (error) {
      throw ApiError.analysisPersistenceFailed();
    }

    const persisted = await this.getPersistedMeetingAnalysis(input.meetingId, {
      alreadyAnalysed: false,
    });

    if (!persisted) {
      throw ApiError.analysisPersistenceFailed();
    }

    return persisted;
  }

  async updateSpeakerName(input: {
    meetingId: string;
    speakerId: string;
    displayName: string;
  }): Promise<MeetingSpeaker> {
    const { data, error } = await this.client
      .from("meeting_speakers")
      .update({
        display_name: input.displayName,
      })
      .eq("id", input.speakerId)
      .eq("meeting_id", input.meetingId)
      .select("*")
      .maybeSingle();

    if (error && !isMissingRowError(error)) {
      throw ApiError.databaseOperationFailed("Could not update the speaker name.");
    }

    if (!data) {
      throw ApiError.speakerNotFound();
    }

    return mapMeetingSpeaker(data);
  }

  async updateActionItemStatus(input: {
    actionItemId: string;
    status: "open" | "completed";
  }): Promise<ActionItem> {
    const completedAt = input.status === "completed" ? new Date().toISOString() : null;
    const { data, error } = await this.client
      .from("action_items")
      .update({
        status: input.status,
        completed_at: completedAt,
      })
      .eq("id", input.actionItemId)
      .select("*")
      .maybeSingle();

    if (error && !isMissingRowError(error)) {
      throw ApiError.databaseOperationFailed("Could not update the action item.");
    }

    if (!data) {
      throw ApiError.actionItemNotFound();
    }

    return mapActionItem(data);
  }

  async getMeetingAnalytics(_meetingId: string): Promise<MeetingAnalytics | null> {
    return null;
  }
}
