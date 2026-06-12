import { DeepgramClient } from "@deepgram/sdk";
import type { NormalizedTranscription, TranscriptionWord } from "@scribeflow/shared";
import { env } from "../config/env.js";
import { ApiError } from "../errors/apiError.js";
import type { TranscribeRecordingInput, TranscriptionService } from "./interfaces.js";

type DeepgramTranscribeRequest = {
  url: string;
  model: string;
  diarize_model: string;
  punctuate: boolean;
  smart_format: boolean;
  utterances: boolean;
  paragraphs: boolean;
  language?: string;
  keyterm?: string[];
};

type DeepgramMediaClient = {
  listen: {
    v1: {
      media: {
        transcribeUrl: (
          request: DeepgramTranscribeRequest,
          requestOptions?: {
            timeoutInSeconds?: number;
            maxRetries?: number;
          },
        ) => Promise<unknown>;
      };
    };
  };
};

type DeepgramWord = {
  word?: unknown;
  punctuated_word?: unknown;
  start?: unknown;
  end?: unknown;
  confidence?: unknown;
  speaker?: unknown;
  speaker_confidence?: unknown;
};

type DeepgramUtterance = {
  start?: unknown;
  end?: unknown;
  confidence?: unknown;
  transcript?: unknown;
  words?: unknown;
  speaker?: unknown;
};

type DeepgramAlternative = {
  transcript?: unknown;
  confidence?: unknown;
  words?: unknown;
};

type DeepgramChannel = {
  detected_language?: unknown;
  alternatives?: unknown;
};

type DeepgramResponse = {
  metadata?: {
    request_id?: unknown;
    duration?: unknown;
    models?: unknown;
  };
  results?: {
    channels?: unknown;
    utterances?: unknown;
  };
};

type NormalizedSegment = NormalizedTranscription["segments"][number];

const secondsToMs = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value * 1000))
    : null;

const asFiniteNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asConfidence = (value: unknown) => {
  const confidence = asFiniteNumber(value);
  return confidence == null ? null : Math.min(Math.max(confidence, 0), 1);
};

const asSpeakerIndex = (value: unknown) => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }

  return value;
};

const compactWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const joinWordText = (words: TranscriptionWord[]) =>
  compactWhitespace(
    words
      .map((word) => word.punctuatedText ?? word.text)
      .join(" ")
      .replace(/\s+([.,!?;:])/g, "$1"),
  );

const averageConfidence = (values: Array<number | null | undefined>) => {
  const finite = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );

  if (finite.length === 0) {
    return null;
  }

  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
};

const deepgramTimeoutSeconds = () => Math.ceil(env.DEEPGRAM_REQUEST_TIMEOUT_MS / 1000);

const removeControlCharacters = (value: string) =>
  [...value]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127 ? " " : character;
    })
    .join("");

export const buildDeepgramKeyterms = (input: {
  knownParticipants: string[];
  technicalTerms: string[];
}) => {
  const keyterms: string[] = [];
  const seen = new Set<string>();

  for (const value of [...input.knownParticipants, ...input.technicalTerms]) {
    const normalized = compactWhitespace(removeControlCharacters(value));

    if (!normalized || normalized.length > 120) {
      continue;
    }

    const key = normalized.toLocaleLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    keyterms.push(normalized);
  }

  return keyterms.slice(0, 100);
};

const normalizeWord = (
  word: DeepgramWord,
  fallbackSpeaker: number | null,
): TranscriptionWord | null => {
  const text =
    typeof word.word === "string" && word.word.trim()
      ? compactWhitespace(word.word)
      : typeof word.punctuated_word === "string" && word.punctuated_word.trim()
        ? compactWhitespace(word.punctuated_word)
        : null;
  const startMs = secondsToMs(word.start);
  const endMs = secondsToMs(word.end);

  if (!text || startMs == null || endMs == null || endMs < startMs) {
    return null;
  }

  const punctuatedText =
    typeof word.punctuated_word === "string" && word.punctuated_word.trim()
      ? compactWhitespace(word.punctuated_word)
      : null;

  return {
    text,
    punctuatedText,
    startMs,
    endMs,
    confidence: asConfidence(word.confidence),
    rawSpeakerIndex: asSpeakerIndex(word.speaker) ?? fallbackSpeaker,
    speakerConfidence: asConfidence(word.speaker_confidence),
  };
};

const normalizeWords = (value: unknown, fallbackSpeaker: number | null) =>
  Array.isArray(value)
    ? value
        .map((word) => normalizeWord(word as DeepgramWord, fallbackSpeaker))
        .filter((word): word is TranscriptionWord => word !== null)
    : [];

