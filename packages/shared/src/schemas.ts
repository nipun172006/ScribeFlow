import { z } from "zod";

export const isoDateStringSchema = z
  .string()
  .datetime()
  .describe("ISO 8601 date-time string used at the transport boundary.");

export const uuidSchema = z.string().uuid();

export const meetingSourceTypeSchema = z.enum(["upload", "live"]);

export const meetingStatusSchema = z.enum([
  "created",
  "uploading",
  "transcribing",
  "transcribed",
  "analysing",
  "indexing",
  "completed",
  "failed",
]);

export const meetingSchema = z.object({
  id: uuidSchema,
  title: z.string().min(1),
  sourceType: meetingSourceTypeSchema,
  status: meetingStatusSchema,
  originalFileName: z.string().min(1).nullable(),
  storageBucket: z.string().min(1).nullable(),
  storagePath: z.string().min(1).nullable(),
  mimeType: z.string().min(1).nullable(),
  expectedFileSizeBytes: z.number().int().positive().nullable(),
  fileSizeBytes: z.number().int().positive().nullable(),
  durationSeconds: z.number().nonnegative().nullable(),
  language: z.string().min(2).nullable(),
  recordedAt: isoDateStringSchema.nullable(),
  processingStartedAt: isoDateStringSchema.nullable(),
  uploadCompletedAt: isoDateStringSchema.nullable(),
  createdAt: isoDateStringSchema,
  updatedAt: isoDateStringSchema,
  completedAt: isoDateStringSchema.nullable(),
  processingTimeMs: z.number().int().nonnegative().nullable(),
  knownParticipants: z.array(z.string()),
  technicalTerms: z.array(z.string()),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  metadata: z.record(z.unknown()),
});

export const meetingSpeakerSchema = z.object({
  id: uuidSchema,
  meetingId: uuidSchema,
  rawSpeakerIndex: z.number().int().nonnegative(),
  displayName: z.string().min(1),
  totalSpeakingSeconds: z.number().nonnegative(),
  speakingPercentage: z.number().min(0).max(100),
  createdAt: isoDateStringSchema.optional(),
  updatedAt: isoDateStringSchema.optional(),
});

export const transcriptWordSchema = z.object({
  text: z.string().min(1),
  punctuatedText: z.string().min(1).nullable().optional(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1).nullable(),
  rawSpeakerIndex: z.number().int().nonnegative().nullable().optional(),
  speakerConfidence: z.number().min(0).max(1).nullable().optional(),
});

