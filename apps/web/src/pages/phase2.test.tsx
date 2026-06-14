import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Meeting, MeetingDetail, UploadInstructions } from "@scribeflow/shared";
import { renderWithProviders } from "../test/renderWithProviders";
import { ArchivePage } from "./ArchivePage";
import { MeetingDetailPage } from "./MeetingDetailPage";
import { NewMeetingPage } from "./NewMeetingPage";
import { ProcessingPage } from "./ProcessingPage";

const apiClient = vi.hoisted(() => ({
  initializeUploadMeeting: vi.fn(),
  completeMeetingUpload: vi.fn(),
  failMeetingUpload: vi.fn(),
  createLiveMeeting: vi.fn(),
  listMeetings: vi.fn(),
  getMeetingDetail: vi.fn(),
  transcribeMeeting: vi.fn(),
  analyzeMeeting: vi.fn(),
  renameSpeaker: vi.fn(),
  updateActionItemStatus: vi.fn(),
}));

const tusClient = vi.hoisted(() => ({
  createTusUpload: vi.fn(),
  startTusUploadWithResume: vi.fn(),
}));

vi.mock("../lib/apiClient", () => ({
  ...apiClient,
  ApiClientError: class ApiClientError extends Error {
    status = 500;
    code = "TEST";
    requestId = "test-request";
  },
}));

vi.mock("../lib/tusUpload", () => tusClient);

const meetingId = "11111111-1111-4111-8111-111111111111";
const now = "2026-06-11T10:30:00.000Z";

function makeMeeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: meetingId,
    title: "Weekly Product Meeting",
    sourceType: "upload",
    status: "created",
    originalFileName: "meeting.m4a",
    storageBucket: "meeting-audio",
    storagePath: `${meetingId}/audio.m4a`,
    mimeType: "audio/mp4",
    expectedFileSizeBytes: 100,
    fileSizeBytes: 100,
    durationSeconds: null,
    language: "en",
    recordedAt: now,
    processingStartedAt: null,
    uploadCompletedAt: now,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    processingTimeMs: null,
    knownParticipants: [],
    technicalTerms: [],
    errorCode: null,
    errorMessage: null,
    metadata: {},
    ...overrides,
  };
}

function uploadInstructions(): UploadInstructions {
  return {
    protocol: "tus",
    endpoint:
      "https://project-ref.storage.supabase.co/storage/v1/upload/resumable/sign",
    bucket: "meeting-audio",
    objectPath: `${meetingId}/audio.m4a`,
    token: "signed-token",
    chunkSizeBytes: 6 * 1024 * 1024,
    expiresInSeconds: 7200,
  };
}