const getDominantSpeaker = (words: TranscriptionWord[]) => {
  const counts = new Map<number, number>();

  for (const word of words) {
    if (word.rawSpeakerIndex == null) {
      continue;
    }

    counts.set(word.rawSpeakerIndex, (counts.get(word.rawSpeakerIndex) ?? 0) + 1);
  }

  return (
    [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null
  );
};

const normalizeUtterances = (utterances: unknown): NormalizedSegment[] => {
  if (!Array.isArray(utterances)) {
    return [];
  }

  return utterances
    .map((utterance, index): NormalizedSegment | null => {
      const item = utterance as DeepgramUtterance;
      const fallbackSpeaker = asSpeakerIndex(item.speaker);
      const words = normalizeWords(item.words, fallbackSpeaker);
      const startMs =
        secondsToMs(item.start) ?? words[0]?.startMs ?? (index === 0 ? 0 : null);
      const endMs =
        secondsToMs(item.end) ??
        words.at(-1)?.endMs ??
        (startMs == null ? null : startMs);
      const text =
        typeof item.transcript === "string" && item.transcript.trim()
          ? compactWhitespace(item.transcript)
          : joinWordText(words);

      if (startMs == null || endMs == null || endMs < startMs || !text) {
        return null;
      }

      return {
        segmentIndex: index,
        rawSpeakerIndex: fallbackSpeaker ?? getDominantSpeaker(words) ?? 0,
        startMs,
        endMs,
        text,
        confidence:
          asConfidence(item.confidence) ??
          averageConfidence(words.map((word) => word.confidence)),
        words,
      };
    })
    .filter((segment): segment is NormalizedSegment => segment !== null);
};

const extractChannelAlternative = (response: DeepgramResponse) => {
  const channels = response.results?.channels;
  if (!Array.isArray(channels)) {
    return null;
  }

  const firstChannel = channels[0] as DeepgramChannel | undefined;
  const alternatives = firstChannel?.alternatives;
  if (!Array.isArray(alternatives)) {
    return null;
  }

  return {
    channel: firstChannel,
    alternative: alternatives[0] as DeepgramAlternative | undefined,
  };
};

const normalizeFallbackSegments = (response: DeepgramResponse): NormalizedSegment[] => {
  const extracted = extractChannelAlternative(response);
  const alternative = extracted?.alternative;
  const words = normalizeWords(alternative?.words, null);

  if (words.length === 0) {
    const transcript =
      typeof alternative?.transcript === "string"
        ? compactWhitespace(alternative.transcript)
        : "";
    const durationMs = secondsToMs(response.metadata?.duration) ?? 0;

    return transcript
      ? ([
          {
            segmentIndex: 0,
            rawSpeakerIndex: 0,
            startMs: 0,
            endMs: durationMs,
            text: transcript,
            confidence: asConfidence(alternative?.confidence),
            words: [],
          },
        ] satisfies NormalizedSegment[])
      : [];
  }

  const groups: TranscriptionWord[][] = [];
  for (const word of words) {
    const previousGroup = groups.at(-1);
    const previousWord = previousGroup?.at(-1);
    const speakerChanged =
      previousWord &&
      word.rawSpeakerIndex !== previousWord.rawSpeakerIndex &&
      word.rawSpeakerIndex != null;
    const pauseTooLong = previousWord && word.startMs - previousWord.endMs > 1000;

    if (!previousGroup || speakerChanged || pauseTooLong) {
      groups.push([word]);
    } else {
      previousGroup.push(word);
    }
  }

  return groups
    .map(
      (group, index): NormalizedSegment => ({
        segmentIndex: index,
        rawSpeakerIndex: getDominantSpeaker(group) ?? 0,
        startMs: group[0]?.startMs ?? 0,
        endMs: group.at(-1)?.endMs ?? group[0]?.startMs ?? 0,
        text: joinWordText(group),
        confidence: averageConfidence(group.map((word) => word.confidence)),
        words: group,
      }),
    )
    .filter((segment) => segment.text.length > 0);
};

const detectLanguage = (
  response: DeepgramResponse,
  fallbackLanguage: string | null,
) => {
  const extracted = extractChannelAlternative(response);
  const detected = extracted?.channel?.detected_language;

  return typeof detected === "string" && detected.trim()
    ? detected
    : fallbackLanguage?.trim() || null;
};

const modelNameFromResponse = (response: DeepgramResponse) => {
  const models = response.metadata?.models;
  const firstModel = Array.isArray(models) ? models[0] : null;
  return typeof firstModel === "string" && firstModel.trim()
    ? firstModel
    : env.DEEPGRAM_MODEL;
};

const requestIdFromResponse = (response: DeepgramResponse) => {
  const requestId = response.metadata?.request_id;
  return typeof requestId === "string" && requestId.trim() ? requestId : null;
};

const countWords = (segments: NormalizedSegment[]) => {
  const wordMetadataCount = segments.reduce(
    (count, segment) => count + segment.words.length,
    0,
  );

  if (wordMetadataCount > 0) {
    return wordMetadataCount;
  }

  return segments.reduce(
    (count, segment) => count + segment.text.split(/\s+/).filter(Boolean).length,
    0,
  );
};

const getErrorStatus = (error: unknown) => {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const record = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  };
  const status = record.status ?? record.statusCode ?? record.response?.status;

  return typeof status === "number" && Number.isInteger(status) ? status : null;
};