export const transcriptSegmentSchema = z.object({
  id: uuidSchema,
  meetingId: uuidSchema,
  speakerId: uuidSchema.nullable(),
  rawSpeakerIndex: z.number().int().nonnegative().nullable(),
  segmentIndex: z.number().int().nonnegative().optional(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  text: z.string(),
  confidence: z.number().min(0).max(1).nullable(),
  words: z.array(transcriptWordSchema).optional(),
});

export const normalizedTranscriptSegmentSchema = z.object({
  segmentIndex: z.number().int().nonnegative(),
  rawSpeakerIndex: z.number().int().nonnegative().nullable(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  text: z.string().min(1),
  confidence: z.number().min(0).max(1).nullable(),
  words: z.array(transcriptWordSchema),
});

export const normalizedSpeakerSchema = z.object({
  rawSpeakerIndex: z.number().int().nonnegative(),
  displayName: z.string().min(1),
  totalSpeakingSeconds: z.number().nonnegative(),
  speakingPercentage: z.number().min(0).max(100),
});

export const normalizedTranscriptionSchema = z.object({
  providerRequestId: z.string().min(1).nullable(),
  language: z.string().min(1).nullable(),
  durationSeconds: z.number().nonnegative().nullable(),
  modelName: z.string().min(1).nullable(),
  diarizeModel: z.string().min(1),
  confidence: z.number().min(0).max(1).nullable(),
  wordCount: z.number().int().nonnegative(),
  speakers: z.array(normalizedSpeakerSchema),
  segments: z.array(normalizedTranscriptSegmentSchema),
});

export const actionItemStatusSchema = z.enum(["open", "completed"]);

export const actionItemSchema = z.object({
  id: uuidSchema,
  meetingId: uuidSchema,
  task: z.string().min(1),
  ownerName: z.string().nullable(),
  ownerSpeakerId: uuidSchema.nullable(),
  deadline: isoDateStringSchema.nullable(),
  deadlineText: z.string().nullable(),
  status: actionItemStatusSchema,
  confidence: z.number().min(0).max(1).nullable(),
  sourceSegmentId: uuidSchema.nullable().optional(),
  sourceStartMs: z.number().int().nonnegative().nullable(),
  sourceEndMs: z.number().int().nonnegative().nullable(),
  evidenceText: z.string().nullable(),
  evidenceSegmentIds: z.array(uuidSchema).optional(),
  completedAt: isoDateStringSchema.nullable().optional(),
  createdAt: isoDateStringSchema.optional(),
  updatedAt: isoDateStringSchema.optional(),
});

export const meetingSummarySchema = z.object({
  attendees: z.array(z.string()),
  executiveOverview: z.string().nullable(),
  keyDecisions: z.array(z.string()),
  discussionPoints: z.array(z.string()),
  openQuestions: z.array(z.string()),
  nextSteps: z.array(z.string()),
  topics: z.array(z.string()),
});

const structuredAnalysisTextItemSchema = z
  .object({
    text: z.string().trim().min(1),
    evidenceSegmentIds: z.array(uuidSchema),
  })
  .strict();

export const structuredAnalysisActionItemSchema = z
  .object({
    task: z.string().trim().min(1),
    ownerName: z.string().trim().min(1).nullable(),
    deadlineText: z.string().trim().min(1).nullable(),
    confidence: z.number().min(0).max(1),
    evidenceSegmentIds: z.array(uuidSchema),
  })
  .strict();

export const structuredMeetingAnalysisSchema = z
  .object({
    attendees: z.array(z.string().trim().min(1)),
    executiveOverview: z.string().trim(),
    keyDecisions: z.array(structuredAnalysisTextItemSchema),
    discussionPoints: z.array(structuredAnalysisTextItemSchema),
    openQuestions: z.array(structuredAnalysisTextItemSchema),
    nextSteps: z.array(structuredAnalysisTextItemSchema),
    topics: z.array(z.string().trim().min(1)),
    actionItems: z.array(structuredAnalysisActionItemSchema),
  })
  .strict();

export const searchResultSchema = z.object({
  meetingId: uuidSchema,
  meetingTitle: z.string().min(1),
  meetingDate: isoDateStringSchema.nullable(),
  content: z.string(),
  score: z.number().min(0),
  startMs: z.number().int().nonnegative().nullable(),
  endMs: z.number().int().nonnegative().nullable(),
  speakerNames: z.array(z.string()),
  metadata: z.record(z.unknown()),
});

export const speakingBreakdownSchema = z.object({
  speakerId: z.string().min(1),
  displayName: z.string().min(1),
  totalSpeakingSeconds: z.number().nonnegative(),
  speakingPercentage: z.number().min(0).max(100),
});

export const topicAnalyticsSchema = z.object({
  topic: z.string().min(1),
  count: z.number().int().nonnegative(),
});

export const meetingAnalyticsSchema = z.object({
  durationSeconds: z.number().nonnegative(),
  participantCount: z.number().int().nonnegative(),
  speakingBreakdown: z.array(speakingBreakdownSchema),
  actionItemCount: z.number().int().nonnegative(),
  completedActionItemCount: z.number().int().nonnegative(),
  completionRate: z.number().min(0).max(100),
  topics: z.array(topicAnalyticsSchema),
});

export const meetingTopicSchema = z.object({
  id: uuidSchema,
  meetingId: uuidSchema,
  normalizedLabel: z.string().min(1),
  displayLabel: z.string().min(1),
  confidence: z.number().min(0).max(1).nullable(),
  mentionCount: z.number().int().positive(),
  createdAt: isoDateStringSchema.optional(),
  updatedAt: isoDateStringSchema.optional(),
});

export const uploadMeetingInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  fileSizeBytes: z.number().int().positive(),
  recordedAt: isoDateStringSchema.optional(),
  language: z.string().trim().min(1).max(24).optional(),
  knownParticipants: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  technicalTerms: z.array(z.string().trim().min(1).max(120)).max(60).default([]),
});

export const startLiveMeetingInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  recordedAt: isoDateStringSchema.optional(),
  language: z.string().trim().min(2).max(24).optional(),
  knownParticipants: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  technicalTerms: z.array(z.string().trim().min(1).max(120)).max(60).default([]),
});

export const renameSpeakerInputSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
});

export const updateActionItemInputSchema = z.object({
  status: actionItemStatusSchema,
});

export const searchInputSchema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(25).default(10),
});

export const uploadInstructionsSchema = z.object({
  protocol: z.literal("tus"),
  endpoint: z.string().url(),
  bucket: z.string().min(1),
  objectPath: z.string().min(1),
  token: z.string().min(1),
  chunkSizeBytes: z.number().int().positive(),
  expiresInSeconds: z.number().int().positive(),
});

export const uploadMeetingResponseSchema = z.object({
  meeting: meetingSchema,
  upload: uploadInstructionsSchema,
});

