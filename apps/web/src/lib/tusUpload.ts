import * as tus from "tus-js-client";
import type { UploadInstructions } from "@scribeflow/shared";

export type TusUploadCallbacks = {
  onProgress: (bytesUploaded: number, bytesTotal: number) => void;
  onSuccess: () => void;
  onError: (error: Error) => void;
};

export function createTusUpload(
  file: File,
  instructions: UploadInstructions,
  callbacks: TusUploadCallbacks,
) {
  const upload = new tus.Upload(file, {
    endpoint: instructions.endpoint,
    headers: {
      "x-signature": instructions.token,
      "x-upsert": "false",
    },
    chunkSize: instructions.chunkSizeBytes,
    retryDelays: [0, 3000, 5000, 10_000, 20_000],
    uploadDataDuringCreation: true,
    removeFingerprintOnSuccess: true,
    metadata: {
      bucketName: instructions.bucket,
      objectName: instructions.objectPath,
      contentType: file.type || "application/octet-stream",
      cacheControl: "3600",
    },
    onProgress: callbacks.onProgress,
    onSuccess: callbacks.onSuccess,
    onError: callbacks.onError,
  });

  return upload;
}

export async function startTusUploadWithResume(upload: tus.Upload) {
  const previousUploads = await upload.findPreviousUploads();
  const previousUpload = previousUploads[0];
  if (previousUpload) {
    upload.resumeFromPreviousUpload(previousUpload);
  }

  upload.start();
  return upload;
}
