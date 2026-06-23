import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Meeting,
  AnalyzeMeetingResponse,
  MeetingDetail,
  NormalizedTranscription,
  StructuredMeetingAnalysis,
} from "@scribeflow/shared";
import { createApp } from "../src/app.js";
import type { ApiDependencies } from "../src/dependencies.js";
import type {
  MeetingRepository,
  MeetingAnalysisService,
  StorageService,
  TranscriptionService,
} from "../src/services/interfaces.js";
import { withTestServer } from "./testServer.js";

const meetingId = "11111111-1111-4111-8111-111111111111";
const speakerId = "22222222-2222-4222-8222-222222222222";
const actionItemId = "33333333-3333-4333-8333-333333333333";

const now = "2026-06-11T10:30:00.000Z";
const transcriptSegmentId = "44444444-4444-4444-8444-444444444444";

const structuredAnalysis: StructuredMeetingAnalysis = {
  attendees: ["Speaker 1"],
  executiveOverview: "The meeting covered transcript follow-up.",
  keyDecisions: [
    {
      text: "Use the saved transcript.",
      evidenceSegmentIds: [transcriptSegmentId],
    },
  ],
  discussionPoints: [
    {
      text: "Transcript availability was discussed.",
      evidenceSegmentIds: [transcriptSegmentId],
    },
  ],
  openQuestions: [],
  nextSteps: [
    {
      text: "Share notes.",
      evidenceSegmentIds: [transcriptSegmentId],
    },
  ],
  topics: ["transcript follow-up"],
  actionItems: [
    {
      task: "Share notes",
      ownerName: null,
      deadlineText: null,
      confidence: 0.81,
      evidenceSegmentIds: [transcriptSegmentId],
    },
  ],
};

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

function makeTranscribedDetail(overrides: Partial<MeetingDetail> = {}): MeetingDetail {
  return {
    meeting: makeMeeting({ status: "transcribed", fileSizeBytes: 1000 }),
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
        id: transcriptSegmentId,
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
    summary: null,
    actionItems: [],
    topics: [],
    chunkCount: 0,
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
          id: transcriptSegmentId,
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
    markAnalysisStarted: vi.fn(async () =>
      makeMeeting({
        status: "analysing",
        fileSizeBytes: 1000,
      }),
    ),
    getPersistedMeetingAnalysis: vi.fn(async () => null),
    persistMeetingAnalysis: vi.fn(
      async (
        input: Parameters<MeetingRepository["persistMeetingAnalysis"]>[0],
      ): Promise<AnalyzeMeetingResponse> => ({
        meeting: makeMeeting({
          status: "completed",
          fileSizeBytes: 1000,
          completedAt: now,
        }),
        summary: {
          attendees: input.result.analysis.attendees,
          executiveOverview: input.result.analysis.executiveOverview,
          keyDecisions: input.result.analysis.keyDecisions.map((item) => item.text),
          discussionPoints: input.result.analysis.discussionPoints.map(
            (item) => item.text,
          ),
          openQuestions: input.result.analysis.openQuestions.map((item) => item.text),
          nextSteps: input.result.analysis.nextSteps.map((item) => item.text),
          topics: input.result.analysis.topics,
        },
        topics: input.result.analysis.topics.map((topic, index) => ({
          id: `55555555-5555-4555-8555-55555555555${index}`,
          meetingId,
          normalizedLabel: topic.toLocaleLowerCase(),
          displayLabel: topic,
          confidence: null,
          mentionCount: 1,
          createdAt: now,
          updatedAt: now,
        })),
        actionItems: input.result.analysis.actionItems.map((item) => ({
          id: actionItemId,
          meetingId,
          task: item.task,
          ownerName: item.ownerName,
          ownerSpeakerId: null,
          deadline: null,
          deadlineText: item.deadlineText,
          status: "open" as const,
          confidence: item.confidence,
          sourceSegmentId: item.evidenceSegmentIds[0] ?? null,
          sourceStartMs: 0,
          sourceEndMs: 1000,
          evidenceText: "Hello from the transcript.",
          evidenceSegmentIds: item.evidenceSegmentIds,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        })),
        analysis: input.result.analysis,
        provider: "gemini",
        modelName: input.result.modelName,
        responseId: input.result.responseId,
        processingTimeMs: input.result.processingTimeMs,
        alreadyAnalysed: false,
      }),
    ),
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
      evidenceSegmentIds: [],
      completedAt: input.status === "completed" ? now : null,
      createdAt: now,
      updatedAt: now,
    })),
    getMeetingAnalytics: vi.fn(async () => null),
    getCrossMeetingAnalytics: vi.fn(async () => ({
      totals: {
        meetingCount: 0,
        completedMeetingCount: 0,
        actionItemCount: 0,
        completedActionItemCount: 0,
        completionRate: 0,
        totalSpeakingSeconds: 0,
      },
      meetingFrequency: [],
      topRecurringTopics: [],
      speakerParticipation: [],
      actionItemCompletion: [],
    })),
    ...overrides,
  };

  return repository;
}

