import { describe, expect, it } from "vitest";
import { createMeetingChunks } from "../src/services/meetingChunkingService.js";
import type { MeetingDetail } from "@scribeflow/shared";

const mockMeetingDetail: MeetingDetail = {
  meeting: {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Test Meeting",
    sourceType: "upload",
    status: "completed",
    createdAt: "2026-06-13T00:00:00Z",
    updatedAt: "2026-06-13T01:00:00Z",
    recordedAt: "2026-06-13T00:00:00Z",
    knownParticipants: [],
    technicalTerms: [],
    metadata: {},
    originalFileName: null,
    storageBucket: null,
    storagePath: null,
    mimeType: null,
    expectedFileSizeBytes: null,
    fileSizeBytes: null,
    durationSeconds: 60,
    language: null,
    processingStartedAt: null,
    uploadCompletedAt: null,
    completedAt: "2026-06-13T01:00:00Z",
    processingTimeMs: null,
    errorCode: null,
    errorMessage: null,
  },
  speakers: [
    {
      id: "22222222-2222-2222-2222-222222222222",
      meetingId: "11111111-1111-1111-1111-111111111111",
      rawSpeakerIndex: 0,
      displayName: "Alice",
      totalSpeakingSeconds: 30,
      speakingPercentage: 50,
    },
  ],
  transcriptSegments: [
    {
      id: "33333333-3333-3333-3333-333333333333",
      meetingId: "11111111-1111-1111-1111-111111111111",
      speakerId: "22222222-2222-2222-2222-222222222222",
      rawSpeakerIndex: 0,
      segmentIndex: 0,
      startMs: 0,
      endMs: 1000,
      text: "Hello, let's start the meeting.",
      confidence: 0.95,
    },
    {
      id: "44444444-4444-4444-4444-444444444444",
      meetingId: "11111111-1111-1111-1111-111111111111",
      speakerId: "22222222-2222-2222-2222-222222222222",
      rawSpeakerIndex: 0,
      segmentIndex: 1,
      startMs: 1000,
      endMs: 2000,
      text: "We need to discuss the launch timeline.",
      confidence: 0.93,
    },
  ],
  summary: {
    executiveOverview: "Discussed the Q3 launch timeline and blockers.",
    keyDecisions: ["Launch will happen on June 30."],
    discussionPoints: ["Marketing needs 2 weeks notice."],
    openQuestions: ["Do we have enough resources?"],
    nextSteps: ["Schedule follow-up with marketing."],
    attendees: ["Alice"],
    topics: [],
  },
  actionItems: [
    {
      id: "55555555-5555-5555-5555-555555555555",
      meetingId: "11111111-1111-1111-1111-111111111111",
      task: "Prepare launch checklist",
      ownerName: "Alice",
      ownerSpeakerId: null,
      deadline: null,
      deadlineText: "June 25",
      confidence: 0.85,
      status: "open",
      sourceSegmentId: null,
      sourceStartMs: null,
      sourceEndMs: null,
      evidenceText: null,
      evidenceSegmentIds: [],
      createdAt: "2026-06-13T01:00:00Z",
      updatedAt: "2026-06-13T01:00:00Z",
      completedAt: null,
    },
  ],
  topics: [
    {
      id: "66666666-6666-6666-6666-666666666666",
      meetingId: "11111111-1111-1111-1111-111111111111",
      normalizedLabel: "launch",
      displayLabel: "Launch",
      confidence: null,
      mentionCount: 5,
    },
    {
      id: "77777777-7777-7777-7777-777777777777",
      meetingId: "11111111-1111-1111-1111-111111111111",
      normalizedLabel: "q3",
      displayLabel: "Q3",
      confidence: null,
      mentionCount: 3,
    },
  ],
  chunkCount: 0,
};

