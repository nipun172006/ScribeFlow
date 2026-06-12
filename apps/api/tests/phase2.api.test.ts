import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Meeting,
  MeetingDetail,
  NormalizedTranscription,
} from "@scribeflow/shared";
import { createApp } from "../src/app.js";
import type { ApiDependencies } from "../src/dependencies.js";
import type {
  MeetingRepository,
  StorageService,
  TranscriptionService,
} from "../src/services/interfaces.js";
import { withTestServer } from "./testServer.js";

const meetingId = "11111111-1111-4111-8111-111111111111";
const speakerId = "22222222-2222-4222-8222-222222222222";
const actionItemId = "33333333-3333-4333-8333-333333333333";

const now = "2026-06-11T10:30:00.000Z";

function makeMeeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: meetingId,
    title: "Weekly Product Meeting",
    sourceType: "upload",
    status: "uploading",
    originalFileName: "meeting-audio.m4a",
    storageBucket: "meeting-audio",
    storagePath: `${meetingId}/audio.m4a`,
    mimeType: "audio/mp4",
    expectedFileSizeBytes: 1000,
    fileSizeBytes: null,
    durationSeconds: null,
    language: "en",
    recordedAt: now,
    processingStartedAt: null,
    uploadCompletedAt: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    processingTimeMs: null,
    knownParticipants: ["Arjun", "Priya"],
    technicalTerms: ["Supabase"],
    errorCode: null,
    errorMessage: null,
    metadata: {},
    ...overrides,
  };
}

function makeRepository(overrides: Partial<MeetingRepository> = {}) {
  const repository: MeetingRepository = {
    createUploadMeeting: vi.fn(async () => makeMeeting()),
    createLiveMeeting: vi.fn(async (input) =>
      makeMeeting({
        sourceType: "live",
        status: "created",
        title: input.title,
        originalFileName: null,
        storageBucket: null,
        storagePath: null,
        expectedFileSizeBytes: null,
        mimeType: null,
      }),
    ),
    markUploadCompleted: vi.fn(async (input) =>
      makeMeeting({
        status: "created",
        fileSizeBytes: input.fileSizeBytes,
        mimeType: input.mimeType,
        uploadCompletedAt: now,
      }),
    ),
    markMeetingFailed: vi.fn(async (input) =>
      makeMeeting({
        status: "failed",
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
      }),
    ),
    markTranscriptionStarted: vi.fn(async () =>
      makeMeeting({
        status: "transcribing",
        fileSizeBytes: 1000,
        processingStartedAt: now,
      }),
    ),
    replaceMeetingTranscription: vi.fn(async (input) => ({
      meeting: makeMeeting({
        status: "transcribed",
        fileSizeBytes: 1000,
        durationSeconds: input.transcription.durationSeconds,
        processingStartedAt: input.processingStartedAt,
        processingTimeMs: input.processingTimeMs,
      }),
      speakers: [
        {
          id: speakerId,
          meetingId,
          rawSpeakerIndex: 0,
          displayName: "Speaker 1",
          totalSpeakingSeconds: 1,
          speakingPercentage: 100,
          createdAt: now,
          updatedAt: now,
        },
      ],
      transcriptSegments: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          meetingId,
          speakerId,
          rawSpeakerIndex: 0,
          segmentIndex: 0,
          startMs: 0,
          endMs: 1000,
          text: "Hello from the transcript.",
          confidence: 0.98,
          words: [],
        },
      ],
      transcription: {
        provider: "deepgram" as const,
        requestId: input.transcription.providerRequestId,
        modelName: input.transcription.modelName,
        diarizeModel: input.transcription.diarizeModel,
        language: input.transcription.language,
        durationSeconds: input.transcription.durationSeconds,
        speakerCount: input.transcription.speakers.length,
        segmentCount: input.transcription.segments.length,
        wordCount: input.transcription.wordCount,
        confidence: input.transcription.confidence,
        processingTimeMs: input.processingTimeMs,
      },
      alreadyTranscribed: false,
    })),
    listMeetings: vi.fn(async () => ({
      items: [makeMeeting({ status: "created", fileSizeBytes: 1000 })],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      },
    })),
    getMeetingById: vi.fn(async () => makeMeeting()),
    getMeetingDetail: vi.fn(
      async (): Promise<MeetingDetail> => ({
        meeting: makeMeeting({ status: "created", fileSizeBytes: 1000 }),
        speakers: [],
        transcriptSegments: [],
        summary: null,
        actionItems: [],
        topics: [],
        chunkCount: 0,
      }),
    ),
    updateSpeakerName: vi.fn(async (input) => ({
      id: input.speakerId,
      meetingId: input.meetingId,
      rawSpeakerIndex: 0,
      displayName: input.displayName,
      totalSpeakingSeconds: 0,
      speakingPercentage: 0,
      createdAt: now,
      updatedAt: now,
    })),
    updateActionItemStatus: vi.fn(async (input) => ({
      id: input.actionItemId,
      meetingId,
      task: "Share notes",
      ownerName: null,
      ownerSpeakerId: null,
      deadline: null,
      deadlineText: null,
      status: input.status,
      confidence: null,
      sourceSegmentId: null,
      sourceStartMs: null,
      sourceEndMs: null,
      evidenceText: null,
      completedAt: input.status === "completed" ? now : null,
      createdAt: now,
      updatedAt: now,
    })),
    getMeetingAnalytics: vi.fn(async () => null),
    ...overrides,
  };

  return repository;
}

