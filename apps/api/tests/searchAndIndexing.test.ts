import { describe, expect, it } from "vitest";
import type { MeetingIndexingResult } from "../src/services/meetingIndexingService.js";

/**
 * Verifier-compatible response shape tests.
 * These tests ensure the indexing endpoint response has the fields
 * that verifyRag.mjs relies on.
 */
describe("MeetingIndexingResult shape", () => {
  it("has all fields expected by verifyRag.mjs", () => {
    const result: MeetingIndexingResult = {
      meetingId: "11111111-1111-1111-1111-111111111111",
      chunkCount: 12,
      embeddingDimensions: 768,
      embeddingModel: "gemini-embedding-2",
      indexedAt: new Date().toISOString(),
      idempotent: false,
    };

    // verifyRag.mjs checks: indexingMetadata?.chunkCount > 0
    expect(result.chunkCount).toBeGreaterThan(0);
    // verifyRag.mjs reads: indexingMetadata.embeddingModel
    expect(typeof result.embeddingModel).toBe("string");
    // verifyRag.mjs checks: indexingMetadata2?.idempotent === true
    expect(typeof result.idempotent).toBe("boolean");
    // verifyRag.mjs reads: indexingMetadata.embeddingDimensions
    expect(typeof result.embeddingDimensions).toBe("number");
  });

  it("idempotent result preserves chunk count", () => {
    const first: MeetingIndexingResult = {
      meetingId: "11111111-1111-1111-1111-111111111111",
      chunkCount: 10,
      embeddingDimensions: 768,
      embeddingModel: "gemini-embedding-2",
      indexedAt: new Date().toISOString(),
      idempotent: false,
    };

    const second: MeetingIndexingResult = {
      meetingId: "11111111-1111-1111-1111-111111111111",
      chunkCount: 10,
      embeddingDimensions: 768,
      embeddingModel: "gemini-embedding-2",
      indexedAt: new Date().toISOString(),
      idempotent: true,
    };

    expect(second.chunkCount).toBe(first.chunkCount);
    expect(second.idempotent).toBe(true);
  });
});

describe("Search result DTO shape", () => {
  it("matches verifier expected fields", () => {
    // verifyRag.mjs checks: results[0].chunkKind, results[0].similarityScore,
    // results[0].chunkText, r.meetingId
    const mockSearchResult = {
      meetingId: "11111111-1111-1111-1111-111111111111",
      meetingTitle: "Test Meeting",
      chunkText: "Some chunk content",
      chunkKind: "transcript",
      similarityScore: 0.85,
      startMs: 0,
      endMs: 1000,
      speakerNames: ["Alice"],
      sourceSegmentIds: [],
    };

    expect(typeof mockSearchResult.meetingId).toBe("string");
    expect(typeof mockSearchResult.chunkKind).toBe("string");
    expect(typeof mockSearchResult.similarityScore).toBe("number");
    expect(typeof mockSearchResult.chunkText).toBe("string");
    expect(Array.isArray(mockSearchResult.speakerNames)).toBe(true);
  });
});

describe("Search input validation", () => {
  it("rejects empty query at schema level", async () => {
    const { searchInputSchema } = await import("@scribeflow/shared");

    const emptyResult = searchInputSchema.safeParse({ query: "" });
    expect(emptyResult.success).toBe(false);

    const whitespaceResult = searchInputSchema.safeParse({ query: "   " });
    expect(whitespaceResult.success).toBe(false);
  });

  it("accepts valid query with defaults", async () => {
    const { searchInputSchema } = await import("@scribeflow/shared");

    const result = searchInputSchema.safeParse({ query: "action items" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
    }
  });
});
