import type { ScribeFlowSupabaseClient } from "../config/supabaseClient.js";
import { logger } from "../config/logger.js";
import { ApiError } from "../errors/apiError.js";
import type { MeetingEmbeddingService } from "./meetingEmbeddingService.js";

export type SearchResult = {
  meetingId: string;
  meetingTitle: string;
  chunkText: string;
  chunkKind: string;
  similarityScore: number;
  startMs?: number | null;
  endMs?: number | null;
  speakerNames: string[];
  sourceSegmentIds: string[];
};

export interface MeetingSearchService {
  search(query: string, limit?: number): Promise<SearchResult[]>;
}

export class SupabaseMeetingSearchService implements MeetingSearchService {
  constructor(
    private readonly supabaseClient: ScribeFlowSupabaseClient,
    private readonly embeddingService: MeetingEmbeddingService,
  ) {}

  async search(query: string, limit: number = 10): Promise<SearchResult[]> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      throw ApiError.badRequest("Search query cannot be empty.");
    }

    if (limit < 1) {
      throw ApiError.badRequest("Limit must be at least 1.");
    }

    const maxLimit = Math.min(limit, 100);

    const embeddingResult = await this.embeddingService.embedText(trimmedQuery);
    const queryEmbedding = embeddingResult.embedding;

    logger.debug(
      {
        query: trimmedQuery.substring(0, 50),
        embeddingDimensions: queryEmbedding.length,
      },
      "embedded search query",
    );

    type ChunkRow = {
      id: string;
      meeting_id: string;
      content: string;
      metadata: Record<string, unknown>;
      start_ms: number | null;
      end_ms: number | null;
      speaker_names: string[];
      similarity: number;
    };

    type MeetingRow = {
      id: string;
      title: string;
    };

    const { data, error } = await this.supabaseClient.rpc("match_meeting_chunks", {
      p_query_embedding: JSON.stringify(queryEmbedding),
      p_match_threshold: 0.5,
      p_match_count: maxLimit,
    });

    if (error) {
      logger.error({ err: error }, "vector similarity search failed");
      throw ApiError.databaseOperationFailed("Search query failed.");
    }

    if (!Array.isArray(data)) {
      return [];
    }

    const meetingIds = [
      ...new Set((data as Array<{ meeting_id: string }>).map((r) => r.meeting_id)),
    ];

    const { data: meetings, error: meetingError } = await this.supabaseClient
      .from("meetings")
      .select("id, title")
      .in("id", meetingIds);

    if (meetingError) {
      logger.warn({ err: meetingError }, "failed to fetch meeting titles");
    }

    const meetingTitles = new Map(
      (meetings as MeetingRow[] | null)?.map((m) => [m.id, m.title]) || [],
    );

    const results = (data as ChunkRow[]).map((row) => {
      const metadata = row.metadata as Record<string, unknown>;
      return {
        meetingId: row.meeting_id,
        meetingTitle: meetingTitles.get(row.meeting_id) || "Unknown Meeting",
        chunkText: row.content,
        chunkKind: typeof metadata.kind === "string" ? metadata.kind : "unknown",
        similarityScore: row.similarity,
        startMs: row.start_ms,
        endMs: row.end_ms,
        speakerNames: row.speaker_names,
        sourceSegmentIds:
          Array.isArray(metadata.sourceSegmentIds) &&
          metadata.sourceSegmentIds.every((id): id is string => typeof id === "string")
            ? metadata.sourceSegmentIds
            : [],
      };
    });

    logger.debug(
      { query: trimmedQuery.substring(0, 50), resultCount: results.length },
      "search completed",
    );

    return results;
  }
}
