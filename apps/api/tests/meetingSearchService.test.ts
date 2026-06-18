import { describe, expect, it, vi } from "vitest";
import { SupabaseMeetingSearchService } from "../src/services/meetingSearchService.js";
import type { ScribeFlowSupabaseClient } from "../src/config/supabaseClient.js";
import type {
  EmbeddingResult,
  MeetingEmbeddingService,
} from "../src/services/meetingEmbeddingService.js";

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

function stubEmbeddingService(): MeetingEmbeddingService {
  const embedding = Array(768).fill(0.1);
  const result: EmbeddingResult = { embedding, dimensions: embedding.length };
  return {
    isConfigured: () => true,
    embedText: vi.fn(async () => result),
    embedTexts: vi.fn(async () => [result]),
  };
}

/**
 * Builds a Supabase client test double whose `rpc` returns the supplied chunk
 * rows and whose `from(...).select(...).in(...)` returns the supplied meeting
 * titles. Only the methods exercised by the search service are implemented.
 */
function stubSupabaseClient(options: {
  rpc?: { data: unknown; error: unknown };
  meetings?: { data: unknown; error: unknown };
}) {
  const rpc = vi.fn(async () => options.rpc ?? { data: [], error: null });
  const inFn = vi.fn(async () => options.meetings ?? { data: [], error: null });
  const select = vi.fn(() => ({ in: inFn }));
  const from = vi.fn(() => ({ select }));

  const client = { rpc, from } as unknown as ScribeFlowSupabaseClient;
  return { client, rpc, from, select, inFn };
}

describe("SupabaseMeetingSearchService", () => {
  it("rejects an empty or whitespace-only query before calling the database", async () => {
    const embedding = stubEmbeddingService();
    const { client, rpc } = stubSupabaseClient({});
    const service = new SupabaseMeetingSearchService(client, embedding);

    await expect(service.search("   ")).rejects.toThrow("cannot be empty");
    expect(embedding.embedText).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a limit below 1", async () => {
    const { client } = stubSupabaseClient({});
    const service = new SupabaseMeetingSearchService(client, stubEmbeddingService());

    await expect(service.search("hello", 0)).rejects.toThrow("at least 1");
  });

  it("clamps the requested limit to a maximum of 100 matches", async () => {
    const { client, rpc } = stubSupabaseClient({ rpc: { data: [], error: null } });
    const service = new SupabaseMeetingSearchService(client, stubEmbeddingService());

    await service.search("hello", 5000);

    expect(rpc).toHaveBeenCalledWith(
      "match_meeting_chunks",
      expect.objectContaining({ p_match_count: 100 }),
    );
  });

  it("maps RPC rows into search results with resolved meeting titles", async () => {
    const rows: ChunkRow[] = [
      {
        id: "chunk-1",
        meeting_id: "meeting-1",
        content: "We agreed to ship on Friday.",
        metadata: { kind: "key_decision", sourceSegmentIds: ["seg-1", "seg-2"] },
        start_ms: 1000,
        end_ms: 2000,
        speaker_names: ["Alice"],
        similarity: 0.92,
      },
    ];
    const { client } = stubSupabaseClient({
      rpc: { data: rows, error: null },
      meetings: { data: [{ id: "meeting-1", title: "Launch Sync" }], error: null },
    });
    const service = new SupabaseMeetingSearchService(client, stubEmbeddingService());

    const results = await service.search("when do we ship");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      meetingId: "meeting-1",
      meetingTitle: "Launch Sync",
      chunkKind: "key_decision",
      similarityScore: 0.92,
      sourceSegmentIds: ["seg-1", "seg-2"],
    });
  });

  it("falls back to 'Unknown Meeting' when a title cannot be resolved", async () => {
    const rows: ChunkRow[] = [
      {
        id: "chunk-1",
        meeting_id: "missing-meeting",
        content: "Some content",
        metadata: {},
        start_ms: null,
        end_ms: null,
        speaker_names: [],
        similarity: 0.5,
      },
    ];
    const { client } = stubSupabaseClient({
      rpc: { data: rows, error: null },
      meetings: { data: [], error: null },
    });
    const service = new SupabaseMeetingSearchService(client, stubEmbeddingService());

    const results = await service.search("anything");

    expect(results[0]?.meetingTitle).toBe("Unknown Meeting");
    // Missing/invalid metadata should degrade gracefully rather than throw.
    expect(results[0]?.chunkKind).toBe("unknown");
    expect(results[0]?.sourceSegmentIds).toEqual([]);
  });

  it("returns an empty array when the RPC yields no rows", async () => {
    const { client } = stubSupabaseClient({ rpc: { data: null, error: null } });
    const service = new SupabaseMeetingSearchService(client, stubEmbeddingService());

    await expect(service.search("nothing matches")).resolves.toEqual([]);
  });

  it("throws a database error when the RPC fails", async () => {
    const { client } = stubSupabaseClient({
      rpc: { data: null, error: { message: "boom" } },
    });
    const service = new SupabaseMeetingSearchService(client, stubEmbeddingService());

    await expect(service.search("hello")).rejects.toThrow();
  });

  it("ignores non-string sourceSegmentIds in chunk metadata", async () => {
    const rows: ChunkRow[] = [
      {
        id: "chunk-1",
        meeting_id: "meeting-1",
        content: "Mixed metadata",
        metadata: { kind: "transcript", sourceSegmentIds: ["seg-1", 42, null] },
        start_ms: 0,
        end_ms: 100,
        speaker_names: ["Bob"],
        similarity: 0.7,
      },
    ];
    const { client } = stubSupabaseClient({
      rpc: { data: rows, error: null },
      meetings: { data: [{ id: "meeting-1", title: "Standup" }], error: null },
    });
    const service = new SupabaseMeetingSearchService(client, stubEmbeddingService());

    const results = await service.search("mixed");

    expect(results[0]?.sourceSegmentIds).toEqual([]);
  });
});
