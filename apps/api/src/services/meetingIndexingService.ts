import type { MeetingDetail } from "@scribeflow/shared";
import { logger } from "../config/logger.js";
import { ApiError } from "../errors/apiError.js";
import type { ScribeFlowSupabaseClient } from "../config/supabaseClient.js";
import type { Database } from "../types/database.types.js";
import { createMeetingChunks } from "./meetingChunkingService.js";
import type { MeetingEmbeddingService } from "./meetingEmbeddingService.js";
import { env } from "../config/env.js";

type ChunkRow = Database["public"]["Tables"]["meeting_chunks"]["Insert"];

export interface MeetingIndexingResult {
  meetingId: string;
  chunkCount: number;
  embeddingDimensions: number;
  embeddingModel: string;
  indexedAt: string;
  idempotent: boolean;
}

export class MeetingIndexingService {
  constructor(
    private readonly supabaseClient: ScribeFlowSupabaseClient,
    private readonly embeddingService: MeetingEmbeddingService,
  ) {}

  async indexMeeting(detail: MeetingDetail): Promise<MeetingIndexingResult> {
    const meetingId = detail.meeting.id;

    if (detail.meeting.status !== "completed") {
      throw ApiError.conflict(
        "INVALID_MEETING_STATE",
        "Only completed meetings can be indexed.",
      );
    }

    const { count: existingCount, error: countError } = await this.supabaseClient
      .from("meeting_chunks")
      .select("id", { count: "exact", head: true })
      .eq("meeting_id", meetingId);

    if (countError) {
      throw ApiError.databaseOperationFailed("Could not count meeting chunks.", {
        cause: countError,
      });
    }

    const existingChunkCount = existingCount ?? 0;

    if (existingChunkCount > 0) {
      logger.debug(
        { meetingId, chunkCount: existingChunkCount },
        "meeting already indexed, returning cached result",
      );

      return {
        meetingId,
        chunkCount: existingChunkCount,
        embeddingDimensions: env.GEMINI_EMBEDDING_DIMENSIONS,
        embeddingModel: env.GEMINI_EMBEDDING_MODEL,
        indexedAt: new Date().toISOString(),
        idempotent: true,
      };
    }

    const chunks = createMeetingChunks(detail);
    if (chunks.length === 0) {
      throw ApiError.badRequest("No chunks could be created from this meeting.");
    }

    const chunkTexts = chunks.map((chunk) => chunk.text);

    const embeddingResults = await this.embeddingService.embedTexts(chunkTexts);

    const now = new Date().toISOString();
    const chunkRows = chunks.map((chunk, index) => {
      const embedding = embeddingResults[index];
      if (!embedding) {
        throw new Error(`Missing embedding for chunk ${index}`);
      }

      const cleanMetadata = Object.fromEntries(
        Object.entries(chunk.metadata).filter(([, v]) => v !== undefined),
      );

      const row: ChunkRow = {
        meeting_id: meetingId,
        chunk_index: index,
        content: chunk.text,
        start_ms: chunk.metadata.startMs ?? null,
        end_ms: chunk.metadata.endMs ?? null,
        speaker_names: chunk.metadata.speakerName ? [chunk.metadata.speakerName] : [],
        metadata: cleanMetadata as any,
        embedding: JSON.stringify(embedding.embedding),
        embedding_model: env.GEMINI_EMBEDDING_MODEL,
        created_at: now,
      };
      return row;
    });

    const { error: deleteError } = await this.supabaseClient
      .from("meeting_chunks")
      .delete()
      .eq("meeting_id", meetingId);

    if (deleteError) {
      logger.error({ err: deleteError, meetingId }, "failed to delete existing chunks");
      throw ApiError.databaseOperationFailed("Failed to prepare chunks for indexing.");
    }

    const { error: insertError } = await this.supabaseClient
      .from("meeting_chunks")
      .insert(chunkRows);

    if (insertError) {
      logger.error({ err: insertError, meetingId }, "failed to insert chunks");
      throw ApiError.databaseOperationFailed(
        "Failed to insert chunks into the database.",
      );
    }

    logger.info(
      {
        meetingId,
        chunkCount: chunkRows.length,
        embeddingModel: env.GEMINI_EMBEDDING_MODEL,
      },
      "meeting indexed successfully",
    );

    return {
      meetingId,
      chunkCount: chunkRows.length,
      embeddingDimensions: env.GEMINI_EMBEDDING_DIMENSIONS,
      embeddingModel: env.GEMINI_EMBEDDING_MODEL,
      indexedAt: now,
      idempotent: false,
    };
  }
}
