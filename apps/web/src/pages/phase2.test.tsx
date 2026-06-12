import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

    expect(await screen.findByText(/summary unavailable/i)).toBeInTheDocument();
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
});
