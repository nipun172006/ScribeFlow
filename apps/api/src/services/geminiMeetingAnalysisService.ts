import { GoogleGenAI, Type, type Schema } from "@google/genai";
import {
  structuredMeetingAnalysisSchema,
  type Meeting,
  type MeetingDetail,
  type MeetingSpeaker,
  type StructuredMeetingAnalysis,
  type TranscriptSegment,
} from "@scribeflow/shared";
import { env, providerConfig } from "../config/env.js";
import { logger } from "../config/logger.js";
import { ApiError } from "../errors/apiError.js";
import type { MeetingAnalysisResult, MeetingAnalysisService } from "./interfaces.js";

export type MeetingAnalysisTranscriptSegment = {
  id: string;
  speakerName: string;
  startMs: number;
  endMs: number;
  text: string;
};

export type GeminiMeetingAnalysisInput = {
  meetingTitle: string;
  knownParticipants: string[];
  speakers: Array<{
    id: string;
    rawSpeakerIndex: number;
    displayName: string;
  }>;
  transcriptSegments: MeetingAnalysisTranscriptSegment[];
};

type GeminiGenerateContentResponse = {
  text?: string;
  responseId?: string;
  modelVersion?: string;
};

type GeminiAnalysisClient = {
  models: {
    generateContent: (request: {
      model: string;
      contents: string;
      config: {
        responseMimeType: "application/json";
        responseSchema?: Schema;
        temperature: number;
        httpOptions: {
          timeout: number;
        };
      };
    }) => Promise<GeminiGenerateContentResponse>;
  };
};

type PreparedGeminiPrompt = {
  contents: string;
  allowedSegmentIds: string[];
  transcriptCharCount: number;
  includedSegmentCount: number;
  totalSegmentCount: number;
  truncated: boolean;
};

const maxPromptTranscriptChars = 160_000;
const maxModelOutputPreviewChars = 3_000;
const maxRepairOutputChars = 120_000;
const longMeetingSegmentThreshold = 200;
const longMeetingAnalysisTimeoutMs = 120_000;

const evidenceSegmentIdsSchema: Schema = {
  type: Type.ARRAY,
  items: { type: Type.STRING },
};

const textEvidenceItemSchema: Schema = {
  type: Type.OBJECT,
  required: ["text", "evidenceSegmentIds"],
  propertyOrdering: ["text", "evidenceSegmentIds"],
  properties: {
    text: { type: Type.STRING },
    evidenceSegmentIds: evidenceSegmentIdsSchema,
  },
};

const structuredActionItemResponseSchema: Schema = {
  type: Type.OBJECT,
  required: ["task", "ownerName", "deadlineText", "confidence", "evidenceSegmentIds"],
  propertyOrdering: [
    "task",
    "ownerName",
    "deadlineText",
    "confidence",
    "evidenceSegmentIds",
  ],
  properties: {
    task: { type: Type.STRING },
    ownerName: {
      type: Type.STRING,
      nullable: true,
      description:
        "Explicit owner name only. Use null when the transcript does not name an owner.",
    },
    deadlineText: {
      type: Type.STRING,
      nullable: true,
      description:
        "Explicit deadline text only. Use null when the transcript does not mention a deadline.",
    },
    confidence: { type: Type.NUMBER, minimum: 0, maximum: 1 },
    evidenceSegmentIds: evidenceSegmentIdsSchema,
  },
};

export const geminiMeetingAnalysisResponseSchema: Schema = {
  type: Type.OBJECT,
  required: [
    "attendees",
    "executiveOverview",
    "keyDecisions",
    "discussionPoints",
    "openQuestions",
    "nextSteps",
    "topics",
    "actionItems",
  ],
  propertyOrdering: [
    "attendees",
    "executiveOverview",
    "keyDecisions",
    "discussionPoints",
    "openQuestions",
    "nextSteps",
    "topics",
    "actionItems",
  ],
  properties: {
    attendees: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    executiveOverview: { type: Type.STRING },
    keyDecisions: {
      type: Type.ARRAY,
      items: textEvidenceItemSchema,
    },
    discussionPoints: {
      type: Type.ARRAY,
      items: textEvidenceItemSchema,
    },
    openQuestions: {
      type: Type.ARRAY,
      items: textEvidenceItemSchema,
    },
    nextSteps: {
      type: Type.ARRAY,
      items: textEvidenceItemSchema,
    },
    topics: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    actionItems: {
      type: Type.ARRAY,
      items: structuredActionItemResponseSchema,
    },
  },
};

const compactWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const findSpeakerName = (
  segment: TranscriptSegment,
  speakersById: Map<string, MeetingSpeaker>,
  speakersByRawIndex: Map<number, MeetingSpeaker>,
) => {
  if (segment.speakerId) {
    const speaker = speakersById.get(segment.speakerId);
    if (speaker) {
      return speaker.displayName;
    }
  }

  if (segment.rawSpeakerIndex != null) {
    return (
      speakersByRawIndex.get(segment.rawSpeakerIndex)?.displayName ??
      `Speaker ${segment.rawSpeakerIndex + 1}`
    );
  }

  return "Unknown speaker";
};

export function buildGeminiAnalysisInput(input: {
  meeting: Meeting;
  speakers: MeetingSpeaker[];
  segments: TranscriptSegment[];
}): GeminiMeetingAnalysisInput {
  const speakersById = new Map(input.speakers.map((speaker) => [speaker.id, speaker]));
  const speakersByRawIndex = new Map(
    input.speakers.map((speaker) => [speaker.rawSpeakerIndex, speaker]),
  );

  const transcriptSegments = [...input.segments]
    .sort((left, right) => {
      const leftIndex = left.segmentIndex ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = right.segmentIndex ?? Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex || left.startMs - right.startMs;
    })
    .map((segment) => ({
      id: segment.id,
      speakerName: findSpeakerName(segment, speakersById, speakersByRawIndex),
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: compactWhitespace(segment.text),
    }))
    .filter((segment) => segment.text.length > 0);

  return {
    meetingTitle: input.meeting.title,
    knownParticipants: input.meeting.knownParticipants,
    speakers: input.speakers
      .map((speaker) => ({
        id: speaker.id,
        rawSpeakerIndex: speaker.rawSpeakerIndex,
        displayName: speaker.displayName,
      }))
      .sort((left, right) => left.rawSpeakerIndex - right.rawSpeakerIndex),
    transcriptSegments,
  };
}

export function buildGeminiAnalysisInputFromDetail(
  detail: MeetingDetail,
): GeminiMeetingAnalysisInput {
  return buildGeminiAnalysisInput({
    meeting: detail.meeting,
    speakers: detail.speakers,
    segments: detail.transcriptSegments,
  });
}

const previewModelOutput = (text: string | undefined) =>
  text ? text.slice(0, maxModelOutputPreviewChars) : "";

const truncateForRepair = (text: string | undefined) => {
  if (!text) {
    return "";
  }

  if (text.length <= maxRepairOutputChars) {
    return text;
  }

  return `${text.slice(0, maxRepairOutputChars)}\n\n[Output truncated before repair because it exceeded ${maxRepairOutputChars} characters.]`;
};

const summarizeValidationIssues = (
  issues: Array<{ path: Array<PropertyKey>; message: string }>,
) =>
  issues.slice(0, 10).map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
    message: issue.message,
  }));

const describeApiError = (error: ApiError) => ({
  code: error.code,
  message: error.message,
  ...(error.details ? { details: error.details } : {}),
});

const isRepairableGeminiOutputError = (error: unknown): error is ApiError =>
  error instanceof ApiError &&
  (error.code === "GEMINI_INVALID_RESPONSE" ||
    error.code === "MEETING_ANALYSIS_OUTPUT_INVALID");

const getAnalysisTimeoutMs = (prompt: PreparedGeminiPrompt) =>
  prompt.totalSegmentCount >= longMeetingSegmentThreshold
    ? Math.max(env.GEMINI_REQUEST_TIMEOUT_MS, longMeetingAnalysisTimeoutMs)
    : env.GEMINI_REQUEST_TIMEOUT_MS;

