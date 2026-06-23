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

  it("embeds multiple texts successfully in a single batched call", async () => {
    const { GeminiMeetingEmbeddingService } = await loadService();
    const embedContent = vi.fn(async (request: { contents: string | string[] }) => {
      const count = Array.isArray(request.contents) ? request.contents.length : 1;
      return {
        embeddings: Array.from({ length: count }, () => ({
          values: mockEmbedding,
        })),
      };
    });

    const service = new GeminiMeetingEmbeddingService(() => ({
      models: { embedContent },
    }));

    const results = await service.embedTexts(["hello", "world", "test"]);

    expect(results).toHaveLength(3);
    results.forEach((result) => {
      expect(result.embedding).toEqual(mockEmbedding);
      expect(result.dimensions).toBe(768);
    });
    // Batched: one round-trip for the whole set, not one per text.
    expect(embedContent).toHaveBeenCalledOnce();
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

  it("maps a 429 response to a rate-limit error", async () => {
    const { GeminiMeetingEmbeddingService } = await loadService();
    const embedContent = vi.fn(async () => {
      throw { code: 429, message: "Too Many Requests" };
    });

    const service = new GeminiMeetingEmbeddingService(() => ({
      models: { embedContent },
    }));

    await expect(service.embedText("hello")).rejects.toThrow(/rate.?limit/i);
  });

  it("maps abort/timeout failures to a timeout error", async () => {
    const { GeminiMeetingEmbeddingService } = await loadService();
    const embedContent = vi.fn(async () => {
      const error = new Error("operation timed out");
      error.name = "AbortError";
      throw error;
    });

    const service = new GeminiMeetingEmbeddingService(() => ({
      models: { embedContent },
    }));

    await expect(service.embedText("hello")).rejects.toThrow(/timed out|timeout/i);
  });

  it("maps unknown failures to a generic request-failed error", async () => {
    const { GeminiMeetingEmbeddingService } = await loadService();
    const embedContent = vi.fn(async () => {
      throw new Error("something unexpected");
    });

    const service = new GeminiMeetingEmbeddingService(() => ({
      models: { embedContent },
    }));

    await expect(service.embedText("hello")).rejects.toThrow();
  });

  it("rejects an empty string that appears partway through a batch", async () => {
    const { GeminiMeetingEmbeddingService } = await loadService();
    const embedContent = vi.fn(async () => ({
      embeddings: [{ values: mockEmbedding }],
    }));

    const service = new GeminiMeetingEmbeddingService(() => ({
      models: { embedContent },
    }));

    await expect(service.embedTexts(["valid", "   "])).rejects.toThrow(
      "cannot be empty",
    );
  });

  it("treats an empty embedding array from Gemini as an invalid response", async () => {
    const { GeminiMeetingEmbeddingService } = await loadService();
    const embedContent = vi.fn(async () => ({ embeddings: [{ values: [] }] }));

    const service = new GeminiMeetingEmbeddingService(() => ({
      models: { embedContent },
    }));

    await expect(service.embedText("hello")).rejects.toThrow();
  });
});
