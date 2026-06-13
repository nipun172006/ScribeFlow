import type { z } from "zod";
import type {
  actionItemSchema,
  actionItemStatusSchema,
  analyzeMeetingResponseSchema,
  apiErrorCodeSchema,
  apiErrorResponseSchema,
  meetingDetailSchema,
  meetingAnalyticsSchema,
  meetingListQuerySchema,
  meetingSchema,
  meetingSourceTypeSchema,
  meetingSpeakerSchema,
  meetingStatusSchema,
  meetingSummarySchema,
  meetingTopicSchema,
  normalizedSpeakerSchema,
  normalizedTranscriptSegmentSchema,
  normalizedTranscriptionSchema,
  paginatedMeetingListSchema,
  paginationSchema,
  renameSpeakerInputSchema,
  searchInputSchema,
  searchResultSchema,
  startLiveMeetingInputSchema,
  structuredAnalysisActionItemSchema,
  structuredMeetingAnalysisSchema,
  transcribeMeetingResponseSchema,
  transcriptionSummarySchema,
  transcriptSegmentSchema,
  transcriptWordSchema,
  updateActionItemInputSchema,
  uploadCompletionResponseSchema,
  uploadFailureInputSchema,
  uploadInstructionsSchema,
  uploadMeetingInputSchema,
  uploadMeetingResponseSchema,
} from "./schemas.js";

export type IsoDateString = z.infer<typeof meetingSchema>["createdAt"];
export type MeetingSourceType = z.infer<typeof meetingSourceTypeSchema>;
export type MeetingStatus = z.infer<typeof meetingStatusSchema>;
export type Meeting = z.infer<typeof meetingSchema>;
export type MeetingSpeaker = z.infer<typeof meetingSpeakerSchema>;
export type TranscriptWord = z.infer<typeof transcriptWordSchema>;
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;
export type TranscriptionWord = z.infer<typeof transcriptWordSchema>;
export type NormalizedTranscriptSegment = z.infer<
  typeof normalizedTranscriptSegmentSchema
>;
export type NormalizedSpeaker = z.infer<typeof normalizedSpeakerSchema>;
export type NormalizedTranscription = z.infer<typeof normalizedTranscriptionSchema>;
export type TranscriptionSummary = z.infer<typeof transcriptionSummarySchema>;
export type ActionItemStatus = z.infer<typeof actionItemStatusSchema>;
export type ActionItem = z.infer<typeof actionItemSchema>;
export type AnalyzeMeetingResponse = z.infer<typeof analyzeMeetingResponseSchema>;
export type MeetingSummary = z.infer<typeof meetingSummarySchema>;
export type StructuredMeetingAnalysis = z.infer<typeof structuredMeetingAnalysisSchema>;
export type StructuredAnalysisActionItem = z.infer<
  typeof structuredAnalysisActionItemSchema
>;
export type MeetingTopic = z.infer<typeof meetingTopicSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type MeetingAnalytics = z.infer<typeof meetingAnalyticsSchema>;
export type UploadMeetingInput = z.infer<typeof uploadMeetingInputSchema>;
export type UploadInstructions = z.infer<typeof uploadInstructionsSchema>;
export type UploadMeetingResponse = z.infer<typeof uploadMeetingResponseSchema>;
export type UploadCompletionResponse = z.infer<typeof uploadCompletionResponseSchema>;
export type UploadFailureInput = z.infer<typeof uploadFailureInputSchema>;
export type StartLiveMeetingInput = z.infer<typeof startLiveMeetingInputSchema>;
export type RenameSpeakerInput = z.infer<typeof renameSpeakerInputSchema>;
export type UpdateActionItemInput = z.infer<typeof updateActionItemInputSchema>;
export type SearchInput = z.infer<typeof searchInputSchema>;
export type MeetingListQuery = z.infer<typeof meetingListQuerySchema>;
export type Pagination = z.infer<typeof paginationSchema>;
export type PaginatedMeetingList = z.infer<typeof paginatedMeetingListSchema>;
export type MeetingDetail = z.infer<typeof meetingDetailSchema>;
export type TranscribeMeetingResponse = z.infer<typeof transcribeMeetingResponseSchema>;
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
