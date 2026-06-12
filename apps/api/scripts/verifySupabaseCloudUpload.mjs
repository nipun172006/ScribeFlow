import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as tus from "tus-js-client";
import { createClient } from "@supabase/supabase-js";

const REQUIRED_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;
const VERIFICATION_TITLE = "ScribeFlow cloud verification";

function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  let content = "";

  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    let value = match[2] ?? "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function createWavBuffer({ seconds = 1, sampleRate = 8000 } = {}) {
  const channelCount = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channelCount * (bitsPerSample / 8);
  const blockAlign = channelCount * (bitsPerSample / 8);
  const sampleCount = seconds * sampleRate;
  const dataSize = sampleCount * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

async function createTemporaryWavFile() {
  const directory = await mkdtemp(join(tmpdir(), "scribeflow-upload-"));
  const filePath = join(directory, "verification.wav");
  const bytes = createWavBuffer();

  await writeFile(filePath, bytes);

  return {
    directory,
    filePath,
    bytes,
    byteLength: bytes.length,
  };
}

async function readJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for cloud upload verification.`);
  }

  return value;
}

function getApiBaseUrl() {
  return (
    process.env.VERIFY_API_BASE_URL?.trim() ||
    process.env.VITE_API_BASE_URL?.trim() ||
    "http://localhost:8787/api"
  ).replace(/\/$/, "");
}

function getSupabaseSecretKey() {
  return (
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ""
  );
}

function getStorageOrigin(supabaseUrl) {
  const url = new URL(supabaseUrl);
  if (url.hostname.endsWith(".supabase.co")) {
    const projectRef = url.hostname.split(".")[0];
    return `${url.protocol}//${projectRef}.storage.supabase.co`;
  }

  return url.origin;
}

function isIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

async function requestJson(apiBaseUrl, path, init = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const payload = await readJson(response);
  return { response, payload };
}