function makeStorage(overrides: Partial<StorageService> = {}) {
  const storage: StorageService = {
    createSignedResumableUpload: vi.fn(async (input) => ({
      protocol: "tus" as const,
      endpoint:
        "https://project-ref.storage.supabase.co/storage/v1/upload/resumable/sign",
      bucket: input.bucket,
      objectPath: input.objectPath,
      token: "signed-test-token",
      chunkSizeBytes: 6 * 1024 * 1024,
      expiresInSeconds: 7200,
    })),
    getObjectInfo: vi.fn(async (input) => ({
      bucket: input.bucket,
      path: input.objectPath,
      sizeBytes: 1000,
      mimeType: "audio/mp4",
      updatedAt: now,
    })),
    removeObject: vi.fn(async () => undefined),
    createSignedDownloadUrl: vi.fn(async () => "https://download.example/signed"),
    ...overrides,
  };

  return storage;
}

function makeTranscriptionService(
  overrides: Partial<TranscriptionService> = {},
): TranscriptionService {
  const transcription: NormalizedTranscription = {
    providerRequestId: "dg-request-123",
    language: "en",
    durationSeconds: 1,
    modelName: "nova-3",
    diarizeModel: "latest",
    confidence: 0.98,
    wordCount: 4,
    speakers: [
      {
        rawSpeakerIndex: 0,
        displayName: "Speaker 1",
        totalSpeakingSeconds: 1,
        speakingPercentage: 100,
      },
    ],
    segments: [
      {
        segmentIndex: 0,
        rawSpeakerIndex: 0,
        startMs: 0,
        endMs: 1000,
        text: "Hello from the transcript.",
        confidence: 0.98,
        words: [],
      },
    ],
  };

  return {
    isConfigured: vi.fn(() => true),
    transcribeRecording: vi.fn(async () => transcription),
    ...overrides,
  };
}

function createMockedApp(
  repository = makeRepository(),
  storage = makeStorage(),
  transcriptionService = makeTranscriptionService(),
) {
  const dependencies: ApiDependencies = {
    getMeetingRepository: () => repository,
    getStorageService: () => storage,
    getTranscriptionService: () => transcriptionService,
  };

  return { app: createApp(dependencies), repository, storage, transcriptionService };
}

