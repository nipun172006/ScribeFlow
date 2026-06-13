import type {
  MeetingDetail,
  MeetingSpeaker,
  TranscriptSegment,
} from "@scribeflow/shared";
import { logger } from "../config/logger.js";

export type ChunkKind =
  | "transcript"
  | "executive_overview"
  | "key_decision"
  | "discussion_point"
  | "open_question"
  | "next_step"
  | "topic"
  | "action_item";

export type MeetingChunk = {
  kind: ChunkKind;
  title: string;
  text: string;
  metadata: {
    kind: ChunkKind;
    sourceSegmentIds?: string[];
    startMs?: number;
    endMs?: number;
    speakerName?: string;
    confidence?: number;
  };
};

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function getSpeakerName(
  segment: TranscriptSegment,
  speakers: MeetingSpeaker[],
): string {
  if (segment.speakerId) {
    const speaker = speakers.find((s) => s.id === segment.speakerId);
    if (speaker) {
      return speaker.displayName;
    }
  }

  if (segment.rawSpeakerIndex != null) {
    const speaker = speakers.find((s) => s.rawSpeakerIndex === segment.rawSpeakerIndex);
    return speaker?.displayName ?? `Speaker ${segment.rawSpeakerIndex + 1}`;
  }

  return "Unknown speaker";
}

function chunkTranscriptSegments(
  segments: TranscriptSegment[],
  speakers: MeetingSpeaker[],
): MeetingChunk[] {
  return segments
    .filter((seg) => seg.text.trim().length > 0)
    .map((seg) => ({
      kind: "transcript" as ChunkKind,
      title: `${seg.startMs}ms - ${getSpeakerName(seg, speakers)}`,
      text: compactWhitespace(seg.text),
      metadata: {
        kind: "transcript",
        sourceSegmentIds: [seg.id],
        startMs: seg.startMs,
        endMs: seg.endMs,
        speakerName: getSpeakerName(seg, speakers),
      },
    }));
}

function chunkStringArray(
  kind: ChunkKind,
  items: string[],
  title: string,
): MeetingChunk[] {
  return items
    .map((item) => {
      const trimmed = compactWhitespace(item);
      return trimmed
        ? {
            kind,
            title,
            text: trimmed,
            metadata: {
              kind,
            },
          }
        : null;
    })
    .filter((chunk): chunk is MeetingChunk => chunk !== null);
}

export function createMeetingChunks(detail: MeetingDetail): MeetingChunk[] {
  const chunks: MeetingChunk[] = [];

  chunks.push(...chunkTranscriptSegments(detail.transcriptSegments, detail.speakers));

  if (detail.summary) {
    const summary = detail.summary;

    if (summary.executiveOverview?.trim()) {
      chunks.push({
        kind: "executive_overview",
        title: "Executive Overview",
        text: compactWhitespace(summary.executiveOverview),
        metadata: {
          kind: "executive_overview",
        },
      });
    }

    chunks.push(
      ...chunkStringArray("key_decision", summary.keyDecisions, "Key Decision"),
    );
    chunks.push(
      ...chunkStringArray(
        "discussion_point",
        summary.discussionPoints,
        "Discussion Point",
      ),
    );
    chunks.push(
      ...chunkStringArray("open_question", summary.openQuestions, "Open Question"),
    );
    chunks.push(...chunkStringArray("next_step", summary.nextSteps, "Next Step"));
    chunks.push(...chunkStringArray("topic", summary.topics, "Topic"));
  }

  if (detail.topics.length > 0) {
    const topicChunks: MeetingChunk[] = [];
    for (const topic of detail.topics) {
      const text = compactWhitespace(topic.displayLabel);
      if (!text) {
        continue;
      }

      topicChunks.push({
        kind: "topic",
        title: "Topic",
        text,
        metadata: {
          kind: "topic",
        },
      });
    }
    chunks.push(...topicChunks);
  }

  if (detail.actionItems.length > 0) {
    const actionChunks: MeetingChunk[] = [];
    for (const item of detail.actionItems) {
      const text = compactWhitespace(item.task);
      if (!text) {
        continue;
      }

      actionChunks.push({
        kind: "action_item",
        title: `Action: ${item.task.substring(0, 50)}${item.task.length > 50 ? "..." : ""}`,
        text,
        metadata: {
          kind: "action_item",
          sourceSegmentIds: item.evidenceSegmentIds || [],
          confidence: item.confidence ?? undefined,
        },
      });
    }
    chunks.push(...actionChunks);
  }

  logger.debug(
    { meetingId: detail.meeting.id, chunkCount: chunks.length },
    "created meeting chunks",
  );

  return chunks;
}