function runTusUpload(buffer, uploadInstructions) {
  return new Promise((resolve, reject) => {
    let lastProgress = 0;
    let progressCallbackCount = 0;

    const upload = new tus.Upload(buffer, {
      endpoint: uploadInstructions.endpoint,
      headers: {
        "x-signature": uploadInstructions.token,
        "x-upsert": "false",
      },
      chunkSize: uploadInstructions.chunkSizeBytes,
      retryDelays: [0, 3000, 5000, 10_000, 20_000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      uploadSize: buffer.length,
      metadata: {
        bucketName: uploadInstructions.bucket,
        objectName: uploadInstructions.objectPath,
        contentType: "audio/wav",
        cacheControl: "3600",
      },
      onProgress: (bytesUploaded) => {
        lastProgress = bytesUploaded;
        progressCallbackCount += 1;
      },
      onError: reject,
      onSuccess: () => resolve({ bytesUploaded: lastProgress, progressCallbackCount }),
    });

    upload.start();
  });
}

async function verifyPublicAccessRejected(storageOrigin, bucket, objectPath) {
  const encodedPath = objectPath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const publicUrl = `${storageOrigin}/storage/v1/object/public/${encodeURIComponent(
    bucket,
  )}/${encodedPath}`;
  const response = await fetch(publicUrl, { method: "GET" });

  return {
    status: response.status,
    rejected: !response.ok,
  };
}

async function verifySignedDownload({
  supabaseUrl,
  supabaseSecretKey,
  bucket,
  objectPath,
  expectedBytes,
}) {
  const client = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  let SupabaseStorageService;
  try {
    ({ SupabaseStorageService } =
      await import("../dist/services/supabaseStorageService.js"));
  } catch {
    throw new Error(
      "Could not load the built SupabaseStorageService. Run npm run build first.",
    );
  }

  const storageService = new SupabaseStorageService(client);
  const signedUrl = await storageService.createSignedDownloadUrl({
    bucket,
    objectPath,
    expiresInSeconds: 60,
  });

  const response = await fetch(signedUrl, { method: "GET" });
  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type");

  assert(response.ok, `Signed download returned HTTP ${response.status}.`);
  assert(
    bytes.length === expectedBytes,
    `Signed download byte count ${bytes.length} did not match ${expectedBytes}.`,
  );

  return {
    status: response.status,
    bytesDownloaded: bytes.length,
    contentType,
  };
}

function createVerificationSupabaseClient(supabaseUrl, supabaseSecretKey) {
  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

async function removeStorageObjectIfPresent(client, bucket, objectPath) {
  if (!bucket || !objectPath) {
    return false;
  }

  const { error } = await client.storage.from(bucket).remove([objectPath]);
  if (error) {
    return false;
  }

  return true;
}

async function cleanupVerificationRecords({ client, keepMeetingId }) {
  const { data, error } = await client
    .from("meetings")
    .select("id,status,storage_bucket,storage_path,created_at")
    .eq("title", VERIFICATION_TITLE)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Could not inspect verification meetings for cleanup.");
  }

  let removedMeetingRows = 0;
  let removedStorageObjects = 0;

  for (const meeting of data ?? []) {
    if (meeting.id === keepMeetingId && meeting.status === "created") {
      continue;
    }

    if (
      await removeStorageObjectIfPresent(
        client,
        meeting.storage_bucket,
        meeting.storage_path,
      )
    ) {
      removedStorageObjects += 1;
    }

    const deleteResult = await client.from("meetings").delete().eq("id", meeting.id);
    if (!deleteResult.error) {
      removedMeetingRows += 1;
    }
  }

  return {
    retainedMeetingId: keepMeetingId,
    removedMeetingRows,
    removedStorageObjects,
  };
}

async function verifyLiveMetadata(apiBaseUrl, client) {
  const created = await requestJson(apiBaseUrl, "/meetings/live", {
    method: "POST",
    body: JSON.stringify({
      title: "ScribeFlow live metadata verification",
      recordedAt: new Date().toISOString(),
      language: "en",
      knownParticipants: ["Cloud Verifier"],
      technicalTerms: ["ScribeFlow"],
    }),
  });

  assert(
    created.response.status === 201,
    `Live metadata returned HTTP ${created.response.status}.`,
  );
  const meeting = created.payload?.meeting;
  assert(meeting?.id, "Live metadata response did not include a meeting ID.");
  assert(meeting.sourceType === "live", "Live metadata source type was not live.");
  assert(meeting.status === "created", "Live metadata status was not created.");
  assert(
    meeting.storageBucket === null,
    "Live metadata unexpectedly had a storage bucket.",
  );
  assert(
    meeting.storagePath === null,
    "Live metadata unexpectedly had a storage path.",
  );

  const deleteResult = await client.from("meetings").delete().eq("id", meeting.id);
  if (deleteResult.error) {
    throw new Error("Could not clean up the live metadata verification row.");
  }

  return {
    status: created.response.status,
    meetingId: meeting.id,
    cleanupDeleted: true,
  };
}

async function main() {
  loadDotEnv();

  const startedAt = Date.now();
  const apiBaseUrl = getApiBaseUrl();
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const supabaseSecretKey = getSupabaseSecretKey();
  const expectedBucket = getRequiredEnv("SUPABASE_AUDIO_BUCKET");

  assert(
    supabaseSecretKey,
    "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required.",
  );

  const client = createVerificationSupabaseClient(supabaseUrl, supabaseSecretKey);
  const tempWav = await createTemporaryWavFile();
  let tempFileDeleted = false;

  try {
    const audio = await readFile(tempWav.filePath);
    const recordedAt = new Date().toISOString();
    const safeEvidence = {
      apiBaseUrl,
      title: VERIFICATION_TITLE,
      expectedBytes: tempWav.byteLength,
      tempFileCreatedInOsTmpdir: tempWav.filePath.startsWith(tmpdir()),
      tempFileDeleted: false,
      healthStatus: null,
      uploadInitializationStatus: null,
      tusBytesUploaded: null,
      progressCallbackCount: 0,
      completionStatus: null,
      finalMeetingStatus: null,
      meetingId: null,
      objectPath: null,
      listStatus: null,
      detailStatus: null,
      publicAccessStatus: null,
      signedDownloadStatus: null,
      liveMetadataStatus: null,
      endpointPathname: null,
      endpointEndsWithSign: null,
      xSignaturePresent: null,
      apiKeyPresent: null,
      signedTokenLength: null,
      signedTokenSegmentCount: null,
    };

    const health = await requestJson(apiBaseUrl, "/health");
    safeEvidence.healthStatus = health.response.status;
    assert(
      health.response.ok,
      `Health endpoint returned HTTP ${health.response.status}.`,
    );
    assert(
      health.payload?.dependencies?.supabaseConfigured === true,
      "Supabase is not configured in API health output.",
    );

    const init = await requestJson(apiBaseUrl, "/meetings/upload", {
      method: "POST",
      body: JSON.stringify({
        title: VERIFICATION_TITLE,
        fileName: "scribeflow-cloud-verification.wav",
        mimeType: "audio/wav",
        fileSizeBytes: audio.length,
        recordedAt,
        language: "en",
        knownParticipants: ["Cloud Verifier"],
        technicalTerms: ["Supabase", "TUS"],
      }),
    });
    safeEvidence.uploadInitializationStatus = init.response.status;
    assert(
      init.response.status === 201,
      `Upload initialization returned HTTP ${init.response.status}.`,
    );

    const meeting = init.payload?.meeting;
    const upload = init.payload?.upload;
    assert(meeting?.id, "Upload initialization did not return a meeting ID.");
    assert(
      meeting.status === "uploading",
      "Initialized meeting was not in uploading status.",
    );
    assert(upload?.protocol === "tus", "Upload protocol was not TUS.");
    assert(
      upload.bucket === expectedBucket,
      "Upload bucket did not match SUPABASE_AUDIO_BUCKET.",
    );
    assert(
      upload.chunkSizeBytes === REQUIRED_CHUNK_SIZE_BYTES,
      "TUS chunk size was not 6 MiB.",
    );
    assert(
      upload.token && typeof upload.token === "string",
      "Signed upload token was missing.",
    );
    assert(
      upload.objectPath?.startsWith(`${meeting.id}/`),
      "Object path did not use the meeting ID prefix.",
    );

    safeEvidence.meetingId = meeting.id;
    safeEvidence.objectPath = upload.objectPath;
    const endpointUrl = new URL(upload.endpoint);
    safeEvidence.endpointPathname = endpointUrl.pathname;
    safeEvidence.endpointEndsWithSign = endpointUrl.pathname.endsWith(
      "/upload/resumable/sign",
    );
    safeEvidence.xSignaturePresent = Boolean(upload.token);
    safeEvidence.apiKeyPresent = Boolean(upload.apiKey);
    safeEvidence.signedTokenLength = upload.token.trim().length;
    safeEvidence.signedTokenSegmentCount = upload.token.trim().split(".").length;
    assert(
      safeEvidence.endpointEndsWithSign,
      "Signed TUS endpoint did not end in /upload/resumable/sign.",
    );

    let tusResult;
    try {
      tusResult = await runTusUpload(audio, upload);
    } catch (error) {
      if (error && typeof error === "object") {
        error.safeEvidence = safeEvidence;
      }
      throw error;
    }
    safeEvidence.tusBytesUploaded = tusResult.bytesUploaded;
    safeEvidence.progressCallbackCount = tusResult.progressCallbackCount;
    assert(
      tusResult.progressCallbackCount > 0,
      "TUS upload did not report progress callbacks.",
    );
    assert(
      tusResult.bytesUploaded === audio.length,
      `TUS uploaded ${tusResult.bytesUploaded} bytes instead of ${audio.length}.`,
    );

    const complete = await requestJson(
      apiBaseUrl,
      `/meetings/${meeting.id}/upload/complete`,
      {
        method: "POST",
      },
    );
    safeEvidence.completionStatus = complete.response.status;
    assert(
      complete.response.ok,
      `Upload completion returned HTTP ${complete.response.status}.`,
    );
    const completedMeeting = complete.payload?.meeting;
    assert(
      completedMeeting?.status === "created",
      "Completed meeting was not marked created.",
    );
    assert(
      completedMeeting.fileSizeBytes === audio.length,
      "Completed meeting file size did not match.",
    );
    assert(
      completedMeeting.expectedFileSizeBytes === audio.length,
      "Expected meeting file size did not match.",
    );
    assert(
      completedMeeting.storageBucket === expectedBucket,
      "Completed meeting bucket did not match.",
    );
    assert(
      completedMeeting.storagePath === upload.objectPath,
      "Completed meeting storage path did not match.",
    );
    assert(
      isIsoDate(completedMeeting.uploadCompletedAt),
      "Upload completion timestamp was not an ISO date.",
    );
    safeEvidence.finalMeetingStatus = completedMeeting.status;

    const list = await requestJson(
      apiBaseUrl,
      `/meetings?query=${encodeURIComponent(VERIFICATION_TITLE)}&pageSize=10`,
    );
    safeEvidence.listStatus = list.response.status;
    assert(list.response.ok, `Meeting list returned HTTP ${list.response.status}.`);
    assert(
      Array.isArray(list.payload?.items) &&
        list.payload.items.some((item) => item.id === meeting.id),
      "Meeting list did not include the verification meeting.",
    );

    const detail = await requestJson(apiBaseUrl, `/meetings/${meeting.id}`);
    safeEvidence.detailStatus = detail.response.status;
    assert(
      detail.response.ok,
      `Meeting detail returned HTTP ${detail.response.status}.`,
    );
    assert(
      detail.payload?.meeting?.id === meeting.id,
      "Meeting detail ID did not match.",
    );
    assert(
      detail.payload?.meeting?.status === "created",
      "Meeting detail status was not created.",
    );
    assert(
      detail.payload?.meeting?.storageBucket === expectedBucket,
      "Meeting detail bucket did not match.",
    );
    assert(
      detail.payload?.meeting?.storagePath === upload.objectPath,
      "Meeting detail object path did not match.",
    );
    assert(
      detail.payload?.summary === null,
      "Verification meeting unexpectedly had a summary.",
    );
    assert(
      Array.isArray(detail.payload?.speakers) && detail.payload.speakers.length === 0,
      "Verification meeting unexpectedly had speakers.",
    );
    assert(
      Array.isArray(detail.payload?.transcriptSegments) &&
        detail.payload.transcriptSegments.length === 0,
      "Verification meeting unexpectedly had transcript segments.",
    );
    assert(
      Array.isArray(detail.payload?.actionItems) &&
        detail.payload.actionItems.length === 0,
      "Verification meeting unexpectedly had action items.",
    );
    assert(
      Array.isArray(detail.payload?.topics) && detail.payload.topics.length === 0,
      "Verification meeting unexpectedly had topics.",
    );
    assert(detail.payload?.chunkCount === 0, "Verification meeting had chunks.");

    const storageOrigin = getStorageOrigin(supabaseUrl);
    const publicAccess = await verifyPublicAccessRejected(
      storageOrigin,
      expectedBucket,
      upload.objectPath,
    );
    safeEvidence.publicAccessStatus = publicAccess.status;
    assert(
      publicAccess.rejected,
      "Private storage object was reachable through a public URL.",
    );

    const signedDownload = await verifySignedDownload({
      supabaseUrl,
      supabaseSecretKey,
      bucket: expectedBucket,
      objectPath: upload.objectPath,
      expectedBytes: audio.length,
    });
    safeEvidence.signedDownloadStatus = signedDownload.status;

    const liveMetadata = await verifyLiveMetadata(apiBaseUrl, client);
    safeEvidence.liveMetadataStatus = liveMetadata.status;

    const cleanup = await cleanupVerificationRecords({
      client,
      keepMeetingId: meeting.id,
    });

    await rm(tempWav.directory, { force: true, recursive: true });
    tempFileDeleted = true;
    safeEvidence.tempFileDeleted = true;

    console.log(
      JSON.stringify(
        {
          ok: true,
          evidence: {
            ...safeEvidence,
            liveMetadataCleanupDeleted: liveMetadata.cleanupDeleted,
            cleanup,
            signedDownloadBytes: signedDownload.bytesDownloaded,
            signedDownloadContentType: signedDownload.contentType,
            durationMs: Date.now() - startedAt,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    if (!tempFileDeleted) {
      await rm(tempWav.directory, { force: true, recursive: true });
    }
  }
}

main().catch((error) => {
  const safeEvidence =
    error && typeof error === "object" && "safeEvidence" in error
      ? error.safeEvidence
      : undefined;
  console.error(
    JSON.stringify(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Unknown verification error.",
        evidence: safeEvidence,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
