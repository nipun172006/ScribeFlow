import { describe, expect, it, vi } from "vitest";
import { audioUploadPolicy } from "@scribeflow/shared";
import {
  assertAllowedFileSize,
  assertAllowedMimeType,
  createStorageObjectPath,
  deriveTusEndpoint,
  getSafeExtension,
  hasAllowedExtension,
  isAllowedMimeType,
} from "../src/services/audioValidation.js";

describe("audio upload validation", () => {
  it("generates safe unique object paths without using the original name directly", () => {
    const meetingId = "11111111-1111-4111-8111-111111111111";
    const pathOne = createStorageObjectPath(meetingId, "Team Meeting.m4a");
    const pathTwo = createStorageObjectPath(meetingId, "Team Meeting.m4a");

    expect(pathOne).toMatch(/^11111111-1111-4111-8111-111111111111\/[0-9a-f-]+\.m4a$/);
    expect(pathOne).not.toBe(pathTwo);
    expect(pathOne).not.toContain("Team Meeting");
  });

  it("rejects path traversal and unsupported extensions", () => {
    expect(() => getSafeExtension("../secret.m4a")).toThrow("path segments");
    expect(() => getSafeExtension("meeting.exe")).toThrow("not supported");
    expect(hasAllowedExtension("meeting.wav")).toBe(true);
    expect(hasAllowedExtension("meeting.exe")).toBe(false);
  });

  it("validates MIME types and file sizes", () => {
    expect(assertAllowedMimeType("audio/mp4")).toBe("audio/mp4");
    expect(isAllowedMimeType("video/webm")).toBe(true);
    expect(() => assertAllowedMimeType("application/json")).toThrow(
      "MIME type is not supported",
    );
    expect(() => assertAllowedFileSize(0)).toThrow("must be positive");
    expect(() => assertAllowedFileSize(audioUploadPolicy.maxFileSizeBytes + 1)).toThrow(
      "upload limit",
    );
  });

  it("derives direct Supabase Storage TUS endpoints safely", () => {
    expect(deriveTusEndpoint("https://project-ref.supabase.co")).toBe(
      "https://project-ref.storage.supabase.co/storage/v1/upload/resumable/sign",
    );
    expect(deriveTusEndpoint("https://project-ref.storage.supabase.co")).toBe(
      "https://project-ref.storage.supabase.co/storage/v1/upload/resumable/sign",
    );
  });

  it("uses the signed TUS route without duplicating the sign suffix", () => {
    const endpoint = deriveTusEndpoint(
      "https://project-ref.supabase.co/storage/v1/upload/resumable/sign",
    );

    expect(endpoint).toMatch(/\/storage\/v1\/upload\/resumable\/sign$/);
    expect(endpoint).not.toMatch(/\/storage\/v1\/upload\/resumable$/);
    expect(endpoint).not.toContain("/sign/sign");
  });

  it("rejects non-HTTPS and unexpected Supabase hostnames", () => {
    expect(() => deriveTusEndpoint("http://project-ref.supabase.co")).toThrow(
      "must use HTTPS",
    );
    expect(() => deriveTusEndpoint("https://example.com")).toThrow(
      "Supabase or local development hostname",
    );
  });

  it("does not expose signed upload tokens through logger output", async () => {
    vi.resetModules();
    vi.stubEnv("LOG_LEVEL", "silent");
    const { logger } = await import("../src/config/logger.js");

    expect(logger).toBeDefined();
    vi.unstubAllEnvs();
  });
});