const isLongMeetingPrompt = (prompt: PreparedGeminiPrompt) =>
  prompt.totalSegmentCount >= longMeetingSegmentThreshold;

export function prepareGeminiAnalysisPrompt(
  input: GeminiMeetingAnalysisInput,
): PreparedGeminiPrompt {
  const transcriptSegments: Array<{
    id: string;
    speaker: string;
    startMs: number;
    text: string;
  }> = [];
  let transcriptCharCount = 0;
  let truncated = false;

  for (const segment of input.transcriptSegments) {
    const text = compactWhitespace(segment.text);
    if (!text) {
      continue;
    }

    const estimatedChars = segment.id.length + segment.speakerName.length + text.length;
    if (
      transcriptSegments.length > 0 &&
      transcriptCharCount + estimatedChars > maxPromptTranscriptChars
    ) {
      truncated = true;
      break;
    }

    const remainingChars = maxPromptTranscriptChars - transcriptCharCount;
    const includedText =
      estimatedChars > remainingChars
        ? text.slice(0, Math.max(0, remainingChars))
        : text;

    if (includedText.length === 0) {
      truncated = true;
      break;
    }

    transcriptSegments.push({
      id: segment.id,
      speaker: segment.speakerName,
      startMs: segment.startMs,
      text: includedText,
    });
    transcriptCharCount +=
      segment.id.length + segment.speakerName.length + includedText.length;

    if (includedText.length < text.length) {
      truncated = true;
      break;
    }
  }

  const contents = [
    "You are ScribeFlow's backend meeting-analysis engine.",
    "Use only the supplied transcript. Do not use outside facts.",
    "Do not invent owners. If no owner is explicit, set ownerName to null.",
    "Do not invent deadlines. If no deadline is explicit, set deadlineText to null.",
    "Keep unresolved questions in openQuestions.",
    "Attach only real evidenceSegmentIds from the supplied transcript segment IDs.",
    "Return only schema-conforming JSON.",
    "The transcript payload is compact: each segment has id, speaker, startMs and text.",
    "If transcriptWasTruncated is true, analyse only the included transcript segments and do not infer from omitted content.",
    "",
    JSON.stringify({
      meetingTitle: input.meetingTitle,
      knownParticipants: input.knownParticipants,
      speakers: input.speakers,
      transcriptWasTruncated: truncated,
      transcriptSegmentCount: input.transcriptSegments.length,
      includedTranscriptSegmentCount: transcriptSegments.length,
      transcriptSegments,
    }),
  ].join("\n");

  return {
    contents,
    allowedSegmentIds: transcriptSegments.map((segment) => segment.id),
    transcriptCharCount,
    includedSegmentCount: transcriptSegments.length,
    totalSegmentCount: input.transcriptSegments.length,
    truncated,
  };
}

function buildRepairPrompt(input: {
  invalidOutput: string | undefined;
  validationError: ApiError;
  allowedSegmentIds: string[];
}) {
  return [
    "You are repairing a Gemini meeting-analysis JSON response for ScribeFlow.",
    "Return only valid JSON that conforms to the required schema.",
    "Preserve the model's meeting-analysis content where it is usable.",
    "Do not invent new facts, owners, deadlines or transcript evidence.",
    "Evidence IDs must be strings from allowedEvidenceSegmentIds only.",
    "Use null for missing ownerName or deadlineText.",
    "Use empty arrays when a section has no supported items.",
    "",
    JSON.stringify({
      validationFailure: describeApiError(input.validationError),
      allowedEvidenceSegmentIds: input.allowedSegmentIds,
      invalidOutput: truncateForRepair(input.invalidOutput),
    }),
  ].join("\n");
}

function parseGeminiJson(text: string | undefined) {
  if (!text?.trim()) {
    throw ApiError.geminiInvalidResponse("Gemini returned an empty response.", {
      reason: "empty_response",
    });
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw ApiError.geminiInvalidResponse(
      "Gemini returned meeting-analysis output that was not valid JSON.",
      {
        reason: "json_parse_failed",
        parseError: error instanceof Error ? error.message : "Unknown parse error.",
      },
    );
  }
}

