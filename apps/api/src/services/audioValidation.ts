import { randomUUID } from "node:crypto";
import path from "node:path";
import { audioUploadPolicy } from "@scribeflow/shared";
import { env } from "../config/env.js";
import { ApiError } from "../errors/apiError.js";

const allowedExtensions = new Set<string>(audioUploadPolicy.allowedExtensions);
const allowedMimeTypes = new Set<string>(audioUploadPolicy.allowedMimeTypes);

export function normalizeList(values: string[], maxItems: number, maxLength: number) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > maxLength) {
      throw ApiError.badRequest(
        "List values must be non-empty and within the length limit.",
      );
    }

    const key = trimmed.toLocaleLowerCase();
    if (seen.has(key)) {
      continue;
    }

    if (normalized.length >= maxItems) {
      throw ApiError.badRequest("Too many list values were provided.");
    }

    seen.add(key);
    normalized.push(trimmed);
  }

  return normalized;
}

export function getSafeExtension(fileName: string) {
  const baseName = path.basename(fileName);
  if (
    baseName !== fileName ||
    fileName.includes("..") ||
    fileName.includes("/") ||
    fileName.includes("\\")
  ) {
    throw ApiError.unsupportedFileExtension(
      "File names must not contain path segments.",
    );
  }

  const extension = path.extname(baseName).replace(".", "").toLocaleLowerCase();
  if (!extension || !allowedExtensions.has(extension)) {
    throw ApiError.unsupportedFileExtension(
      "This audio or video file extension is not supported.",
    );
  }

  return extension;
}

export function assertAllowedMimeType(mimeType: string) {
  const normalized = mimeType.trim().toLocaleLowerCase();
  if (!allowedMimeTypes.has(normalized)) {
    throw ApiError.unsupportedMimeType(
      "This audio or video MIME type is not supported.",
    );
  }

  return normalized;
}

export function assertAllowedFileSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw ApiError.badRequest("Audio file size must be positive.");
  }

  if (sizeBytes > env.MAX_AUDIO_FILE_SIZE_BYTES) {
    throw ApiError.fileTooLarge("Audio file exceeds the configured upload limit.");
  }
}

export function createStorageObjectPath(meetingId: string, fileName: string) {
  const extension = getSafeExtension(fileName);
  return `${meetingId}/${randomUUID()}.${extension}`;
}

export function assertUuid(value: string, message = "A valid UUID is required.") {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw ApiError.invalidUuid(message);
  }
}

const signedTusPath = "/storage/v1/upload/resumable/sign";

export function deriveTusEndpoint(supabaseUrl: string) {
  const url = new URL(supabaseUrl);

  if (url.protocol !== "https:") {
    throw ApiError.storageOperationFailed("Supabase URL must use HTTPS.");
  }

  if (url.hostname.endsWith(".supabase.co")) {
    const projectRef = url.hostname.split(".")[0];
    if (!projectRef) {
      throw ApiError.storageOperationFailed(
        "Could not derive Supabase Storage hostname.",
      );
    }

    return `${url.protocol}//${projectRef}.storage.supabase.co${signedTusPath}`;
  }

  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return `${url.origin}${signedTusPath}`;
  }

  throw ApiError.storageOperationFailed(
    "Supabase URL must use a Supabase or local development hostname.",
  );
}

export function isAllowedMimeType(mimeType: string | null | undefined) {
  return Boolean(mimeType && allowedMimeTypes.has(mimeType.toLocaleLowerCase()));
}

export function hasAllowedExtension(fileName: string) {
  try {
    getSafeExtension(fileName);
    return true;
  } catch {
    return false;
  }
}
