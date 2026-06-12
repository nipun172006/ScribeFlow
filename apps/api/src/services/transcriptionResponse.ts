import type {
  MeetingDetail,
  NormalizedTranscription,
  TranscribeMeetingResponse,
} from "@scribeflow/shared";

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : null;

const asNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const countWords = (detail: MeetingDetail) => {
  const metadata = asRecord(detail.meeting.metadata.transcription);
  const metadataWordCount = asNumber(metadata.wordCount);

  if (metadataWordCount != null) {
    return Math.max(0, Math.round(metadataWordCount));
  }

  const wordMetadataCount = detail.transcriptSegments.reduce(
    (count, segment) => count + (segment.words?.length ?? 0),
    0,
  );

  if (wordMetadataCount > 0) {
    return wordMetadataCount;
  }

  return detail.transcriptSegments.reduce(
    (count, segment) => count + segment.text.split(/\s+/).filter(Boolean).length,
    0,
  );
};

const averageSegmentConfidence = (detail: MeetingDetail) => {
  const values = detail.transcriptSegments
    .map((segment) => segment.confidence)
    .filter((value): value is number => typeof value === "number");

  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

export function buildTranscribeMeetingResponse(params: {
  detail: MeetingDetail;
  alreadyTranscribed: boolean;
  transcription?: NormalizedTranscription;
  processingTimeMs?: number;
}): TranscribeMeetingResponse {
  const { detail, transcription } = params;
  const metadata = asRecord(detail.meeting.metadata.transcription);

  return {
    meeting: detail.meeting,
    speakers: detail.speakers,
    transcriptSegments: detail.transcriptSegments,
    transcription: {
      provider: "deepgram",
      requestId:
        transcription?.providerRequestId ?? asString(metadata.requestId) ?? null,
      modelName:
        transcription?.modelName ??
        asString(metadata.modelName) ??
        asString(metadata.model) ??
        null,
      diarizeModel:
        transcription?.diarizeModel ?? asString(metadata.diarizeModel) ?? null,
      language:
        transcription?.language ??
        asString(metadata.language) ??
        detail.meeting.language,
      durationSeconds:
        transcription?.durationSeconds ??
        asNumber(metadata.durationSeconds) ??
        detail.meeting.durationSeconds,
      speakerCount:
        transcription?.speakers.length ??
        Math.max(
          0,
          Math.round(asNumber(metadata.speakerCount) ?? detail.speakers.length),
        ),
      segmentCount:
        transcription?.segments.length ??
        Math.max(
          0,
          Math.round(
            asNumber(metadata.segmentCount) ?? detail.transcriptSegments.length,
          ),
        ),
      wordCount: transcription?.wordCount ?? countWords(detail),
      confidence:
        transcription?.confidence ??
        asNumber(metadata.confidence) ??
        averageSegmentConfidence(detail),
      processingTimeMs:
        params.processingTimeMs ??
        asNumber(metadata.processingTimeMs) ??
        detail.meeting.processingTimeMs,
    },
    alreadyTranscribed: params.alreadyTranscribed,
  };
}