export function validateAnalysisEvidenceIds(
  analysis: StructuredMeetingAnalysis,
  allowedSegmentIds: Iterable<string>,
) {
  const allowed = new Set(allowedSegmentIds);
  const seenUnknown = new Set<string>();

  const checkIds = (evidenceSegmentIds: string[]) => {
    for (const segmentId of evidenceSegmentIds) {
      if (!allowed.has(segmentId)) {
        seenUnknown.add(segmentId);
      }
    }
  };

  for (const item of analysis.keyDecisions) {
    checkIds(item.evidenceSegmentIds);
  }
  for (const item of analysis.discussionPoints) {
    checkIds(item.evidenceSegmentIds);
  }
  for (const item of analysis.openQuestions) {
    checkIds(item.evidenceSegmentIds);
  }
  for (const item of analysis.nextSteps) {
    checkIds(item.evidenceSegmentIds);
  }
  for (const item of analysis.actionItems) {
    checkIds(item.evidenceSegmentIds);
  }

  if (seenUnknown.size > 0) {
    throw ApiError.meetingAnalysisOutputInvalid(
      `Gemini referenced unknown transcript segment IDs: ${[...seenUnknown].join(", ")}`,
      {
        unknownSegmentIds: [...seenUnknown],
      },
    );
  }
}

export function parseAndValidateGeminiAnalysis(
  text: string | undefined,
  allowedSegmentIds: Iterable<string>,
) {
  const parsed = parseGeminiJson(text);
  const analysis = structuredMeetingAnalysisSchema.safeParse(parsed);

  if (!analysis.success) {
    throw ApiError.meetingAnalysisOutputInvalid(
      "Gemini returned meeting-analysis output that did not match the required schema.",
      {
        issues: summarizeValidationIssues(analysis.error.issues),
      },
    );
  }

  validateAnalysisEvidenceIds(analysis.data, allowedSegmentIds);
  return analysis.data;
}

function mapGeminiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
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
    return ApiError.geminiAuthFailed();
  }

  if (status === 429 || code === 429) {
    return ApiError.geminiRateLimited();
  }

  if (
    name === "AbortError" ||
    name === "TimeoutError" ||
    message.toLocaleLowerCase().includes("timeout")
  ) {
    return ApiError.geminiRequestTimeout();
  }

  return ApiError.geminiRequestFailed();
}

async function generateGeminiContent(input: {
  client: GeminiAnalysisClient;
  contents: string;
  temperature: number;
  timeoutMs: number;
  useResponseSchema: boolean;
}) {
  return input.client.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: input.contents,
    config: {
      responseMimeType: "application/json",
      ...(input.useResponseSchema
        ? { responseSchema: geminiMeetingAnalysisResponseSchema }
        : {}),
      temperature: input.temperature,
      httpOptions: {
        timeout: input.timeoutMs,
      },
    },
  });
}

async function generateGeminiContentWithLongMeetingFallback(input: {
  client: GeminiAnalysisClient;
  prompt: PreparedGeminiPrompt;
  contents: string;
  temperature: number;
  timeoutMs: number;
  purpose: "analysis" | "repair";
}) {
  try {
    return await generateGeminiContent({
      client: input.client,
      contents: input.contents,
      temperature: input.temperature,
      timeoutMs: input.timeoutMs,
      useResponseSchema: true,
    });
  } catch (error) {
    const mapped = mapGeminiError(error);
    if (mapped.code !== "GEMINI_REQUEST_FAILED" || !isLongMeetingPrompt(input.prompt)) {
      throw mapped;
    }

    logger.warn(
      {
        errorCode: mapped.code,
        purpose: input.purpose,
        totalSegmentCount: input.prompt.totalSegmentCount,
        includedSegmentCount: input.prompt.includedSegmentCount,
      },
      "gemini schema-constrained request failed for a long meeting; retrying JSON mode without response schema",
    );

    try {
      return await generateGeminiContent({
        client: input.client,
        contents: input.contents,
        temperature: input.temperature,
        timeoutMs: input.timeoutMs,
        useResponseSchema: false,
      });
    } catch (retryError) {
      throw mapGeminiError(retryError);
    }
  }
}

