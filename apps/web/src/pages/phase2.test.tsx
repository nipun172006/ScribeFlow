import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Meeting, MeetingDetail, UploadInstructions } from "@scribeflow/shared";
import { renderWithProviders } from "../test/renderWithProviders";
import { ArchivePage } from "./ArchivePage";
import { MeetingDetailPage } from "./MeetingDetailPage";
import { NewMeetingPage } from "./NewMeetingPage";

const apiClient = vi.hoisted(() => ({
  initializeUploadMeeting: vi.fn(),
  completeMeetingUpload: vi.fn(),
  failMeetingUpload: vi.fn(),
  createLiveMeeting: vi.fn(),
  listMeetings: vi.fn(),
  getMeetingDetail: vi.fn(),
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
});
