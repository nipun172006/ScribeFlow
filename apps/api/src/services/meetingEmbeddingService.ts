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
      contents: string;
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

  async embedText(text: string): Promise<EmbeddingResult> {
    const results = await this.embedTexts([text]);
    return results[0]!;
  }

  async embedTexts(texts: string[]): Promise<EmbeddingResult[]> {
    if (!this.isConfigured()) {
      throw ApiError.geminiNotConfigured();
    }

    if (texts.length === 0) {
      throw ApiError.badRequest("At least one text is required for embedding.");
    }

    const client = this.getClient();
    const model = env.GEMINI_EMBEDDING_MODEL;
    const expectedDimensions = env.GEMINI_EMBEDDING_DIMENSIONS;

    try {
      const results: EmbeddingResult[] = [];

      for (const text of texts) {
        const trimmed = text.trim();
        if (!trimmed) {
          throw ApiError.badRequest("Embedding text cannot be empty.");
        }

        const response = await client.models.embedContent({
          model,
          contents: trimmed,
          config: {
            outputDimensionality: expectedDimensions,
          },
        });

        const embeddingValues = response.embeddings?.[0]?.values;
        if (!embeddingValues || embeddingValues.length === 0) {
          throw ApiError.geminiInvalidResponse("Gemini returned an empty embedding.");
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

        results.push({
          embedding: embeddingValues,
          dimensions: embeddingValues.length,
        });
      }

      return results;
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
