import { describe, expect, it, vi } from "vitest";
import { MeetingIndexingService } from "../src/services/meetingIndexingService.js";
import type { ScribeFlowSupabaseClient } from "../src/config/supabaseClient.js";
import type {
  EmbeddingResult,
  MeetingEmbeddingService,
} from "../src/services/meetingEmbeddingService.js";
import type { MeetingDetail } from "@scribeflow/shared";

const MEETING_ID = "11111111-1111-1111-1111-111111111111";

function stubEmbeddingService(): MeetingEmbeddingService {
  const embedding = Array(768).fill(0.1);
  return {
    isConfigured: () => true,
    embedText: vi.fn(
      async (): Promise<EmbeddingResult> => ({
        embedding,
        dimensions: embedding.length,
      }),
    ),
    embedTexts: vi.fn(
      async (texts: string[]): Promise<EmbeddingResult[]> =>
        texts.map(() => ({ embedding, dimensions: embedding.length })),
    ),
  };
}

/**
 * Minimal Supabase double covering only the chains the indexing service uses:
 * a counting select, a delete-by-meeting and an insert.
 */
function stubSupabaseClient(options: {
  count?: number | null;
  countError?: unknown;
  deleteError?: unknown;
  insertError?: unknown;
}) {
  const insert = vi.fn(async () => ({ error: options.insertError ?? null }));
  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(async () => ({
          count: options.count ?? 0,
          error: options.countError ?? null,
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(async () => ({ error: options.deleteError ?? null })),
      })),
      insert,
    })),
  } as unknown as ScribeFlowSupabaseClient;

  return { client, insert };
}

function meetingDetail(
  overrides: Partial<MeetingDetail["meeting"]> = {},
): MeetingDetail {
  return {
    meeting: {
      id: MEETING_ID,
      title: "Indexing Test",
      sourceType: "upload",
      status: "completed",
      createdAt: "2026-06-13T00:00:00Z",
      updatedAt: "2026-06-13T01:00:00Z",
      recordedAt: "2026-06-13T00:00:00Z",
      knownParticipants: [],
      technicalTerms: [],
      metadata: {},
      originalFileName: null,
      storageBucket: null,
      storagePath: null,
      mimeType: null,
      expectedFileSizeBytes: null,
      fileSizeBytes: null,
      durationSeconds: 60,
      language: null,
      processingStartedAt: null,
      uploadCompletedAt: null,
      completedAt: "2026-06-13T01:00:00Z",
      processingTimeMs: null,
      errorCode: null,
      errorMessage: null,
      ...overrides,
    },
    speakers: [],
    transcriptSegments: [
      {
        id: "33333333-3333-3333-3333-333333333333",
        meetingId: MEETING_ID,
        speakerId: null,
        rawSpeakerIndex: 0,
        segmentIndex: 0,
        startMs: 0,
        endMs: 1000,
        text: "We will ship the release on Friday.",
        confidence: 0.95,
      },
    ],
    summary: null,
    actionItems: [],
    topics: [],
    chunkCount: 0,
  };
}

describe("MeetingIndexingService", () => {
  it("rejects meetings that are not completed", async () => {
    const { client } = stubSupabaseClient({});
    const service = new MeetingIndexingService(client, stubEmbeddingService());

    await expect(
      service.indexMeeting(meetingDetail({ status: "transcribing" })),
    ).rejects.toThrow("Only completed meetings can be indexed.");
  });

  it("returns a cached idempotent result when chunks already exist", async () => {
    const { client, insert } = stubSupabaseClient({ count: 7 });
    const service = new MeetingIndexingService(client, stubEmbeddingService());

    const result = await service.indexMeeting(meetingDetail());

    expect(result.idempotent).toBe(true);
    expect(result.chunkCount).toBe(7);
    // No new rows should be written on the idempotent path.
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a completed meeting that produces no chunks", async () => {
    const { client } = stubSupabaseClient({ count: 0 });
    const service = new MeetingIndexingService(client, stubEmbeddingService());

    const empty = meetingDetail();
    empty.transcriptSegments = [];

    await expect(service.indexMeeting(empty)).rejects.toThrow(
      "No chunks could be created",
    );
  });

  it("embeds and inserts chunks on the happy path", async () => {
    const { client, insert } = stubSupabaseClient({ count: 0 });
    const embedding = stubEmbeddingService();
    const service = new MeetingIndexingService(client, embedding);

    const result = await service.indexMeeting(meetingDetail());

    expect(result.idempotent).toBe(false);
    expect(result.chunkCount).toBeGreaterThan(0);
    expect(embedding.embedTexts).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledOnce();
  });

  it("fails when chunk insertion errors", async () => {
    const { client } = stubSupabaseClient({
      count: 0,
      insertError: { message: "insert failed" },
    });
    const service = new MeetingIndexingService(client, stubEmbeddingService());

    await expect(service.indexMeeting(meetingDetail())).rejects.toThrow();
  });
});
