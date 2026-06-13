import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Meeting, MeetingDetail } from "@scribeflow/shared";
import { renderWithProviders } from "../test/renderWithProviders";
import { DashboardPage } from "./DashboardPage";
import { AnalyticsPage } from "./AnalyticsPage";

const apiClient = vi.hoisted(() => ({
  listMeetings: vi.fn(),
  getMeetingDetail: vi.fn(),
}));

vi.mock("../lib/apiClient", async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import("../lib/apiClient")>();
  return {
    ...actual,
    ...apiClient,
  };
});

const meetingId1 = "11111111-1111-4111-8111-111111111111";

function makeMeeting(id: string): Meeting {
  return {
    id,
    title: `Meeting ${id}`,
    sourceType: "upload",
    status: "completed",
    originalFileName: null,
    storageBucket: null,
    storagePath: null,
    mimeType: null,
    expectedFileSizeBytes: null,
    fileSizeBytes: null,
    durationSeconds: 3600,
    language: "en",
    recordedAt: "2026-06-11T10:30:00.000Z",
    processingStartedAt: null,
    uploadCompletedAt: null,
    createdAt: "2026-06-11T10:30:00.000Z",
    updatedAt: "2026-06-11T10:30:00.000Z",
    completedAt: null,
    processingTimeMs: null,
    knownParticipants: [],
    technicalTerms: [],
    errorCode: null,
    errorMessage: null,
    metadata: {},
  };
}

describe("Dashboard and Analytics pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock ResizeObserver for Recharts
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it("renders dashboard empty state works", async () => {
    apiClient.listMeetings.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    });

    renderWithProviders(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("No processed meetings yet")).toBeInTheDocument();
    expect(await screen.findByText("No meetings stored yet")).toBeInTheDocument();
    expect(screen.getByText("No topics detected")).toBeInTheDocument();
  });

  it("dashboard renders real meeting metrics from mocked API data", async () => {
    apiClient.listMeetings.mockResolvedValue({
      items: [makeMeeting(meetingId1)],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });

    apiClient.getMeetingDetail.mockResolvedValue({
      meeting: makeMeeting(meetingId1),
      speakers: [],
      transcriptSegments: [],
      summary: null,
      actionItems: [
        {
          id: "action-1",
          meetingId: meetingId1,
          task: "Task 1",
          ownerName: null,
          ownerSpeakerId: null,
          deadline: null,
          deadlineText: null,
          status: "completed",
          confidence: null,
          sourceSegmentId: null,
          sourceStartMs: null,
          sourceEndMs: null,
          evidenceText: null,
          evidenceSegmentIds: [],
        },
        {
          id: "action-2",
          meetingId: meetingId1,
          task: "Task 2",
          ownerName: null,
          ownerSpeakerId: null,
          deadline: null,
          deadlineText: null,
          status: "open",
          confidence: null,
          sourceSegmentId: null,
          sourceStartMs: null,
          sourceEndMs: null,
          evidenceText: null,
          evidenceSegmentIds: [],
        },
      ],
      topics: [
        {
          id: "topic-1",
          meetingId: meetingId1,
          normalizedLabel: "sales",
          displayLabel: "Sales",
          confidence: 0.9,
          mentionCount: 5,
        },
      ],
      chunkCount: 42,
    } as MeetingDetail);

    renderWithProviders(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    // Wait for the components to render the "Sales" topic
    expect(await screen.findByText("Sales")).toBeInTheDocument();

    // Total meetings
    expect(screen.getAllByText("1 completed")[0]).toBeInTheDocument();
    expect(screen.getByText("1.0h")).toBeInTheDocument(); // 3600 seconds = 1.0h

    // Searchable chunks
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Indexed for semantic search")).toBeInTheDocument();

    // Topics
    expect(screen.getByText("(5)")).toBeInTheDocument();
  });

  it("analytics shows empty state when no completed meetings exist", async () => {
    apiClient.listMeetings.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 50, totalItems: 0, totalPages: 0 },
    });

    renderWithProviders(
      <MemoryRouter>
        <AnalyticsPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("No meeting records available."),
    ).toBeInTheDocument();
    expect(screen.getByText("No speaker analytics")).toBeInTheDocument();
    expect(screen.getByText("No action-item analytics")).toBeInTheDocument();
    expect(screen.getByText("No recurring topics")).toBeInTheDocument();
  });

  it("analytics renders speaking/action/topic sections from mocked data", async () => {
    apiClient.listMeetings.mockResolvedValue({
      items: [makeMeeting(meetingId1)],
      pagination: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
    });

    apiClient.getMeetingDetail.mockResolvedValue({
      meeting: makeMeeting(meetingId1),
      speakers: [
        {
          id: "speaker-1",
          meetingId: meetingId1,
          rawSpeakerIndex: 0,
          displayName: "Alice",
          totalSpeakingSeconds: 120, // 2 minutes
          speakingPercentage: 100,
        },
      ],
      transcriptSegments: [],
      summary: null,
      actionItems: [
        {
          id: "action-1",
          meetingId: meetingId1,
          task: "Task 1",
          ownerName: null,
          ownerSpeakerId: null,
          deadline: null,
          deadlineText: null,
          status: "open",
          confidence: null,
          sourceSegmentId: null,
          sourceStartMs: null,
          sourceEndMs: null,
          evidenceText: null,
          evidenceSegmentIds: [],
        },
      ],
      topics: [
        {
          id: "topic-1",
          meetingId: meetingId1,
          normalizedLabel: "marketing",
          displayLabel: "Marketing",
          confidence: 0.9,
          mentionCount: 3,
        },
      ],
      chunkCount: 10,
    } as MeetingDetail);

    renderWithProviders(
      <MemoryRouter>
        <AnalyticsPage />
      </MemoryRouter>,
    );

    // Wait for the components to render the topic
    expect(await screen.findByText("Marketing")).toBeInTheDocument();

    // Action items
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getAllByText("1")[0]).toBeInTheDocument(); // Open
    expect(screen.getAllByText("0")[0]).toBeInTheDocument(); // Completed

    // Topics
    expect(screen.getByText("(3)")).toBeInTheDocument();
  });
});
