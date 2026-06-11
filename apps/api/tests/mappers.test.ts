import { describe, expect, it } from "vitest";
import { mapMeeting, mapMeetingDetail } from "../src/repositories/mappers.js";
import type { Database } from "../src/types/database.types.js";

type MeetingRow = Database["public"]["Tables"]["meetings"]["Row"];

const now = "2026-06-11T10:30:00.000Z";

function meetingRow(overrides: Partial<MeetingRow> = {}): MeetingRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Weekly Product Meeting",
    source_type: "upload",
    status: "created",
    original_file_name: "meeting.m4a",
    storage_bucket: "meeting-audio",
    storage_path: "11111111-1111-4111-8111-111111111111/audio.m4a",
    mime_type: "audio/mp4",
    expected_file_size_bytes: 1000,
    file_size_bytes: 1000,
    duration_seconds: null,
    language: "en",
    recorded_at: now,
    processing_started_at: null,
    upload_completed_at: now,
    completed_at: null,
    processing_time_ms: null,
    known_participants: ["Arjun"],
    technical_terms: ["Supabase"],
    error_code: null,
    error_message: null,
    metadata: {},
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe("database mappers", () => {
  it("maps meeting rows to camelCase transport objects with ISO dates", () => {
    const meeting = mapMeeting(meetingRow());

    expect(meeting).toMatchObject({
      sourceType: "upload",
      storageBucket: "meeting-audio",
      storagePath: "11111111-1111-4111-8111-111111111111/audio.m4a",
      expectedFileSizeBytes: 1000,
      knownParticipants: ["Arjun"],
      technicalTerms: ["Supabase"],
      createdAt: now,
    });
  });

  it("maps meeting detail aggregates without embedding vectors", () => {
    const detail = mapMeetingDetail({
      meeting: meetingRow(),
      speakers: [],
      transcriptSegments: [],
      summary: null,
      actionItems: [],
      topics: [],
      chunkCount: 2,
    });

    expect(detail.chunkCount).toBe(2);
    expect(JSON.stringify(detail)).not.toContain("embedding");
  });
});
