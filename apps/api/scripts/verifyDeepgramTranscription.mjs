import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import * as tus from "tus-js-client";
import { createClient } from "@supabase/supabase-js";
import { calculateWer, cleanupReferenceText } from "./evaluateWer.mjs";

const REQUIRED_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;
const VERIFICATION_TITLE = "ScribeFlow two-speaker transcription demo";

const mimeByExtension = new Map([
  [".aac", "audio/aac"],
  [".m4a", "audio/x-m4a"],
  [".mp3", "audio/mpeg"],
  [".mp4", "audio/mp4"],
  [".ogg", "audio/ogg"],
  [".wav", "audio/wav"],
  [".webm", "audio/webm"],
]);

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for Deepgram verification.`);
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

function runTusUpload(buffer, uploadInstructions, mimeType) {
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
        contentType: mimeType,
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

function createVerificationSupabaseClient(supabaseUrl, supabaseSecretKey) {
  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

async function cleanupVerificationRecord({ client, meetingId, bucket, objectPath }) {
  let removedStorageObject = false;
  let removedMeetingRow = false;

  if (bucket && objectPath) {
    const storageResult = await client.storage.from(bucket).remove([objectPath]);
    removedStorageObject = !storageResult.error;
  }

  if (meetingId) {
    const deleteResult = await client.from("meetings").delete().eq("id", meetingId);
    removedMeetingRow = !deleteResult.error;
  }

  return {
    removedStorageObject,
    removedMeetingRow,
  };
}

async function removeTemporaryFile(path) {
  if (!path) {
    return false;
  }

  await rm(path, { force: true });
  return true;
}

async function cleanupPreviousVerificationRecords(client) {
  const { data } = await client
    .from("meetings")
    .select("id, storage_bucket, storage_path")
    .eq("title", VERIFICATION_TITLE);

  let removedStorageObjects = 0;
  let removedMeetingRows = 0;

  for (const meeting of data ?? []) {
    if (meeting.storage_bucket && meeting.storage_path) {
      const storageResult = await client.storage
        .from(meeting.storage_bucket)
        .remove([meeting.storage_path]);

      if (!storageResult.error) {
        removedStorageObjects += 1;
      }
    }

    const deleteResult = await client.from("meetings").delete().eq("id", meeting.id);
    if (!deleteResult.error) {
      removedMeetingRows += 1;
    }
  }

  return {
    removedStorageObjects,
    removedMeetingRows,
  };
}

async function main() {
  loadDotEnv();

  const startedAt = Date.now();
  const apiBaseUrl = getApiBaseUrl();
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const supabaseSecretKey = getSupabaseSecretKey();
  const audioPath = resolve(getRequiredEnv("DEMO_AUDIO_PATH"));
  const referencePath = resolve(getRequiredEnv("DEMO_REFERENCE_PATH"));
  const expectedSpeakers = Number.parseInt(
    getRequiredEnv("DEMO_EXPECTED_SPEAKERS"),
    10,
  );
  const extension = extname(audioPath).toLocaleLowerCase();
  const mimeType = mimeByExtension.get(extension);

  assert(
    supabaseSecretKey,
    "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required.",
  );
  assert(
    Number.isInteger(expectedSpeakers) && expectedSpeakers > 0,
    "DEMO_EXPECTED_SPEAKERS must be a positive integer.",
  );
  assert(mimeType, `Unsupported demo audio extension: ${extension}`);

  const client = createVerificationSupabaseClient(supabaseUrl, supabaseSecretKey);
  const audio = await readFile(audioPath);
  const referenceRaw = await readFile(referencePath, "utf8");
  const reference = cleanupReferenceText(referenceRaw);
  let meetingId = null;
  let storageBucket = null;
  let storagePath = null;

  const safeEvidence = {
    apiBaseUrl,
    title: VERIFICATION_TITLE,
    audioBytes: audio.length,
    audioExtension: extension,
    expectedSpeakers,
    healthStatus: null,
    previousCleanup: null,
    uploadInitializationStatus: null,
    tusBytesUploaded: null,
    progressCallbackCount: 0,
    completionStatus: null,
    transcribeStatus: null,
    idempotentStatus: null,
    idempotentAlreadyTranscribed: null,
    detailStatus: null,
    finalMeetingStatus: null,
    meetingId: null,
    deepgramRequestId: null,
    modelName: null,
    diarizeModel: null,
    language: null,
    speakerCount: null,
    transcriptSegmentCount: null,
    wordCount: null,
    aggregateConfidence: null,
    transcriptCharacterCount: null,
    transcriptExcerpt: null,
    temporaryHypothesisRemoved: false,
    durationSeconds: null,
    processingTimeMs: null,
    transcriptionDurationMs: null,
    totalDurationMs: null,
    referenceWordCount: null,
    hypothesisWordCount: null,
    substitutions: null,
    deletions: null,
    insertions: null,
    wordErrorRatePercent: null,
    wordAccuracyPercent: null,
    belowTenPercentWer: null,
    retainedSuccessfulMeeting: false,
    cleanup: null,
  };
  let temporaryHypothesisPath = null;

  try {
    safeEvidence.previousCleanup = await cleanupPreviousVerificationRecords(client);

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
    assert(
      health.payload?.dependencies?.deepgramConfigured === true,
      "Deepgram is not configured in API health output.",
    );

    const init = await requestJson(apiBaseUrl, "/meetings/upload", {
      method: "POST",
      body: JSON.stringify({
        title: VERIFICATION_TITLE,
        fileName: basename(audioPath),
        mimeType,
        fileSizeBytes: audio.length,
        recordedAt: new Date().toISOString(),
        language: "en",
        knownParticipants: ["Speaker 1", "Speaker 2"],
        technicalTerms: [
          "ScribeFlow",
          "Deepgram",
          "Supabase",
          "Instagram",
          "auditorium",
          "Bluetooth",
          "promotional video",
          "camera",
        ],
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
    assert(upload?.protocol === "tus", "Upload protocol was not TUS.");
    assert(
      upload.chunkSizeBytes === REQUIRED_CHUNK_SIZE_BYTES,
      "TUS chunk size was not 6 MiB.",
    );

    meetingId = meeting.id;
    storageBucket = upload.bucket;
    storagePath = upload.objectPath;
    safeEvidence.meetingId = meeting.id;

    const tusResult = await runTusUpload(audio, upload, mimeType);
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
      { method: "POST" },
    );
    safeEvidence.completionStatus = complete.response.status;
    assert(
      complete.response.ok,
      `Upload completion returned HTTP ${complete.response.status}.`,
    );
    assert(
      complete.payload?.meeting?.status === "created",
      "Uploaded meeting was not ready for transcription.",
    );

    const transcribeStartedAt = Date.now();
    const transcribe = await requestJson(
      apiBaseUrl,
      `/meetings/${meeting.id}/transcribe`,
      { method: "POST" },
    );
    safeEvidence.transcribeStatus = transcribe.response.status;
    assert(
      transcribe.response.ok,
      `Transcription returned HTTP ${transcribe.response.status}.`,
    );
    assert(
      transcribe.payload?.meeting?.status === "transcribed",
      "Meeting was not marked transcribed.",
    );
    assert(
      transcribe.payload?.alreadyTranscribed === false,
      "First transcription call unexpectedly reported alreadyTranscribed.",
    );
    assert(
      Array.isArray(transcribe.payload?.speakers),
      "Transcription response did not include speakers.",
    );
    assert(
      transcribe.payload.speakers.length === expectedSpeakers,
      `Expected ${expectedSpeakers} speakers but received ${transcribe.payload.speakers.length}.`,
    );
    assert(
      Array.isArray(transcribe.payload?.transcriptSegments) &&
        transcribe.payload.transcriptSegments.length > 0,
      "Transcription response did not include transcript segments.",
    );

    const idempotent = await requestJson(
      apiBaseUrl,
      `/meetings/${meeting.id}/transcribe`,
      { method: "POST" },
    );
    safeEvidence.idempotentStatus = idempotent.response.status;
    safeEvidence.idempotentAlreadyTranscribed =
      idempotent.payload?.alreadyTranscribed === true;
    assert(
      idempotent.response.ok && idempotent.payload?.alreadyTranscribed === true,
      "Second transcription call was not idempotent.",
    );

    const detail = await requestJson(apiBaseUrl, `/meetings/${meeting.id}`);
    safeEvidence.detailStatus = detail.response.status;
    assert(
      detail.response.ok,
      `Meeting detail returned HTTP ${detail.response.status}.`,
    );

    const hypothesis = detail.payload.transcriptSegments
      .map((segment) => segment.text)
      .join(" ");
    temporaryHypothesisPath = join(
      tmpdir(),
      `scribeflow-hypothesis-${randomUUID()}.txt`,
    );
    await writeFile(temporaryHypothesisPath, hypothesis, "utf8");
    const hypothesisFromTemp = await readFile(temporaryHypothesisPath, "utf8");
    const wer = calculateWer(reference.text, hypothesisFromTemp);
    const transcription = transcribe.payload.transcription;
    const totalDurationMs = Date.now() - startedAt;

    safeEvidence.finalMeetingStatus = detail.payload.meeting.status;
    safeEvidence.deepgramRequestId = transcription?.requestId ?? null;
    safeEvidence.modelName = transcription?.modelName ?? null;
    safeEvidence.diarizeModel = transcription?.diarizeModel ?? null;
    safeEvidence.language = transcription?.language ?? detail.payload.meeting.language;
    safeEvidence.speakerCount = detail.payload.speakers.length;
    safeEvidence.transcriptSegmentCount = detail.payload.transcriptSegments.length;
    safeEvidence.wordCount = transcription?.wordCount ?? null;
    safeEvidence.aggregateConfidence = transcription?.confidence ?? null;
    safeEvidence.transcriptCharacterCount = hypothesis.length;
    safeEvidence.transcriptExcerpt = hypothesis.split(/\s+/).slice(0, 24).join(" ");
    safeEvidence.durationSeconds = detail.payload.meeting.durationSeconds;
    safeEvidence.processingTimeMs = detail.payload.meeting.processingTimeMs;
    safeEvidence.transcriptionDurationMs = Date.now() - transcribeStartedAt;
    safeEvidence.totalDurationMs = totalDurationMs;
    safeEvidence.referenceWordCount = wer.referenceWordCount;
    safeEvidence.hypothesisWordCount = wer.hypothesisWordCount;
    safeEvidence.substitutions = wer.substitutions;
    safeEvidence.deletions = wer.deletions;
    safeEvidence.insertions = wer.insertions;
    safeEvidence.wordErrorRatePercent = Number((wer.wordErrorRate * 100).toFixed(2));
    safeEvidence.wordAccuracyPercent = Number((wer.wordAccuracy * 100).toFixed(2));
    safeEvidence.belowTenPercentWer = wer.wordErrorRate < 0.1;
    safeEvidence.retainedSuccessfulMeeting = true;
    safeEvidence.temporaryHypothesisRemoved = await removeTemporaryFile(
      temporaryHypothesisPath,
    );
    temporaryHypothesisPath = null;

    assert(
      totalDurationMs <= 120_000,
      `End-to-end verification took ${totalDurationMs}ms.`,
    );
    assert(
      wer.wordErrorRate < 0.1,
      `WER was ${safeEvidence.wordErrorRatePercent}% and did not meet the 10% target.`,
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          evidence: {
            ...safeEvidence,
            referenceCleanup: {
              ...reference.cleanup,
              removedFormattingLineCount:
                reference.cleanup.removedTitleLines +
                reference.cleanup.removedStandaloneSpeakerLabels,
              finalSpokenWordCount: wer.referenceWordCount,
            },
          },
        },
        null,
        2,
      ),
    );
  } catch (error) {
    safeEvidence.temporaryHypothesisRemoved =
      (await removeTemporaryFile(temporaryHypothesisPath)) ||
      safeEvidence.temporaryHypothesisRemoved;

    if (meetingId) {
      safeEvidence.cleanup = await cleanupVerificationRecord({
        client,
        meetingId,
        bucket: storageBucket,
        objectPath: storagePath,
      });
    }

    throw error;
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown Deepgram verification error.",
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