describe("Meeting Chunking Service", () => {
  it("creates chunks from transcript segments", () => {
    const chunks = createMeetingChunks(mockMeetingDetail);

    const transcriptChunks = chunks.filter((c) => c.kind === "transcript");
    expect(transcriptChunks.length).toBe(2);

    expect(transcriptChunks[0]?.text).toContain("Hello, let's start the meeting.");
    expect(transcriptChunks[0]?.metadata.speakerName).toBe("Alice");
    expect(transcriptChunks[0]?.metadata.startMs).toBe(0);
  });

  it("creates chunks from analysis data", () => {
    const chunks = createMeetingChunks(mockMeetingDetail);

    const overviewChunks = chunks.filter((c) => c.kind === "executive_overview");
    expect(overviewChunks.length).toBe(1);
    expect(overviewChunks[0]?.text).toContain("Q3 launch");

    const decisionsChunks = chunks.filter((c) => c.kind === "key_decision");
    expect(decisionsChunks.length).toBe(1);

    const actionChunks = chunks.filter((c) => c.kind === "action_item");
    expect(actionChunks.length).toBe(1);
    expect(actionChunks[0]?.metadata.confidence).toBe(0.85);
  });

  it("creates chunks from topics", () => {
    const chunks = createMeetingChunks(mockMeetingDetail);

    const topicChunks = chunks.filter((c) => c.kind === "topic");
    expect(topicChunks.length).toBe(2);
    expect(topicChunks.map((c) => c.text)).toContain("Launch");
  });

  it("doesn't create empty chunks", () => {
    const chunks = createMeetingChunks(mockMeetingDetail);

    expect(chunks.every((c) => c.text.trim().length > 0)).toBe(true);
  });

  it("stores metadata with evidence segment IDs", () => {
    const chunks = createMeetingChunks(mockMeetingDetail);

    const actionChunks = chunks.filter((c) => c.kind === "action_item");
    const chunk = actionChunks[0];

    expect(chunk?.metadata.sourceSegmentIds).toBeDefined();
    expect(Array.isArray(chunk?.metadata.sourceSegmentIds)).toBe(true);
  });

  it("compacts whitespace in chunks", () => {
    const detail: MeetingDetail = {
      ...mockMeetingDetail,
      summary: {
        attendees: [],
        executiveOverview: "This  is   a   text\nwith\nextra\nspaces",
        keyDecisions: [],
        discussionPoints: [],
        openQuestions: [],
        nextSteps: [],
        topics: [],
      },
    };

    const chunks = createMeetingChunks(detail);
    const overviewChunk = chunks.find((c) => c.kind === "executive_overview");

    expect(overviewChunk?.text).toBe("This is a text with extra spaces");
  });

  it("never returns zero chunks for a completed meeting with transcript", () => {
    const chunks = createMeetingChunks(mockMeetingDetail);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("creates all expected chunk kinds from a full meeting", () => {
    const chunks = createMeetingChunks(mockMeetingDetail);
    const kinds = new Set(chunks.map((c) => c.kind));

    expect(kinds.has("transcript")).toBe(true);
    expect(kinds.has("executive_overview")).toBe(true);
    expect(kinds.has("key_decision")).toBe(true);
    expect(kinds.has("discussion_point")).toBe(true);
    expect(kinds.has("open_question")).toBe(true);
    expect(kinds.has("next_step")).toBe(true);
    expect(kinds.has("topic")).toBe(true);
    expect(kinds.has("action_item")).toBe(true);
  });

  it("handles persisted summary shape where topics come from detail.topics", () => {
    const detail: MeetingDetail = {
      ...mockMeetingDetail,
      summary: {
        ...mockMeetingDetail.summary!,
        topics: [],
      },
    };

    const chunks = createMeetingChunks(detail);
    const topicChunks = chunks.filter((c) => c.kind === "topic");
    expect(topicChunks.length).toBe(2);
    expect(topicChunks.map((c) => c.text)).toContain("Launch");
    expect(topicChunks.map((c) => c.text)).toContain("Q3");
  });

  it("chunk metadata includes kind field matching chunk kind", () => {
    const chunks = createMeetingChunks(mockMeetingDetail);
    for (const chunk of chunks) {
      expect(chunk.metadata.kind).toBe(chunk.kind);
    }
  });
});