export const uploadCompletionResponseSchema = z.object({
  meeting: meetingSchema,
});

export const meetingListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: meetingStatusSchema.optional(),
  sourceType: meetingSourceTypeSchema.optional(),
  query: z.string().trim().max(160).optional(),
  sort: z.enum(["createdAt", "recordedAt", "title"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export const paginationSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const paginatedMeetingListSchema = z.object({
  items: z.array(meetingSchema),
  pagination: paginationSchema,
});

export const meetingDetailSchema = z.object({
  meeting: meetingSchema,
  speakers: z.array(meetingSpeakerSchema),
  transcriptSegments: z.array(transcriptSegmentSchema),
  summary: meetingSummarySchema.nullable(),
  actionItems: z.array(actionItemSchema),
  topics: z.array(meetingTopicSchema),
  chunkCount: z.number().int().nonnegative(),
});

export const transcriptionSummarySchema = z.object({
  provider: z.literal("deepgram"),
  requestId: z.string().min(1).nullable(),
  modelName: z.string().min(1).nullable(),
  diarizeModel: z.string().min(1).nullable(),
  language: z.string().min(1).nullable(),
  durationSeconds: z.number().nonnegative().nullable(),
  speakerCount: z.number().int().nonnegative(),
  segmentCount: z.number().int().nonnegative(),
  wordCount: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1).nullable(),
  processingTimeMs: z.number().int().nonnegative().nullable(),
});

export const transcribeMeetingResponseSchema = z.object({
  meeting: meetingSchema,
  speakers: z.array(meetingSpeakerSchema),
  transcriptSegments: z.array(transcriptSegmentSchema),
  transcription: transcriptionSummarySchema,
  alreadyTranscribed: z.boolean(),
});

export const analyzeMeetingResponseSchema = z.object({
  meeting: meetingSchema,
  summary: meetingSummarySchema,
  topics: z.array(meetingTopicSchema),
  actionItems: z.array(actionItemSchema),
  analysis: structuredMeetingAnalysisSchema,
  provider: z.literal("gemini"),
  modelName: z.string().min(1),
  responseId: z.string().min(1).nullable(),
  processingTimeMs: z.number().int().nonnegative().nullable(),
  alreadyAnalysed: z.boolean(),
});

export const uploadFailureInputSchema = z.object({
  errorCode: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[A-Z0-9_]+$/),
  message: z.string().trim().min(1).max(240),
});

export const apiErrorCodeSchema = z.enum([
  "BAD_REQUEST",
  "FEATURE_NOT_IMPLEMENTED",
  "SUPABASE_NOT_CONFIGURED",
  "DEEPGRAM_NOT_CONFIGURED",
  "INVALID_UUID",
  "UNSUPPORTED_FILE_EXTENSION",
  "UNSUPPORTED_MIME_TYPE",
  "FILE_TOO_LARGE",
  "MEETING_NOT_FOUND",
  "SPEAKER_NOT_FOUND",
  "ACTION_ITEM_NOT_FOUND",
  "INVALID_MEETING_STATE",
  "UPLOAD_NOT_COMPLETE",
  "TRANSCRIPTION_ALREADY_RUNNING",
  "AUDIO_STORAGE_MISSING",
  "SIGNED_AUDIO_URL_FAILED",
  "DEEPGRAM_AUTH_FAILED",
  "DEEPGRAM_RATE_LIMITED",
  "DEEPGRAM_REQUEST_TIMEOUT",
  "DEEPGRAM_REQUEST_FAILED",
  "DEEPGRAM_INVALID_RESPONSE",
  "GEMINI_NOT_CONFIGURED",
  "GEMINI_AUTH_FAILED",
  "GEMINI_RATE_LIMITED",
  "GEMINI_REQUEST_TIMEOUT",
  "GEMINI_REQUEST_FAILED",
  "GEMINI_INVALID_RESPONSE",
  "MEETING_ANALYSIS_OUTPUT_INVALID",
  "ANALYSIS_PERSISTENCE_FAILED",
  "NO_SPEECH_DETECTED",
  "TRANSCRIPT_PERSISTENCE_FAILED",
  "TRANSCRIPTION_PROVIDER_FAILED",
  "TRANSCRIPTION_OUTPUT_INVALID",
  "UPLOAD_SIGNING_FAILED",
  "STORAGE_OBJECT_MISSING",
  "STORAGE_METADATA_MISMATCH",
  "DATABASE_OPERATION_FAILED",
  "STORAGE_OPERATION_FAILED",
  "NOT_FOUND",
  "ROUTE_NOT_FOUND",
  "INTERNAL_SERVER_ERROR",
]);

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    requestId: z.string(),
    details: z.unknown().optional(),
  }),
});
