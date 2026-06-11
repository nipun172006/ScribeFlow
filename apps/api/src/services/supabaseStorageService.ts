import type { UploadInstructions } from "@scribeflow/shared";
import { audioUploadPolicy } from "@scribeflow/shared";
import { env } from "../config/env.js";
import type { ScribeFlowSupabaseClient } from "../config/supabaseClient.js";
import { ApiError } from "../errors/apiError.js";
import type { StorageService, UploadObjectInfo } from "./interfaces.js";
import { deriveTusEndpoint } from "./audioValidation.js";

const metadataNumber = (metadata: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
};

const metadataString = (metadata: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }

  return null;
};

export class SupabaseStorageService implements StorageService {
  constructor(private readonly client: ScribeFlowSupabaseClient) {}

  async createSignedResumableUpload(input: {
    bucket: string;
    objectPath: string;
  }): Promise<UploadInstructions> {
    const { data, error } = await this.client.storage
      .from(input.bucket)
      .createSignedUploadUrl(input.objectPath);

    if (error || !data?.token) {
      throw ApiError.uploadSigningFailed();
    }

    return {
      protocol: "tus",
      endpoint: deriveTusEndpoint(env.SUPABASE_URL ?? ""),
      bucket: input.bucket,
      objectPath: input.objectPath,
      token: data.token,
      chunkSizeBytes: audioUploadPolicy.chunkSizeBytes,
      expiresInSeconds: env.SUPABASE_SIGNED_UPLOAD_TTL_SECONDS,
    };
  }

  async getObjectInfo(input: {
    bucket: string;
    objectPath: string;
  }): Promise<UploadObjectInfo> {
    const lastSlash = input.objectPath.lastIndexOf("/");
    const directory = lastSlash >= 0 ? input.objectPath.slice(0, lastSlash) : "";
    const fileName =
      lastSlash >= 0 ? input.objectPath.slice(lastSlash + 1) : input.objectPath;

    const { data, error } = await this.client.storage
      .from(input.bucket)
      .list(directory, {
        limit: 100,
        search: fileName,
      });

    if (error) {
      throw ApiError.storageOperationFailed(
        "Could not inspect the uploaded audio object.",
      );
    }

    const object = data?.find((item) => item.name === fileName);
    if (!object) {
      throw new ApiError(
        404,
        "STORAGE_OBJECT_MISSING",
        "Uploaded audio object was not found in private storage.",
      );
    }

    const metadata =
      object.metadata && typeof object.metadata === "object"
        ? (object.metadata as Record<string, unknown>)
        : {};
    const sizeBytes = metadataNumber(metadata, [
      "size",
      "contentLength",
      "content-length",
    ]);
    const mimeType = metadataString(metadata, [
      "mimetype",
      "mimeType",
      "contentType",
      "content-type",
    ]);

    if (!sizeBytes || sizeBytes <= 0) {
      throw new ApiError(
        502,
        "STORAGE_METADATA_MISMATCH",
        "Storage did not return a valid uploaded object size.",
      );
    }

    return {
      bucket: input.bucket,
      path: input.objectPath,
      sizeBytes,
      mimeType,
      updatedAt: object.updated_at ? new Date(object.updated_at).toISOString() : null,
    };
  }

  async removeObject(input: { bucket: string; objectPath: string }): Promise<void> {
    const { error } = await this.client.storage
      .from(input.bucket)
      .remove([input.objectPath]);

    if (error) {
      throw ApiError.storageOperationFailed(
        "Could not remove the invalid audio object.",
      );
    }
  }

  async createSignedDownloadUrl(input: {
    bucket: string;
    objectPath: string;
    expiresInSeconds?: number;
  }): Promise<string> {
    const { data, error } = await this.client.storage
      .from(input.bucket)
      .createSignedUrl(
        input.objectPath,
        input.expiresInSeconds ?? env.SUPABASE_SIGNED_DOWNLOAD_TTL_SECONDS,
      );

    if (error || !data?.signedUrl) {
      throw ApiError.storageOperationFailed("Could not create a signed download URL.");
    }

    return data.signedUrl;
  }
}