const mapDeepgramError = (error: unknown) => {
  const status = getErrorStatus(error);
  const message = error instanceof Error ? error.message.toLocaleLowerCase() : "";

  if (status === 401 || status === 403) {
    return ApiError.deepgramAuthFailed();
  }

  if (status === 429) {
    return ApiError.deepgramRateLimited();
  }

  if (status && status >= 500) {
    return ApiError.deepgramRequestFailed();
  }

  if (message.includes("timeout") || message.includes("timed out")) {
    return ApiError.deepgramRequestTimeout();
  }

  return ApiError.deepgramRequestFailed();
};

const buildSpeakers = (
  segments: NormalizedTranscription["segments"],
): NormalizedTranscription["speakers"] => {
  const durations = new Map<number, number>();

  for (const segment of segments) {
    if (segment.words.length === 0) {
      if (segment.rawSpeakerIndex != null) {
        durations.set(
          segment.rawSpeakerIndex,
          (durations.get(segment.rawSpeakerIndex) ?? 0) +
            Math.max(segment.endMs - segment.startMs, 0),
        );
      }
      continue;
    }

    for (const word of segment.words) {
      const rawSpeakerIndex = word.rawSpeakerIndex ?? segment.rawSpeakerIndex;
      if (rawSpeakerIndex == null) {
        continue;
      }

      durations.set(
        rawSpeakerIndex,
        (durations.get(rawSpeakerIndex) ?? 0) + Math.max(word.endMs - word.startMs, 0),
      );
    }
  }

  const totalMs = [...durations.values()].reduce((sum, value) => sum + value, 0);

  return [...durations.entries()]
    .sort(([left], [right]) => left - right)
    .map(([rawSpeakerIndex, durationMs]) => ({
      rawSpeakerIndex,
      displayName: `Speaker ${rawSpeakerIndex + 1}`,
      totalSpeakingSeconds: Number((durationMs / 1000).toFixed(3)),
      speakingPercentage:
        totalMs > 0 ? Number(((durationMs / totalMs) * 100).toFixed(2)) : 0,
    }));
};

export function normalizeDeepgramResponse(
  response: unknown,
  fallbackLanguage: string | null,
): NormalizedTranscription {
  const deepgramResponse = response as DeepgramResponse;

  if (!deepgramResponse.results) {
    throw ApiError.deepgramInvalidResponse(
      "Deepgram did not return synchronous transcription results.",
    );
  }

  const utteranceSegments = normalizeUtterances(deepgramResponse.results.utterances);
  const segments =
    utteranceSegments.length > 0
      ? utteranceSegments
      : normalizeFallbackSegments(deepgramResponse);

  if (segments.length === 0) {
    throw ApiError.noSpeechDetected();
  }

  return {
    providerRequestId: requestIdFromResponse(deepgramResponse),
    language: detectLanguage(deepgramResponse, fallbackLanguage),
    durationSeconds: asFiniteNumber(deepgramResponse.metadata?.duration),
    modelName: modelNameFromResponse(deepgramResponse),
    diarizeModel: env.DEEPGRAM_DIARIZE_MODEL,
    confidence: averageConfidence(segments.map((segment) => segment.confidence)),
    wordCount: countWords(segments),
    speakers: buildSpeakers(segments),
    segments: segments.map(
      (segment, index): NormalizedSegment => ({
        ...segment,
        segmentIndex: index,
      }),
    ),
  };
}

export class DeepgramTranscriptionService implements TranscriptionService {
  private client: DeepgramMediaClient | null = null;

  constructor(
    private readonly createClient: () => DeepgramMediaClient = () =>
      new DeepgramClient({
        apiKey: env.DEEPGRAM_API_KEY,
        timeoutInSeconds: deepgramTimeoutSeconds(),
        maxRetries: env.DEEPGRAM_MAX_RETRIES,
      }) as DeepgramMediaClient,
  ) {}

  isConfigured() {
    return Boolean(env.DEEPGRAM_API_KEY);
  }

  async transcribeRecording(
    input: TranscribeRecordingInput,
  ): Promise<NormalizedTranscription> {
    if (!this.isConfigured()) {
      throw ApiError.deepgramNotConfigured();
    }

    const client = this.getClient();
    const language = input.language?.trim() || env.DEEPGRAM_DEFAULT_LANGUAGE;
    const keyterms = buildDeepgramKeyterms(input);

    try {
      const response = await client.listen.v1.media.transcribeUrl(
        {
          url: input.audioUrl,
          model: env.DEEPGRAM_MODEL,
          diarize_model: env.DEEPGRAM_DIARIZE_MODEL,
          punctuate: true,
          smart_format: true,
          utterances: true,
          paragraphs: false,
          language,
          ...(keyterms.length > 0 ? { keyterm: keyterms.slice(0, 100) } : {}),
        },
        {
          timeoutInSeconds: deepgramTimeoutSeconds(),
          maxRetries: env.DEEPGRAM_MAX_RETRIES,
        },
      );

      return normalizeDeepgramResponse(response, language);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      throw mapDeepgramError(error);
    }
  }

  private getClient() {
    this.client ??= this.createClient();
    return this.client;
  }
}