describe("Phase 2 frontend integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.listMeetings.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
    });
    apiClient.getMeetingDetail.mockResolvedValue({
      meeting: makeMeeting(),
      speakers: [],
      transcriptSegments: [],
      summary: null,
      actionItems: [],
      topics: [],
      chunkCount: 0,
    } satisfies MeetingDetail);
    apiClient.analyzeMeeting.mockResolvedValue({
      meeting: makeMeeting({ status: "completed" }),
      summary: {
        attendees: ["Priya"],
        executiveOverview: "The team agreed the launch plan is ready.",
        keyDecisions: ["Launch next Friday"],
        discussionPoints: ["Marketing assets"],
        openQuestions: [],
        nextSteps: ["Publish the announcement"],
        topics: ["Launch"],
      },
      topics: [],
      actionItems: [],
      analysis: {
        attendees: ["Priya"],
        executiveOverview: "The team agreed the launch plan is ready.",
        keyDecisions: [
          {
            text: "Launch next Friday",
            evidenceSegmentIds: ["44444444-4444-4444-8444-444444444444"],
          },
        ],
        discussionPoints: [
          {
            text: "Marketing assets",
            evidenceSegmentIds: ["44444444-4444-4444-8444-444444444444"],
          },
        ],
        openQuestions: [],
        nextSteps: [
          {
            text: "Publish the announcement",
            evidenceSegmentIds: ["44444444-4444-4444-8444-444444444444"],
          },
        ],
        topics: ["Launch"],
        actionItems: [],
      },
      provider: "gemini",
      modelName: "gemini-test",
      responseId: "test-response",
      processingTimeMs: 100,
      alreadyAnalysed: false,
    });
    apiClient.updateActionItemStatus.mockResolvedValue({
      actionItem: {
        id: "55555555-5555-4555-8555-555555555555",
        meetingId,
        task: "Publish the announcement",
        ownerName: null,
        ownerSpeakerId: null,
        deadline: null,
        deadlineText: null,
        status: "completed",
        confidence: 0.82,
        sourceSegmentId: "44444444-4444-4444-8444-444444444444",
        sourceStartMs: 0,
        sourceEndMs: 3000,
        evidenceText: "We need posters for the event.",
        evidenceSegmentIds: ["44444444-4444-4444-8444-444444444444"],
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("blocks invalid files before upload initialization", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MemoryRouter>
        <NewMeetingPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/meeting title/i), "Bad upload");
    const input = screen.getByLabelText(/choose file/i, {
      selector: "input",
    });
    await user.upload(input, new File(["text"], "meeting.m4a", { type: "text/plain" }));

    expect(
      screen.getByText(/selected file type is not supported/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload recording/i })).toBeDisabled();
    expect(apiClient.initializeUploadMeeting).not.toHaveBeenCalled();
  });

  it("updates progress from TUS callbacks and confirms upload completion", async () => {
    const user = userEvent.setup();
    apiClient.initializeUploadMeeting.mockResolvedValue({
      meeting: makeMeeting({ status: "uploading" }),
      upload: uploadInstructions(),
    });
    apiClient.completeMeetingUpload.mockResolvedValue({ meeting: makeMeeting() });
    tusClient.createTusUpload.mockImplementation((_file, _instructions, callbacks) => ({
      callbacks,
      abort: vi.fn(),
    }));
    tusClient.startTusUploadWithResume.mockImplementation(async (upload) => {
      upload.callbacks.onProgress(50, 100);
      upload.callbacks.onSuccess();
      return upload;
    });

    renderWithProviders(
      <MemoryRouter>
        <NewMeetingPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/meeting title/i), "Weekly Product Meeting");
    await user.upload(
      screen.getByLabelText(/choose file/i, { selector: "input" }),
      new File(["a".repeat(100)], "meeting.m4a", { type: "audio/mp4" }),
    );
    await user.click(screen.getByRole("button", { name: /upload recording/i }));

    expect(await screen.findByText(/50 b of 100 b/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(apiClient.completeMeetingUpload).toHaveBeenCalledWith(meetingId),
    );
  });

  it("renders archive empty and returned meeting states", async () => {
    renderWithProviders(
      <MemoryRouter>
        <ArchivePage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: /archive is empty/i }),
    ).toBeInTheDocument();

    vi.clearAllMocks();
    apiClient.listMeetings.mockResolvedValue({
      items: [makeMeeting()],
      pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    });

    renderWithProviders(
      <MemoryRouter>
        <ArchivePage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("link", { name: /weekly product meeting/i }),
    ).toBeInTheDocument();
  });

  it("renders meeting detail empty transcript and summary states", async () => {
    renderWithProviders(
      <MemoryRouter initialEntries={[`/meetings/${meetingId}`]}>
        <Routes>
          <Route path="/meetings/:meetingId" element={<MeetingDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/analysis has not been generated yet/i),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /transcript/i }));
    expect(screen.getByText(/transcript unavailable/i)).toBeInTheDocument();
  });

  it("starts real uploaded-audio transcription from the processing page", async () => {
    apiClient.transcribeMeeting.mockResolvedValue({
      meeting: makeMeeting({ status: "transcribed" }),
      speakers: [],
      transcriptSegments: [],
      alreadyTranscribed: false,
    });

    renderWithProviders(
      <MemoryRouter initialEntries={[`/meetings/${meetingId}/processing`]}>
        <Routes>
          <Route path="/meetings/:meetingId/processing" element={<ProcessingPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/recording uploaded successfully/i),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(apiClient.transcribeMeeting).toHaveBeenCalledWith(meetingId),
    );
  });

  it("starts Gemini analysis from the processing page after transcription", async () => {
    const analyzedMeetingId = "66666666-6666-4666-8666-666666666666";
    apiClient.getMeetingDetail.mockResolvedValue({
      meeting: makeMeeting({ id: analyzedMeetingId, status: "transcribed" }),
      speakers: [],
      transcriptSegments: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          meetingId: analyzedMeetingId,
          speakerId: null,
          rawSpeakerIndex: 0,
          segmentIndex: 0,
          startMs: 0,
          endMs: 3000,
          text: "We need posters for the event.",
          confidence: 0.95,
          words: [],
        },
      ],
      summary: null,
      actionItems: [],
      topics: [],
      chunkCount: 0,
    } satisfies MeetingDetail);

    renderWithProviders(
      <MemoryRouter initialEntries={[`/meetings/${analyzedMeetingId}/processing`]}>
        <Routes>
          <Route path="/meetings/:meetingId/processing" element={<ProcessingPage />} />
          <Route path="/meetings/:meetingId" element={<div>Meeting opened</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(apiClient.analyzeMeeting).toHaveBeenCalledWith(analyzedMeetingId),
    );
  });

  it("shows the real analysing state on the processing page", async () => {
    const analyzingMeetingId = "77777777-7777-4777-8777-777777777777";
    apiClient.getMeetingDetail.mockResolvedValue({
      meeting: makeMeeting({ id: analyzingMeetingId, status: "analysing" }),
      speakers: [],
      transcriptSegments: [],
      summary: null,
      actionItems: [],
      topics: [],
      chunkCount: 0,
    } satisfies MeetingDetail);

    renderWithProviders(
      <MemoryRouter initialEntries={[`/meetings/${analyzingMeetingId}/processing`]}>
        <Routes>
          <Route path="/meetings/:meetingId/processing" element={<ProcessingPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/gemini is extracting the summary/i),
    ).toBeInTheDocument();
  });

  it("renders persisted transcript search and deterministic speaker analytics", async () => {
    const user = userEvent.setup();
    apiClient.getMeetingDetail.mockResolvedValue({
      meeting: makeMeeting({ status: "transcribed", durationSeconds: 12 }),
      speakers: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          meetingId,
          rawSpeakerIndex: 0,
          displayName: "Priya",
          totalSpeakingSeconds: 6,
          speakingPercentage: 60,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          meetingId,
          rawSpeakerIndex: 1,
          displayName: "Arjun",
          totalSpeakingSeconds: 4,
          speakingPercentage: 40,
          createdAt: now,
          updatedAt: now,
        },
      ],
      transcriptSegments: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          meetingId,
          speakerId: "22222222-2222-4222-8222-222222222222",
          rawSpeakerIndex: 0,
          segmentIndex: 0,
          startMs: 0,
          endMs: 3000,
          text: "We need posters for the event.",
          confidence: 0.95,
          words: [],
        },
      ],
      summary: null,
      actionItems: [],
      topics: [],
      chunkCount: 0,
    } satisfies MeetingDetail);

    renderWithProviders(
      <MemoryRouter initialEntries={[`/meetings/${meetingId}`]}>
        <Routes>
          <Route path="/meetings/:meetingId" element={<MeetingDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("tab", { name: /transcript/i }));
    expect(screen.getByText(/we need posters for the event/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/search transcript/i), "posters");
    expect(screen.getByText(/we need posters for the event/i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /analytics/i }));
    expect(screen.getByText(/speaking-time distribution/i)).toBeInTheDocument();
    expect(screen.getAllByText("Priya").length).toBeGreaterThan(0);
    expect(screen.getAllByText("60.0%").length).toBeGreaterThan(0);
  });

  it("renders persisted Gemini summary, topics, action items and evidence jump", async () => {
    const user = userEvent.setup();
    const evidenceSegmentId = "44444444-4444-4444-8444-444444444444";
    apiClient.getMeetingDetail.mockResolvedValue({
      meeting: makeMeeting({ status: "completed", durationSeconds: 12 }),
      speakers: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          meetingId,
          rawSpeakerIndex: 0,
          displayName: "Priya",
          totalSpeakingSeconds: 6,
          speakingPercentage: 60,
          createdAt: now,
          updatedAt: now,
        },
      ],
      transcriptSegments: [
        {
          id: evidenceSegmentId,
          meetingId,
          speakerId: "22222222-2222-4222-8222-222222222222",
          rawSpeakerIndex: 0,
          segmentIndex: 0,
          startMs: 0,
          endMs: 3000,
          text: "We need posters for the event.",
          confidence: 0.95,
          words: [],
        },
      ],
      summary: {
        attendees: ["Priya", "Arjun"],
        executiveOverview: "The launch plan is ready.",
        keyDecisions: ["Launch next Friday"],
        discussionPoints: ["Marketing assets"],
        openQuestions: ["Who owns the final review?"],
        nextSteps: ["Publish the announcement"],
        topics: ["Launch"],
      },
      actionItems: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          meetingId,
          task: "Publish the announcement",
          ownerName: null,
          ownerSpeakerId: null,
          deadline: null,
          deadlineText: null,
          status: "open",
          confidence: 0.82,
          sourceSegmentId: evidenceSegmentId,
          sourceStartMs: 0,
          sourceEndMs: 3000,
          evidenceText: "We need posters for the event.",
          evidenceSegmentIds: [evidenceSegmentId],
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
      topics: [
        {
          id: "88888888-8888-4888-8888-888888888888",
          meetingId,
          normalizedLabel: "launch",
          displayLabel: "Launch",
          confidence: 0.9,
          mentionCount: 1,
          createdAt: now,
          updatedAt: now,
        },
      ],
      chunkCount: 0,
    } satisfies MeetingDetail);

    renderWithProviders(
      <MemoryRouter initialEntries={[`/meetings/${meetingId}`]}>
        <Routes>
          <Route path="/meetings/:meetingId" element={<MeetingDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/the launch plan is ready/i)).toBeInTheDocument();
    expect(screen.getByText("Launch")).toBeInTheDocument();
    expect(screen.getByText(/launch next friday/i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /action items/i }));
    expect(screen.getByText(/publish the announcement/i)).toBeInTheDocument();
    expect(screen.getByText(/owner: unassigned/i)).toBeInTheDocument();
    expect(screen.getByText(/deadline: not mentioned/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /complete action item/i }));
    await waitFor(() =>
      expect(apiClient.updateActionItemStatus).toHaveBeenCalledWith(
        "55555555-5555-4555-8555-555555555555",
        { status: "completed" },
      ),
    );

    await user.click(screen.getByRole("button", { name: /jump to evidence/i }));
    expect(screen.getByRole("tab", { name: /transcript/i })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByText(/we need posters for the event/i)).toBeInTheDocument();
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  });

  it("shows a run-analysis empty state when a transcript has no analysis", async () => {
    apiClient.getMeetingDetail.mockResolvedValue({
      meeting: makeMeeting({ status: "transcribed" }),
      speakers: [],
      transcriptSegments: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          meetingId,
          speakerId: null,
          rawSpeakerIndex: 0,
          segmentIndex: 0,
          startMs: 0,
          endMs: 3000,
          text: "We need posters for the event.",
          confidence: 0.95,
          words: [],
        },
      ],
      summary: null,
      actionItems: [],
      topics: [],
      chunkCount: 0,
    } satisfies MeetingDetail);

    renderWithProviders(
      <MemoryRouter initialEntries={[`/meetings/${meetingId}`]}>
        <Routes>
          <Route path="/meetings/:meetingId" element={<MeetingDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/analysis has not been generated yet/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run analysis/i })).toBeInTheDocument();
  });

  it("shows persisted analysis failure on meeting detail and allows retry", async () => {
    const user = userEvent.setup();
    apiClient.getMeetingDetail.mockResolvedValue({
      meeting: makeMeeting({
        status: "failed",
        errorCode: "MEETING_ANALYSIS_OUTPUT_INVALID",
        errorMessage:
          "Gemini analysis output remained invalid after schema repair retry.",
      }),
      speakers: [],
      transcriptSegments: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          meetingId,
          speakerId: null,
          rawSpeakerIndex: 0,
          segmentIndex: 0,
          startMs: 0,
          endMs: 3000,
          text: "We need posters for the event.",
          confidence: 0.95,
          words: [],
        },
      ],
      summary: null,
      actionItems: [],
      topics: [],
      chunkCount: 0,
    } satisfies MeetingDetail);

    renderWithProviders(
      <MemoryRouter initialEntries={[`/meetings/${meetingId}`]}>
        <Routes>
          <Route path="/meetings/:meetingId" element={<MeetingDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/^Analysis failed$/i)).toBeInTheDocument();
    expect(
      screen.getByText(/remained invalid after schema repair retry/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry analysis/i }));

    expect(apiClient.analyzeMeeting).toHaveBeenCalledWith(meetingId);
  });

  it("offers analysis retry instead of transcription retry after analysis failure", async () => {
    const user = userEvent.setup();
    apiClient.getMeetingDetail.mockResolvedValue({
      meeting: makeMeeting({
        status: "failed",
        errorCode: "MEETING_ANALYSIS_OUTPUT_INVALID",
        errorMessage:
          "Gemini analysis output remained invalid after schema repair retry.",
      }),
      speakers: [],
      transcriptSegments: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          meetingId,
          speakerId: null,
          rawSpeakerIndex: 0,
          segmentIndex: 0,
          startMs: 0,
          endMs: 3000,
          text: "We need posters for the event.",
          confidence: 0.95,
          words: [],
        },
      ],
      summary: null,
      actionItems: [],
      topics: [],
      chunkCount: 0,
    } satisfies MeetingDetail);

    renderWithProviders(
      <MemoryRouter initialEntries={[`/meetings/${meetingId}/processing`]}>
        <Routes>
          <Route path="/meetings/:meetingId/processing" element={<ProcessingPage />} />
          <Route path="/meetings/:meetingId" element={<MeetingDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/^Analysis failed$/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /retry transcription/i }),
    ).not.toBeInTheDocument();
    const retryButtons = screen.getAllByRole("button", { name: /retry analysis/i });

    await user.click(retryButtons[0]!);

    expect(apiClient.analyzeMeeting).toHaveBeenCalledWith(meetingId);
  });

  it("jumps to transcript segment automatically if segmentId is in URL", async () => {
    const targetSegmentId = "44444444-4444-4444-8444-444444444444";
    apiClient.getMeetingDetail.mockResolvedValue({
      meeting: makeMeeting({ status: "completed" }),
      speakers: [],
      transcriptSegments: [
        {
          id: targetSegmentId,
          meetingId,
          speakerId: null,
          rawSpeakerIndex: 0,
          segmentIndex: 0,
          startMs: 0,
          endMs: 3000,
          text: "This segment should be highlighted.",
          confidence: 0.95,
          words: [],
        },
      ],
      summary: null,
      actionItems: [],
      topics: [],
      chunkCount: 0,
    } satisfies MeetingDetail);

    renderWithProviders(
      <MemoryRouter
        initialEntries={[`/meetings/${meetingId}?segmentId=${targetSegmentId}`]}
      >
        <Routes>
          <Route path="/meetings/:meetingId" element={<MeetingDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Should switch to transcript tab automatically
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /transcript/i })).toHaveAttribute(
        "data-state",
        "active",
      );
    });
    expect(screen.getByText("This segment should be highlighted.")).toBeInTheDocument();

    // Verify it attempted to scroll
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  });

  describe("Live recording mode", () => {
    let mockGetUserMedia: ReturnType<typeof vi.fn>;
    const mockStop = vi.fn();
    const mockStream = {
      getTracks: () => [{ stop: mockStop }],
    } as unknown as MediaStream;

    class MockMediaRecorder {
      static isTypeSupported = vi.fn(() => true);

      state = "inactive";
      onstart: (() => void) | null = null;
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      get mimeType() {
        return this.options?.mimeType || "audio/webm";
      }

      constructor(
        public stream: MediaStream,
        public options?: MediaRecorderOptions,
      ) {}

      start() {
        this.state = "recording";
        this.onstart?.();
      }

      stop() {
        this.state = "inactive";
        this.ondataavailable?.({
          data: new Blob(["test audio"], { type: this.mimeType }),
        });
        this.onstop?.();
      }
    }

    beforeEach(() => {
      mockGetUserMedia = vi.fn().mockResolvedValue(mockStream);

      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: mockGetUserMedia,
        },
      });

      Object.defineProperty(window, "MediaRecorder", {
        configurable: true,
        value: MockMediaRecorder,
      });

      Object.defineProperty(globalThis, "MediaRecorder", {
        configurable: true,
        value: MockMediaRecorder,
      });

      window.URL.createObjectURL = vi.fn().mockReturnValue("blob:test");
      window.URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
      // Clean up globals
      delete (window as unknown as { MediaRecorder?: unknown }).MediaRecorder;
      delete (globalThis as unknown as { MediaRecorder?: unknown }).MediaRecorder;
    });

    it("renders live recording tab and allows starting and stopping recording", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <MemoryRouter>
          <NewMeetingPage />
        </MemoryRouter>,
      );

      // 1. click Record Live
      await user.click(screen.getByRole("tab", { name: /record live/i }));
      expect(
        screen.getByText(/record a live meeting from your microphone/i),
      ).toBeInTheDocument();

      // 2. click Start recording
      await user.click(screen.getByRole("button", { name: /start recording/i }));

      // 3. getUserMedia called with { audio: true }
      expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });

      // 4. Stop recording appears
      const stopButton = await screen.findByRole("button", { name: /stop recording/i });
      expect(stopButton).toBeInTheDocument();
      expect(screen.getByText("00:00")).toBeInTheDocument();
      await waitFor(() => expect(screen.getByText("00:01")).toBeInTheDocument(), {
        timeout: 2000,
      });

      // 5. click Stop recording
      await user.click(stopButton);

      // 6. recording-ready UI appears (Use recording button)
      const useButton = await screen.findByRole("button", { name: /use recording/i });
      expect(useButton).toBeInTheDocument();

      // 7. audio preview appears (audio element with src blob:test)
      const audioPreview = document.querySelector("audio");
      expect(audioPreview).toBeInTheDocument();
      expect(audioPreview).toHaveAttribute("src", "blob:test");

      // Verify upload flow triggers correctly
      // Need a meeting title to enable the Use recording button
      const titleInputs = screen.getAllByLabelText(/meeting title/i);
      const titleInput = titleInputs[titleInputs.length - 1];
      expect(titleInput).toBeDefined();
      await user.type(titleInput!, "Live Demo");
      expect(useButton).toBeEnabled();

      apiClient.initializeUploadMeeting.mockResolvedValueOnce({
        uploadInstructions: {
          token: "fake-token",
          endpoint: "http://localhost:54321/tus",
        },
        meetingDetail: { id: "test-live-id" } as unknown as MeetingDetail,
      });

      await user.click(useButton);

      expect(apiClient.initializeUploadMeeting).toHaveBeenCalledWith(
        expect.objectContaining({
          mimeType: "audio/webm",
        }),
      );
    });

    it("can discard a bad live recording and start again", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <MemoryRouter>
          <NewMeetingPage />
        </MemoryRouter>,
      );

      await user.click(screen.getByRole("tab", { name: /record live/i }));
      await user.click(screen.getByRole("button", { name: /start recording/i }));
      const firstStopButton = await screen.findByRole("button", {
        name: /stop recording/i,
      });
      await user.click(firstStopButton);

      expect(await screen.findByRole("button", { name: /use recording/i }));
      expect(document.querySelector("audio")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /discard recording/i }));

      expect(document.querySelector("audio")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /use recording/i })).toBeDisabled();
      expect(
        screen.getByRole("button", { name: /start recording/i }),
      ).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /start recording/i }));
      expect(mockGetUserMedia).toHaveBeenCalledTimes(2);
      expect(
        await screen.findByRole("button", { name: /stop recording/i }),
      ).toBeInTheDocument();
    });

    it("shows error if getUserMedia fails", async () => {
      mockGetUserMedia.mockRejectedValue(new Error("Permission denied"));
      const user = userEvent.setup();
      renderWithProviders(
        <MemoryRouter>
          <NewMeetingPage />
        </MemoryRouter>,
      );

      await user.click(screen.getByRole("tab", { name: /record live/i }));
      await user.click(screen.getByRole("button", { name: /start recording/i }));

      expect(await screen.findByText(/permission denied/i)).toBeInTheDocument();
    });

    it("shows unsupported error if MediaRecorder is missing", async () => {
      delete (window as unknown as { MediaRecorder?: unknown }).MediaRecorder;
      delete (globalThis as unknown as { MediaRecorder?: unknown }).MediaRecorder;

      const user = userEvent.setup();
      renderWithProviders(
        <MemoryRouter>
          <NewMeetingPage />
        </MemoryRouter>,
      );

      await user.click(screen.getByRole("tab", { name: /record live/i }));
      expect(screen.getByText(/browser not supported/i)).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /start recording/i }),
      ).not.toBeInTheDocument();
    });
  });
});