describe("Phase 2 persistence API", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 503 for Supabase-backed endpoints when Supabase is not configured", async () => {
    vi.resetModules();
    vi.stubEnv("LOG_LEVEL", "silent");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { createApp: createIsolatedApp } = await import("../src/app.js");

    await withTestServer(createIsolatedApp(), async (baseUrl) => {
      const response = await request(baseUrl).get("/api/meetings").expect(503);

      expect(response.body).toMatchObject({
        error: {
          code: "SUPABASE_NOT_CONFIGURED",
          message: "Supabase persistence is not configured on the server.",
        },
      });
      expect(typeof response.body.error.requestId).toBe("string");
    });
  });

  it("rejects invalid upload initialization requests", async () => {
    const { app } = createMockedApp();

    await withTestServer(app, async (baseUrl) => {
      const response = await request(baseUrl)
        .post("/api/meetings/upload")
        .send({ title: "", fileName: "", mimeType: "audio/mp4", fileSizeBytes: 1 })
        .expect(400);

      expect(response.body.error.code).toBe("BAD_REQUEST");
    });
  });

  it("rejects unsupported MIME types and oversized files", async () => {
    const { app } = createMockedApp();

    await withTestServer(app, async (baseUrl) => {
      const unsupportedMime = await request(baseUrl)
        .post("/api/meetings/upload")
        .send({
          title: "Weekly",
          fileName: "meeting.m4a",
          mimeType: "text/plain",
          fileSizeBytes: 1,
        })
        .expect(415);

      expect(unsupportedMime.body.error.code).toBe("UNSUPPORTED_MIME_TYPE");

      const oversized = await request(baseUrl)
        .post("/api/meetings/upload")
        .send({
          title: "Weekly",
          fileName: "meeting.m4a",
          mimeType: "audio/mp4",
          fileSizeBytes: 262_144_001,
        })
        .expect(413);

      expect(oversized.body.error.code).toBe("FILE_TOO_LARGE");
    });
  });

  it("initializes upload meetings and returns signed TUS instructions", async () => {
    const repository = makeRepository();
    const storage = makeStorage();
    const { app } = createMockedApp(repository, storage);

    await withTestServer(app, async (baseUrl) => {
      const response = await request(baseUrl)
        .post("/api/meetings/upload")
        .send({
          title: "Weekly Product Meeting",
          fileName: "meeting-audio.m4a",
          mimeType: "audio/mp4",
          fileSizeBytes: 1000,
          recordedAt: now,
          language: "en",
          knownParticipants: ["Arjun", "Priya", "Arjun"],
          technicalTerms: ["Supabase"],
        })
        .expect(201);

      expect(response.body.meeting.status).toBe("uploading");
      expect(response.body.upload).toMatchObject({
        protocol: "tus",
        bucket: "meeting-audio",
        token: "signed-test-token",
        chunkSizeBytes: 6 * 1024 * 1024,
      });
      expect(response.body.upload.endpoint).toMatch(
        /\/storage\/v1\/upload\/resumable\/sign$/,
      );
      expect(JSON.stringify(response.body.upload)).not.toContain(
        "sb_secret_fake_backend_key",
      );
      expect(repository.createUploadMeeting).toHaveBeenCalledWith(
        expect.objectContaining({
          knownParticipants: ["Arjun", "Priya"],
          technicalTerms: ["Supabase"],
        }),
      );
    });
  });

  it("confirms completed uploads after storage metadata matches", async () => {
    const repository = makeRepository();
    const storage = makeStorage();
    const { app } = createMockedApp(repository, storage);

    await withTestServer(app, async (baseUrl) => {
      const response = await request(baseUrl)
        .post(`/api/meetings/${meetingId}/upload/complete`)
        .expect(200);

      expect(response.body.meeting.status).toBe("created");
      expect(repository.markUploadCompleted).toHaveBeenCalledWith({
        meetingId,
        fileSizeBytes: 1000,
        mimeType: "audio/mp4",
      });
    });
  });

  it("marks uploads failed when storage metadata does not match", async () => {
    const repository = makeRepository();
    const storage = makeStorage({
      getObjectInfo: vi.fn(async (input) => ({
        bucket: input.bucket,
        path: input.objectPath,
        sizeBytes: 999,
        mimeType: "audio/mp4",
        updatedAt: now,
      })),
    });
    const { app } = createMockedApp(repository, storage);

    await withTestServer(app, async (baseUrl) => {
      const response = await request(baseUrl)
        .post(`/api/meetings/${meetingId}/upload/complete`)
        .expect(502);

      expect(response.body.error.code).toBe("STORAGE_METADATA_MISMATCH");
      expect(storage.removeObject).toHaveBeenCalled();
      expect(repository.markMeetingFailed).toHaveBeenCalledWith(
        expect.objectContaining({ errorCode: "STORAGE_METADATA_MISMATCH" }),
      );
    });
  });

  it("lists meetings, returns detail 404s, creates live meetings, renames speakers and updates action items", async () => {
    const repository = makeRepository({
      getMeetingDetail: vi.fn(async () => null),
    });
    const { app } = createMockedApp(repository);

    await withTestServer(app, async (baseUrl) => {
      const listResponse = await request(baseUrl).get("/api/meetings").expect(200);
      expect(listResponse.body.pagination.totalItems).toBe(1);

      const detailResponse = await request(baseUrl)
        .get(`/api/meetings/${meetingId}`)
        .expect(404);
      expect(detailResponse.body.error.code).toBe("MEETING_NOT_FOUND");

      const liveResponse = await request(baseUrl)
        .post("/api/meetings/live")
        .send({ title: "Live Sprint Planning", language: "en" })
        .expect(201);
      expect(liveResponse.body.meeting.sourceType).toBe("live");

      const speakerResponse = await request(baseUrl)
        .patch(`/api/meetings/${meetingId}/speakers/${speakerId}`)
        .send({ displayName: "Priya" })
        .expect(200);
      expect(speakerResponse.body.speaker.displayName).toBe("Priya");

      const actionResponse = await request(baseUrl)
        .patch(`/api/action-items/${actionItemId}`)
        .send({ status: "completed" })
        .expect(200);
      expect(actionResponse.body.actionItem.status).toBe("completed");
      expect(actionResponse.body.actionItem.completedAt).toBe(now);
    });
  });

  it("transcribes uploaded meetings through the transcription service boundary", async () => {
    const repository = makeRepository();
    const storage = makeStorage();
    const transcriptionService = makeTranscriptionService();
    const { app } = createMockedApp(repository, storage, transcriptionService);

    await withTestServer(app, async (baseUrl) => {
      const response = await request(baseUrl)
        .post(`/api/meetings/${meetingId}/transcribe`)
        .expect(200);

      expect(response.body.meeting.status).toBe("transcribed");
      expect(response.body.alreadyTranscribed).toBe(false);
      expect(response.body.transcription).toMatchObject({
        provider: "deepgram",
        requestId: "dg-request-123",
        modelName: "nova-3",
        diarizeModel: "latest",
        wordCount: 4,
      });
      expect(response.body.transcriptSegments).toHaveLength(1);
      expect(storage.createSignedDownloadUrl).toHaveBeenCalledWith({
        bucket: "meeting-audio",
        objectPath: `${meetingId}/audio.m4a`,
      });
      expect(transcriptionService.transcribeRecording).toHaveBeenCalledWith(
        expect.objectContaining({
          language: "en",
          knownParticipants: ["Arjun", "Priya"],
          technicalTerms: ["Supabase"],
        }),
      );
      expect(repository.markTranscriptionStarted).toHaveBeenCalledWith(meetingId);
      expect(repository.replaceMeetingTranscription).toHaveBeenCalled();
    });
  });

  it("does not call Deepgram again when a transcript already exists", async () => {
    const repository = makeRepository({
      getMeetingDetail: vi.fn(async () => ({
        meeting: makeMeeting({ status: "transcribed", fileSizeBytes: 1000 }),
        speakers: [],
        transcriptSegments: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            meetingId,
            speakerId: null,
            rawSpeakerIndex: 0,
            segmentIndex: 0,
            startMs: 0,
            endMs: 1000,
            text: "Already saved.",
            confidence: null,
            words: [],
          },
        ],
        summary: null,
        actionItems: [],
        topics: [],
        chunkCount: 0,
      })),
    });
    const transcriptionService = makeTranscriptionService();
    const { app } = createMockedApp(repository, makeStorage(), transcriptionService);

    await withTestServer(app, async (baseUrl) => {
      const response = await request(baseUrl)
        .post(`/api/meetings/${meetingId}/transcribe`)
        .expect(200);

      expect(response.body.alreadyTranscribed).toBe(true);
      expect(response.body.transcription).toMatchObject({
        provider: "deepgram",
        speakerCount: 0,
        segmentCount: 1,
      });
      expect(transcriptionService.transcribeRecording).not.toHaveBeenCalled();
      expect(repository.markTranscriptionStarted).not.toHaveBeenCalled();
    });
  });

  it("rejects transcription when upload is incomplete or Deepgram is not configured", async () => {
    const incompleteRepository = makeRepository({
      getMeetingDetail: vi.fn(async () => ({
        meeting: makeMeeting({ status: "uploading" }),
        speakers: [],
        transcriptSegments: [],
        summary: null,
        actionItems: [],
        topics: [],
        chunkCount: 0,
      })),
    });
    const incompleteApp = createMockedApp(incompleteRepository).app;

    await withTestServer(incompleteApp, async (baseUrl) => {
      const response = await request(baseUrl)
        .post(`/api/meetings/${meetingId}/transcribe`)
        .expect(409);

      expect(response.body.error.code).toBe("UPLOAD_NOT_COMPLETE");
    });

    const unconfiguredRepository = makeRepository({
      getMeetingDetail: vi.fn(async () => ({
        meeting: makeMeeting({ status: "created", fileSizeBytes: 1000 }),
        speakers: [],
        transcriptSegments: [],
        summary: null,
        actionItems: [],
        topics: [],
        chunkCount: 0,
      })),
    });
    const unconfiguredApp = createMockedApp(
      unconfiguredRepository,
      makeStorage(),
      makeTranscriptionService({ isConfigured: vi.fn(() => false) }),
    ).app;

    await withTestServer(unconfiguredApp, async (baseUrl) => {
      const response = await request(baseUrl)
        .post(`/api/meetings/${meetingId}/transcribe`)
        .expect(503);

      expect(response.body.error.code).toBe("DEEPGRAM_NOT_CONFIGURED");
      expect(unconfiguredRepository.markTranscriptionStarted).not.toHaveBeenCalled();
    });
  });
});