type IndexingServiceDouble = {
  indexMeeting: ReturnType<typeof vi.fn>;
};

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

function makeMeetingAnalysisService(
  overrides: Partial<MeetingAnalysisService> = {},
): MeetingAnalysisService {
  return {
    isConfigured: vi.fn(() => true),
    analyseMeeting: vi.fn(async () => ({
      analysis: structuredAnalysis,
      provider: "gemini" as const,
      modelName: "gemini-2.5-flash",
      responseId: "gemini-response-123",
      processingTimeMs: 1234,
    })),
    ...overrides,
  };
}

function createMockedApp(
  repository = makeRepository(),
  storage = makeStorage(),
  transcriptionService = makeTranscriptionService(),
  meetingAnalysisService = makeMeetingAnalysisService(),
  meetingIndexingService?: IndexingServiceDouble,
) {
  const dependencies: ApiDependencies = {
    getMeetingRepository: () => repository,
    getStorageService: () => storage,
    getTranscriptionService: () => transcriptionService,
    getMeetingAnalysisService: () => meetingAnalysisService,
    getMeetingIndexingService: () =>
      (meetingIndexingService ?? {
        indexMeeting: () => {
          throw new Error("getMeetingIndexingService not implemented in test");
        },
      }) as unknown as ReturnType<ApiDependencies["getMeetingIndexingService"]>,
    getMeetingSearchService: () => {
      throw new Error("getMeetingSearchService not implemented in test");
    },
  };

  return {
    app: createApp(dependencies),
    repository,
    storage,
    transcriptionService,
    meetingAnalysisService,
    meetingIndexingService,
  };
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

  it("analyzes transcribed meetings and persists summary, topics and action items", async () => {
    const repository = makeRepository({
      getMeetingDetail: vi.fn(async () => makeTranscribedDetail()),
    });
    const meetingAnalysisService = makeMeetingAnalysisService();
    const { app } = createMockedApp(
      repository,
      makeStorage(),
      makeTranscriptionService(),
      meetingAnalysisService,
    );

    await withTestServer(app, async (baseUrl) => {
      const response = await request(baseUrl)
        .post(`/api/meetings/${meetingId}/analyze`)
        .expect(200);

      expect(response.body.meeting.status).toBe("completed");
      expect(response.body.summary.executiveOverview).toBe(
        "The meeting covered transcript follow-up.",
      );
      expect(response.body.topics).toHaveLength(1);
      expect(response.body.actionItems).toHaveLength(1);
      expect(response.body.actionItems[0]).toMatchObject({
        task: "Share notes",
        ownerName: null,
        deadlineText: null,
        evidenceSegmentIds: [transcriptSegmentId],
      });
      expect(response.body.alreadyAnalysed).toBe(false);
      expect(repository.markAnalysisStarted).toHaveBeenCalledWith(meetingId);
      expect(meetingAnalysisService.analyseMeeting).toHaveBeenCalledWith(
        expect.objectContaining({
          meeting: expect.objectContaining({ status: "transcribed" }),
          segments: expect.arrayContaining([
            expect.objectContaining({ id: transcriptSegmentId }),
          ]),
        }),
      );
      expect(repository.persistMeetingAnalysis).toHaveBeenCalled();
    });
  });

  it("allows retrying Gemini analysis after a stored analysis failure", async () => {
    const failedAnalysisDetail = makeTranscribedDetail({
      meeting: makeMeeting({
        status: "failed",
        fileSizeBytes: 1000,
        errorCode: "MEETING_ANALYSIS_OUTPUT_INVALID",
        errorMessage:
          "Gemini analysis output remained invalid after schema repair retry.",
      }),
    });
    const repository = makeRepository({
      getMeetingDetail: vi.fn(async () => failedAnalysisDetail),
    });
    const meetingAnalysisService = makeMeetingAnalysisService();
    const { app } = createMockedApp(
      repository,
      makeStorage(),
      makeTranscriptionService(),
      meetingAnalysisService,
    );

    await withTestServer(app, async (baseUrl) => {
      const response = await request(baseUrl)
        .post(`/api/meetings/${meetingId}/analyze`)
        .expect(200);

      expect(response.body.meeting.status).toBe("completed");
      expect(repository.markAnalysisStarted).toHaveBeenCalledWith(meetingId);
      expect(meetingAnalysisService.analyseMeeting).toHaveBeenCalledWith(
        expect.objectContaining({
          meeting: expect.objectContaining({
            status: "failed",
            errorCode: "MEETING_ANALYSIS_OUTPUT_INVALID",
          }),
          segments: expect.arrayContaining([
            expect.objectContaining({ id: transcriptSegmentId }),
          ]),
        }),
      );
      expect(repository.persistMeetingAnalysis).toHaveBeenCalled();
    });
  });

  it("returns persisted analysis without calling Gemini again", async () => {
    const persisted = await makeRepository().persistMeetingAnalysis({
      meetingId,
      result: {
        analysis: structuredAnalysis,
        provider: "gemini",
        modelName: "gemini-2.5-flash",
        responseId: "persisted-response",
        processingTimeMs: 100,
      },
    });
    const repository = makeRepository({
      getMeetingDetail: vi.fn(async () => makeTranscribedDetail()),
      getPersistedMeetingAnalysis: vi.fn(async () => ({
        ...persisted,
        alreadyAnalysed: true,
      })),
    });
    const meetingAnalysisService = makeMeetingAnalysisService();
    const { app } = createMockedApp(
      repository,
      makeStorage(),
      makeTranscriptionService(),
      meetingAnalysisService,
    );

    await withTestServer(app, async (baseUrl) => {
      const response = await request(baseUrl)
        .post(`/api/meetings/${meetingId}/analyze`)
        .expect(200);

      expect(response.body.alreadyAnalysed).toBe(true);
      expect(response.body.responseId).toBe("persisted-response");
      expect(meetingAnalysisService.analyseMeeting).not.toHaveBeenCalled();
      expect(repository.markAnalysisStarted).not.toHaveBeenCalled();
    });
  });

  it("rejects missing meetings and meetings without transcript segments", async () => {
    const missingRepository = makeRepository({
      getMeetingDetail: vi.fn(async () => null),
    });
    const missingApp = createMockedApp(missingRepository).app;

    await withTestServer(missingApp, async (baseUrl) => {
      const response = await request(baseUrl)
        .post(`/api/meetings/${meetingId}/analyze`)
        .expect(404);

      expect(response.body.error.code).toBe("MEETING_NOT_FOUND");
    });

    const emptyTranscriptRepository = makeRepository({
      getMeetingDetail: vi.fn(async () =>
        makeTranscribedDetail({ transcriptSegments: [] }),
      ),
    });
    const emptyTranscriptApp = createMockedApp(emptyTranscriptRepository).app;

    await withTestServer(emptyTranscriptApp, async (baseUrl) => {
      const response = await request(baseUrl)
        .post(`/api/meetings/${meetingId}/analyze`)
        .expect(409);

      expect(response.body.error.code).toBe("INVALID_MEETING_STATE");
      expect(emptyTranscriptRepository.markAnalysisStarted).not.toHaveBeenCalled();
    });
  });

  it("marks analysis failures safely while preserving transcript state", async () => {
    const repository = makeRepository({
      getMeetingDetail: vi.fn(async () => makeTranscribedDetail()),
    });
    const meetingAnalysisService = makeMeetingAnalysisService({
      analyseMeeting: vi.fn(async () => {
        throw new Error("provider details should not leak");
      }),
    });
    const { app } = createMockedApp(
      repository,
      makeStorage(),
      makeTranscriptionService(),
      meetingAnalysisService,
    );

    await withTestServer(app, async (baseUrl) => {
      const response = await request(baseUrl)
        .post(`/api/meetings/${meetingId}/analyze`)
        .expect(502);

      expect(response.body.error.code).toBe("GEMINI_REQUEST_FAILED");
      expect(repository.markMeetingFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          meetingId,
          errorCode: "MEETING_ANALYSIS_OUTPUT_INVALID",
          errorMessage: "Gemini meeting analysis failed.",
        }),
      );
      expect(repository.persistMeetingAnalysis).not.toHaveBeenCalled();
    });
  });

  it("indexes the meeting for semantic search after analysis completes", async () => {
    const indexMeeting = vi.fn(async () => ({
      meetingId,
      chunkCount: 4,
      embeddingDimensions: 768,
      embeddingModel: "gemini-embedding",
      indexedAt: now,
      idempotent: false,
    }));
    const completedDetail = makeTranscribedDetail({
      meeting: makeMeeting({
        status: "completed",
        fileSizeBytes: 1000,
        completedAt: now,
      }),
      chunkCount: 0,
    });
    const getMeetingDetail = vi.fn();
    // First fetch (analyze handler) sees a transcribed meeting; the post-persist
    // re-fetch in ensureMeetingIndexed sees the completed, unindexed meeting.
    getMeetingDetail.mockResolvedValueOnce(makeTranscribedDetail());
    getMeetingDetail.mockResolvedValue(completedDetail);

    const repository = makeRepository({ getMeetingDetail });
    const { app } = createMockedApp(
      repository,
      makeStorage(),
      makeTranscriptionService(),
      makeMeetingAnalysisService(),
      { indexMeeting },
    );

    await withTestServer(app, async (baseUrl) => {
      await request(baseUrl).post(`/api/meetings/${meetingId}/analyze`).expect(200);
      expect(indexMeeting).toHaveBeenCalledOnce();
    });
  });

  it("does not fail analysis when automatic indexing throws", async () => {
    const indexMeeting = vi.fn(async () => {
      throw new Error("embedding provider down");
    });
    const completedDetail = makeTranscribedDetail({
      meeting: makeMeeting({
        status: "completed",
        fileSizeBytes: 1000,
        completedAt: now,
      }),
      chunkCount: 0,
    });
    const getMeetingDetail = vi.fn();
    getMeetingDetail.mockResolvedValueOnce(makeTranscribedDetail());
    getMeetingDetail.mockResolvedValue(completedDetail);

    const repository = makeRepository({ getMeetingDetail });
    const { app } = createMockedApp(
      repository,
      makeStorage(),
      makeTranscriptionService(),
      makeMeetingAnalysisService(),
      { indexMeeting },
    );

    await withTestServer(app, async (baseUrl) => {
      const response = await request(baseUrl)
        .post(`/api/meetings/${meetingId}/analyze`)
        .expect(200);

      expect(response.body.meeting.status).toBe("completed");
      expect(indexMeeting).toHaveBeenCalledOnce();
    });
  });

  it("returns cross-meeting analytics", async () => {
    const repository = makeRepository({
      getCrossMeetingAnalytics: vi.fn(async () => ({
        totals: {
          meetingCount: 3,
          completedMeetingCount: 2,
          actionItemCount: 5,
          completedActionItemCount: 3,
          completionRate: 60,
          totalSpeakingSeconds: 1200,
        },
        meetingFrequency: [
          { date: "2026-06-10", value: 1 },
          { date: "2026-06-11", value: 2 },
        ],
        topRecurringTopics: [{ topic: "Roadmap", count: 4 }],
        speakerParticipation: [{ displayName: "Priya", totalSpeakingSeconds: 800 }],
        actionItemCompletion: [
          { date: "2026-06-11", openCount: 2, completedCount: 3, completionRate: 60 },
        ],
      })),
    });
    const { app } = createMockedApp(repository);

    await withTestServer(app, async (baseUrl) => {
      const response = await request(baseUrl).get("/api/analytics").expect(200);

      expect(response.body.totals.meetingCount).toBe(3);
      expect(response.body.totals.completionRate).toBe(60);
      expect(response.body.topRecurringTopics[0]).toMatchObject({
        topic: "Roadmap",
        count: 4,
      });
      expect(repository.getCrossMeetingAnalytics).toHaveBeenCalled();
    });
  });

  it("returns per-meeting analytics and 404s when absent", async () => {
    const repository = makeRepository({
      getMeetingAnalytics: vi.fn(async () => ({
        durationSeconds: 600,
        participantCount: 2,
        speakingBreakdown: [
          {
            speakerId,
            displayName: "Speaker 1",
            totalSpeakingSeconds: 300,
            speakingPercentage: 50,
          },
        ],
        actionItemCount: 2,
        completedActionItemCount: 1,
        completionRate: 50,
        topics: [{ topic: "Roadmap", count: 3 }],
      })),
    });
    const { app } = createMockedApp(repository);

    await withTestServer(app, async (baseUrl) => {
      const response = await request(baseUrl)
        .get(`/api/meetings/${meetingId}/analytics`)
        .expect(200);

      expect(response.body.participantCount).toBe(2);
      expect(response.body.completionRate).toBe(50);
    });

    const missingApp = createMockedApp(
      makeRepository({ getMeetingAnalytics: vi.fn(async () => null) }),
    ).app;

    await withTestServer(missingApp, async (baseUrl) => {
      const response = await request(baseUrl)
        .get(`/api/meetings/${meetingId}/analytics`)
        .expect(404);
      expect(response.body.error.code).toBe("MEETING_NOT_FOUND");
    });
  });
});
