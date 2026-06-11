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

  static databaseOperationFailed(message = "Database operation failed.") {
    return new ApiError(500, "DATABASE_OPERATION_FAILED", message);
  }

  static storageOperationFailed(message = "Storage operation failed.") {
    return new ApiError(502, "STORAGE_OPERATION_FAILED", message);
  }

  static uploadSigningFailed(message = "Could not create a signed upload token.") {
    return new ApiError(502, "UPLOAD_SIGNING_FAILED", message);
  }

  static routeNotFound(message: string) {
    return new ApiError(404, "ROUTE_NOT_FOUND", message);
  }

  static notImplemented(message = "This feature is not implemented yet.") {
    return new ApiError(501, "FEATURE_NOT_IMPLEMENTED", message);
  }
}
