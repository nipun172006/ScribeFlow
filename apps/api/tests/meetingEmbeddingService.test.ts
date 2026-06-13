import { afterEach, describe, expect, it, vi } from "vitest";

const mockEmbedding = Array(768)
  .fill(0)
  .map(() => Math.random());

async function loadService(geminiKey = "test-gemini-key") {
  vi.resetModules();
  vi.stubEnv("GEMINI_API_KEY", geminiKey);
  vi.stubEnv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-2");
  vi.stubEnv("GEMINI_EMBEDDING_DIMENSIONS", "768");

  return import("../src/services/meetingEmbeddingService.js");
}

describe("GeminiMeetingEmbeddingService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("detects Gemini configuration", async () => {
    const { GeminiMeetingEmbeddingService } = await loadService("configured-key");
    expect(new GeminiMeetingEmbeddingService().isConfigured()).toBe(true);

    const { GeminiMeetingEmbeddingService: UnconfiguredService } =
      await loadService("");
    expect(
      new UnconfiguredService(() => ({
        models: { embedContent: vi.fn() },
      })).isConfigured(),
    ).toBe(false);
  });

  it("embeds a single text successfully", async () => {
    const { GeminiMeetingEmbeddingService } = await loadService();
    const embedContent = vi.fn(async () => ({
      embeddings: [{ values: mockEmbedding }],
    }));

    const service = new GeminiMeetingEmbeddingService(() => ({
      models: { embedContent },
    }));

    const result = await service.embedText("hello world");

    expect(result.embedding).toEqual(mockEmbedding);
    expect(result.dimensions).toBe(768);
    expect(embedContent).toHaveBeenCalledOnce();
  });

  it("embeds multiple texts successfully", async () => {
    const { GeminiMeetingEmbeddingService } = await loadService();
    const embedContent = vi.fn(async () => ({
      embeddings: [{ values: mockEmbedding }],
    }));

    const service = new GeminiMeetingEmbeddingService(() => ({
      models: { embedContent },
    }));

    const results = await service.embedTexts(["hello", "world", "test"]);

    expect(results).toHaveLength(3);
    results.forEach((result) => {
      expect(result.embedding).toEqual(mockEmbedding);
      expect(result.dimensions).toBe(768);
    });
    expect(embedContent).toHaveBeenCalledTimes(3);
  });

  it("rejects empty text", async () => {
    const { GeminiMeetingEmbeddingService } = await loadService();
    const service = new GeminiMeetingEmbeddingService(() => ({
      models: { embedContent: vi.fn() },
    }));

    await expect(service.embedTexts([""])).rejects.toThrow("cannot be empty");
  });

  it("rejects empty texts array", async () => {
    const { GeminiMeetingEmbeddingService } = await loadService();
    const service = new GeminiMeetingEmbeddingService(() => ({
      models: { embedContent: vi.fn() },
    }));

    await expect(service.embedTexts([])).rejects.toThrow(
      "At least one text is required",
    );
  });

  it("handles dimension mismatch", async () => {
    const { GeminiMeetingEmbeddingService } = await loadService();
    const wrongDimensions = Array(256).fill(0);
    const embedContent = vi.fn(async () => ({
      embeddings: [{ values: wrongDimensions }],
    }));

    const service = new GeminiMeetingEmbeddingService(() => ({
      models: { embedContent },
    }));

    await expect(service.embedText("hello")).rejects.toThrow("dimensions mismatch");
  });

  it("handles Gemini auth errors", async () => {
    const { GeminiMeetingEmbeddingService } = await loadService();
    const embedContent = vi.fn(async () => {
      throw { status: 401, message: "Unauthorized" };
    });

    const service = new GeminiMeetingEmbeddingService(() => ({
      models: { embedContent },
    }));

    await expect(service.embedText("hello")).rejects.toThrow();
  });
});
