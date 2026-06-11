import type {
  ActionItem,
  Meeting,
  MeetingAnalytics,
  MeetingDetail,
  MeetingListQuery,
  MeetingSpeaker,
  PaginatedMeetingList,
} from "@scribeflow/shared";
import { ApiError } from "../errors/apiError.js";
import type { MeetingRepository } from "../services/interfaces.js";
import type { ScribeFlowSupabaseClient } from "../config/supabaseClient.js";
import type { Database } from "../types/database.types.js";
import {
  mapActionItem,
  mapMeeting,
  mapMeetingDetail,
  mapMeetingSpeaker,
} from "./mappers.js";

type MeetingInsert = Database["public"]["Tables"]["meetings"]["Insert"];

const meetingSortColumns: Record<MeetingListQuery["sort"], string> = {
  createdAt: "created_at",
  recordedAt: "recorded_at",
  title: "title",
};

const isMissingRowError = (error: { code?: string } | null) =>
  error?.code === "PGRST116";

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
