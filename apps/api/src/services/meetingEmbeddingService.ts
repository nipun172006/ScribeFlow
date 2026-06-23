import { GoogleGenAI } from "@google/genai";
import { env, providerConfig } from "../config/env.js";
import { logger } from "../config/logger.js";
import { ApiError } from "../errors/apiError.js";

export type EmbeddingResult = {
  embedding: number[];
  dimensions: number;
};

export interface MeetingEmbeddingService {
  isConfigured(): boolean;
  embedText(text: string): Promise<EmbeddingResult>;
  embedTexts(texts: string[]): Promise<EmbeddingResult[]>;
}

type GeminiEmbedContentResponse = {
  embeddings: Array<{
    values: number[];
  }>;
};

type GeminiEmbeddingClient = {
  models: {
    embedContent: (request: {
      model: string;
      contents: string | string[];
      config?: {
        outputDimensionality?: number;
      };
    }) => Promise<GeminiEmbedContentResponse>;
  };
};

export class GeminiMeetingEmbeddingService implements MeetingEmbeddingService {
  private client: GeminiEmbeddingClient | null = null;

  constructor(
    private readonly createClient: () => GeminiEmbeddingClient = () =>
      new GoogleGenAI({
        apiKey: env.GEMINI_API_KEY ?? "",
      }) as unknown as GeminiEmbeddingClient,
  ) {}

  isConfigured(): boolean {
    return providerConfig.geminiConfigured;
  }

  /**
   * Embeds a single piece of text. Convenience wrapper around
   * {@link embedTexts} for the common single-input case.
   *
   * @param text - Non-empty text to embed.
   * @returns The embedding vector and its dimensionality.
   */
  async embedText(text: string): Promise<EmbeddingResult> {
    const results = await this.embedTexts([text]);
    return results[0]!;
  }

  /**
   * Embeds one or more texts via the Gemini embedding model in a single
   * batched request.
   *
   * All inputs are sent in one `embedContent` call (the Gemini API accepts an
   * array of contents and returns embeddings in input order), so a meeting
   * with N chunks costs one round-trip instead of N. Each returned vector is
   * validated to match the configured dimensionality
   * ({@link env.GEMINI_EMBEDDING_DIMENSIONS}); a mismatch is treated as an
   * invalid provider response. Upstream Gemini failures are normalised into
   * the appropriate {@link ApiError} (auth, rate limit, timeout or generic).
   *
   * @param texts - Non-empty array of non-empty strings to embed.
   * @returns One {@link EmbeddingResult} per input text, in input order.
   * @throws ApiError When the service is unconfigured, an input is empty, or
   *   the Gemini request fails.
   */
  async embedTexts(texts: string[]): Promise<EmbeddingResult[]> {
    if (!this.isConfigured()) {
      throw ApiError.geminiNotConfigured();
    }

    if (texts.length === 0) {
      throw ApiError.badRequest("At least one text is required for embedding.");
    }

    const trimmedTexts = texts.map((text) => text.trim());
    if (trimmedTexts.some((text) => !text)) {
      throw ApiError.badRequest("Embedding text cannot be empty.");
    }

    const client = this.getClient();
    const model = env.GEMINI_EMBEDDING_MODEL;
    const expectedDimensions = env.GEMINI_EMBEDDING_DIMENSIONS;

    try {
      const response = await client.models.embedContent({
        model,
        contents: trimmedTexts,
        config: {
          outputDimensionality: expectedDimensions,
        },
      });

      const embeddings = response.embeddings;
      if (!embeddings || embeddings.length !== trimmedTexts.length) {
        throw ApiError.geminiInvalidResponse(
          `Gemini returned ${embeddings?.length ?? 0} embeddings for ${trimmedTexts.length} inputs.`,
        );
      }

      return embeddings.map((entry, index) => {
        const embeddingValues = entry?.values;
        if (!embeddingValues || embeddingValues.length === 0) {
          throw ApiError.geminiInvalidResponse(
            `Gemini returned an empty embedding for input ${index}.`,
          );
        }

        if (embeddingValues.length !== expectedDimensions) {
          logger.warn(
            {
              model,
              expectedDimensions,
              actualDimensions: embeddingValues.length,
            },
            "embedding dimensions mismatch",
          );

          throw ApiError.geminiInvalidResponse(
            `Embedding dimensions mismatch: expected ${expectedDimensions}, got ${embeddingValues.length}`,
          );
        }

        return {
          embedding: embeddingValues,
          dimensions: embeddingValues.length,
        };
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      const candidate = error as {
        status?: unknown;
        code?: unknown;
        name?: unknown;
        message?: unknown;
      };
      const status = typeof candidate.status === "number" ? candidate.status : null;
      const code = typeof candidate.code === "number" ? candidate.code : null;
      const name = typeof candidate.name === "string" ? candidate.name : "";
      const message = typeof candidate.message === "string" ? candidate.message : "";

      if (status === 401 || status === 403 || code === 401 || code === 403) {
        throw ApiError.geminiAuthFailed();
      }

      if (status === 429 || code === 429) {
        throw ApiError.geminiRateLimited();
      }

      if (
        name === "AbortError" ||
        name === "TimeoutError" ||
        message.toLowerCase().includes("timeout")
      ) {
        throw ApiError.geminiRequestTimeout();
      }

      throw ApiError.geminiRequestFailed();
    }
  }

  private getClient() {
    this.client ??= this.createClient();
    return this.client;
  }
}
