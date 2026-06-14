import type { ApiErrorCode, ApiErrorResponse } from "@scribeflow/shared";

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(
    statusCode: number,
    code: ApiErrorCode,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  toResponse(requestId: string): ApiErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        requestId,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }

  static invalidUuid(message = "A valid UUID is required.") {
    return new ApiError(400, "INVALID_UUID", message);
  }

  static notFound(message: string) {
    return new ApiError(404, "NOT_FOUND", message);
  }

  static meetingNotFound(message = "Meeting was not found.") {
    return new ApiError(404, "MEETING_NOT_FOUND", message);
  }

  static speakerNotFound(message = "Speaker was not found for this meeting.") {
    return new ApiError(404, "SPEAKER_NOT_FOUND", message);
  }

  static actionItemNotFound(message = "Action item was not found.") {
    return new ApiError(404, "ACTION_ITEM_NOT_FOUND", message);
  }

  static conflict(code: ApiErrorCode, message: string) {
    return new ApiError(409, code, message);
  }

  static unsupportedFileExtension(message: string) {
    return new ApiError(400, "UNSUPPORTED_FILE_EXTENSION", message);
  }

  static unsupportedMimeType(message: string) {
    return new ApiError(415, "UNSUPPORTED_MIME_TYPE", message);
  }

  static fileTooLarge(message: string) {
    return new ApiError(413, "FILE_TOO_LARGE", message);
  }

  static supabaseNotConfigured() {
    return new ApiError(
      503,
      "SUPABASE_NOT_CONFIGURED",
      "Supabase persistence is not configured on the server.",
    );
  }

  static deepgramNotConfigured() {
    return new ApiError(
      503,
      "DEEPGRAM_NOT_CONFIGURED",
      "Deepgram transcription is not configured on the server.",
    );
  }

  static databaseOperationFailed(
    message = "Database operation failed.",
    details?: unknown,
  ) {
    return new ApiError(500, "DATABASE_OPERATION_FAILED", message, details);
  }

  static storageOperationFailed(message = "Storage operation failed.") {
    return new ApiError(502, "STORAGE_OPERATION_FAILED", message);
  }

  static uploadSigningFailed(message = "Could not create a signed upload token.") {
    return new ApiError(502, "UPLOAD_SIGNING_FAILED", message);
  }

  static audioStorageMissing() {
    return new ApiError(
      409,
      "AUDIO_STORAGE_MISSING",
      "This meeting does not have verified private audio storage metadata.",
    );
  }

  static signedAudioUrlFailed() {
    return new ApiError(
      502,
      "SIGNED_AUDIO_URL_FAILED",
      "Could not create a private audio access URL for transcription.",
    );
  }

  static deepgramAuthFailed() {
    return new ApiError(
      502,
      "DEEPGRAM_AUTH_FAILED",
      "Deepgram rejected the configured server credentials.",
    );
  }

  static deepgramRateLimited() {
    return new ApiError(
      503,
      "DEEPGRAM_RATE_LIMITED",
      "Deepgram rate-limited the transcription request. Please retry later.",
    );
  }

  static deepgramRequestTimeout() {
    return new ApiError(
      504,
      "DEEPGRAM_REQUEST_TIMEOUT",
      "Deepgram transcription did not finish before the configured timeout.",
    );
  }

  static deepgramRequestFailed() {
    return new ApiError(
      502,
      "DEEPGRAM_REQUEST_FAILED",
      "Deepgram transcription failed. Please retry after checking the server configuration and audio file.",
    );
  }

  static deepgramInvalidResponse(
    message = "Deepgram returned transcription output that could not be normalized.",
  ) {
    return new ApiError(502, "DEEPGRAM_INVALID_RESPONSE", message);
  }

  static geminiNotConfigured() {
    return new ApiError(
      503,
      "GEMINI_NOT_CONFIGURED",
      "Gemini meeting analysis is not configured on the server.",
    );
  }

  static geminiAuthFailed() {
    return new ApiError(
      502,
      "GEMINI_AUTH_FAILED",
      "Gemini rejected the configured server credentials.",
    );
  }

  static geminiRateLimited() {
    return new ApiError(
      503,
      "GEMINI_RATE_LIMITED",
      "Gemini rate-limited the analysis request. Please retry later.",
    );
  }

  static geminiRequestTimeout() {
    return new ApiError(
      504,
      "GEMINI_REQUEST_TIMEOUT",
      "Gemini meeting analysis did not finish before the configured timeout.",
    );
  }

  static geminiRequestFailed() {
    return new ApiError(
      502,
      "GEMINI_REQUEST_FAILED",
      "Gemini meeting analysis failed. Please retry after checking the server configuration.",
    );
  }

  static geminiInvalidResponse(
    message = "Gemini returned meeting-analysis output that could not be parsed.",
    details?: unknown,
  ) {
    return new ApiError(502, "GEMINI_INVALID_RESPONSE", message, details);
  }

  static meetingAnalysisOutputInvalid(
    message = "Gemini returned meeting-analysis output that failed validation.",
    details?: unknown,
  ) {
    return new ApiError(502, "MEETING_ANALYSIS_OUTPUT_INVALID", message, details);
  }

  static analysisPersistenceFailed() {
    return new ApiError(
      500,
      "ANALYSIS_PERSISTENCE_FAILED",
      "Could not persist the Gemini meeting analysis.",
    );
  }

  static noSpeechDetected() {
    return new ApiError(
      422,
      "NO_SPEECH_DETECTED",
      "Deepgram returned no usable speech segments for this recording.",
    );
  }

  static transcriptPersistenceFailed() {
    return new ApiError(
      500,
      "TRANSCRIPT_PERSISTENCE_FAILED",
      "Could not persist the normalized transcription.",
    );
  }

  static transcriptionProviderFailed(
    message = "Deepgram transcription failed. Please retry after checking the server configuration and audio file.",
  ) {
    return new ApiError(502, "TRANSCRIPTION_PROVIDER_FAILED", message);
  }

  static transcriptionOutputInvalid(
    message = "Deepgram returned transcription output that could not be normalized.",
  ) {
    return new ApiError(502, "TRANSCRIPTION_OUTPUT_INVALID", message);
  }

  static routeNotFound(message: string) {
    return new ApiError(404, "ROUTE_NOT_FOUND", message);
  }

  static notImplemented(message = "This feature is not implemented yet.") {
    return new ApiError(501, "FEATURE_NOT_IMPLEMENTED", message);
  }
}