export class GeminiMeetingAnalysisService implements MeetingAnalysisService {
  private client: GeminiAnalysisClient | null = null;

  constructor(
    private readonly createClient: () => GeminiAnalysisClient = () =>
      new GoogleGenAI({
        apiKey: env.GEMINI_API_KEY ?? "",
      }) as unknown as GeminiAnalysisClient,
  ) {}

  isConfigured() {
    return providerConfig.geminiConfigured;
  }

  async analyseMeeting(input: {
    meeting: Meeting;
    speakers: MeetingSpeaker[];
    segments: TranscriptSegment[];
  }): Promise<MeetingAnalysisResult> {
    return this.analyseTranscript(buildGeminiAnalysisInput(input));
  }

  async analyseTranscript(
    input: GeminiMeetingAnalysisInput,
  ): Promise<MeetingAnalysisResult> {
    if (!this.isConfigured()) {
      throw ApiError.geminiNotConfigured();
    }

    if (input.transcriptSegments.length === 0) {
      throw ApiError.badRequest("Meeting analysis requires transcript segments.");
    }

    const startedAt = Date.now();
    const prompt = prepareGeminiAnalysisPrompt(input);
    if (prompt.allowedSegmentIds.length === 0) {
      throw ApiError.badRequest("Meeting analysis requires non-empty transcript text.");
    }

    if (prompt.truncated) {
      logger.warn(
        {
          totalSegmentCount: prompt.totalSegmentCount,
          includedSegmentCount: prompt.includedSegmentCount,
          transcriptCharCount: prompt.transcriptCharCount,
        },
        "gemini analysis prompt compacted a long transcript",
      );
    }

    const client = this.getClient();
    const timeoutMs = getAnalysisTimeoutMs(prompt);

    try {
      const response = await generateGeminiContentWithLongMeetingFallback({
        client,
        prompt,
        contents: prompt.contents,
        temperature: 0.1,
        timeoutMs,
        purpose: "analysis",
      });
      let analysis: StructuredMeetingAnalysis;
      let responseId = response.responseId ?? null;

      try {
        analysis = parseAndValidateGeminiAnalysis(
          response.text,
          prompt.allowedSegmentIds,
        );
      } catch (error) {
        if (!isRepairableGeminiOutputError(error)) {
          throw error;
        }

        logger.warn(
          {
            errorCode: error.code,
            errorMessage: error.message,
            outputCharCount: response.text?.length ?? 0,
            modelOutputPreview: previewModelOutput(response.text),
          },
          "gemini analysis output failed validation; attempting schema repair",
        );

        const repairContents = buildRepairPrompt({
          invalidOutput: response.text,
          validationError: error,
          allowedSegmentIds: prompt.allowedSegmentIds,
        });
        const repairResponse = await generateGeminiContentWithLongMeetingFallback({
          client,
          prompt,
          contents: repairContents,
          temperature: 0,
          timeoutMs,
          purpose: "repair",
        });

        try {
          analysis = parseAndValidateGeminiAnalysis(
            repairResponse.text,
            prompt.allowedSegmentIds,
          );
          responseId = repairResponse.responseId ?? responseId;
        } catch (repairError) {
          if (repairError instanceof ApiError) {
            logger.warn(
              {
                initialFailure: describeApiError(error),
                repairFailure: describeApiError(repairError),
                repairOutputCharCount: repairResponse.text?.length ?? 0,
                modelOutputPreview: previewModelOutput(repairResponse.text),
              },
              "gemini analysis repair output failed validation",
            );

            throw ApiError.meetingAnalysisOutputInvalid(
              "Gemini analysis output remained invalid after schema repair retry.",
              {
                repairAttempted: true,
                initialFailure: describeApiError(error),
                repairFailure: describeApiError(repairError),
              },
            );
          }

          throw repairError;
        }
      }

      return {
        analysis,
        provider: "gemini",
        modelName: env.GEMINI_MODEL,
        responseId,
        processingTimeMs: Date.now() - startedAt,
      };
    } catch (error) {
      throw mapGeminiError(error);
    }
  }

  private getClient() {
    this.client ??= this.createClient();
    return this.client;
  }
}
