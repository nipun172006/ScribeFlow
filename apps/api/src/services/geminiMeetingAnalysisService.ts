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
        responseSchema: Schema;
        temperature: number;
        httpOptions: {
          timeout: number;
        };
      };
    }) => Promise<GeminiGenerateContentResponse>;
  };
};

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

function buildPrompt(input: GeminiMeetingAnalysisInput) {
  return [
    "You are ScribeFlow's backend meeting-analysis engine.",
    "Use only the supplied transcript. Do not use outside facts.",
    "Do not invent owners. If no owner is explicit, set ownerName to null.",
    "Do not invent deadlines. If no deadline is explicit, set deadlineText to null.",
    "Keep unresolved questions in openQuestions.",
    "Attach only real evidenceSegmentIds from the supplied transcript segment IDs.",
    "Return only schema-conforming JSON.",
    "",
    JSON.stringify({
      meetingTitle: input.meetingTitle,
      knownParticipants: input.knownParticipants,
      speakers: input.speakers,
      transcriptSegments: input.transcriptSegments,
    }),
  ].join("\n");
}

function parseGeminiJson(text: string | undefined) {
  if (!text?.trim()) {
    throw ApiError.geminiInvalidResponse("Gemini returned an empty response.");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw ApiError.geminiInvalidResponse(
      "Gemini returned meeting-analysis output that was not valid JSON.",
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
    const allowedSegmentIds = input.transcriptSegments.map((segment) => segment.id);
    const client = this.getClient();

    try {
      const response = await client.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: buildPrompt(input),
        config: {
          responseMimeType: "application/json",
          responseSchema: geminiMeetingAnalysisResponseSchema,
          temperature: 0.1,
          httpOptions: {
            timeout: env.GEMINI_REQUEST_TIMEOUT_MS,
          },
        },
      });
      const analysis = parseAndValidateGeminiAnalysis(response.text, allowedSegmentIds);

      return {
        analysis,
        provider: "gemini",
        modelName: env.GEMINI_MODEL,
        responseId: response.responseId ?? null,
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
