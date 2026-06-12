import type { UploadInstructions } from "@scribeflow/shared";
import { describe, expect, it, vi } from "vitest";
import { createTusUpload } from "./tusUpload";

const uploadConstructor = vi.hoisted(() => vi.fn());

vi.mock("tus-js-client", () => ({
  Upload: uploadConstructor,
}));

function instructions(overrides: Partial<UploadInstructions> = {}): UploadInstructions {
  return {
    protocol: "tus",
    endpoint:
      "https://project-ref.storage.supabase.co/storage/v1/upload/resumable/sign",
    bucket: "meeting-audio",
    objectPath: "meeting-id/audio.wav",
    token: "signed-upload-token",
    chunkSizeBytes: 6 * 1024 * 1024,
    expiresInSeconds: 7200,
    ...overrides,
  };
}

describe("createTusUpload", () => {
  it("uses signed TUS headers without sending an Authorization secret", () => {
    const file = new File(["audio"], "meeting.wav", { type: "audio/wav" });
    const callbacks = {
      onProgress: vi.fn(),
      onSuccess: vi.fn(),
      onError: vi.fn(),
    };

    createTusUpload(file, instructions(), callbacks);

    const options = uploadConstructor.mock.calls[0]?.[1];
    expect(options.endpoint).toBe(
      "https://project-ref.storage.supabase.co/storage/v1/upload/resumable/sign",
    );
    expect(options.headers).toEqual({
      "x-signature": "signed-upload-token",
      "x-upsert": "false",
    });
    expect(options.headers).not.toHaveProperty("Authorization");
    expect(options.headers).not.toHaveProperty("authorization");
    expect(options.chunkSize).toBe(6 * 1024 * 1024);
    expect(options.metadata).toMatchObject({
      bucketName: "meeting-audio",
      objectName: "meeting-id/audio.wav",
      contentType: "audio/wav",
      cacheControl: "3600",
    });
  });
});
