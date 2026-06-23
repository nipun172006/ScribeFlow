import type { ActionItem, MeetingDetail } from "@scribeflow/shared";

export type TranscriptEntry = {
  speaker: string;
  startMs: number;
  endMs: number;
  text: string;
};

/** Triggers a client-side download of a text artifact. */
export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = "text/plain;charset=utf-8",
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Filesystem-safe slug derived from a meeting title. */
export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "meeting"
  );
}

function bulletList(items: string[]): string {
  if (items.length === 0) {
    return "_None recorded._";
  }
  return items.map((item) => `- ${item}`).join("\n");
}

function actionItemLine(item: ActionItem): string {
  const checkbox = item.status === "completed" ? "[x]" : "[ ]";
  const parts: string[] = [item.task];
  if (item.ownerName) {
    parts.push(`— **${item.ownerName}**`);
  }
  const deadline = item.deadlineText ?? item.deadline;
  if (deadline) {
    parts.push(`(due ${deadline})`);
  }
  return `- ${checkbox} ${parts.join(" ")}`;
}

/**
 * Renders a meeting's summary, topics and action items as a portable Markdown
 * document — the "structured, actionable document" deliverable.
 */
export function formatMeetingMarkdown(detail: MeetingDetail): string {
  const { meeting, summary, actionItems, topics } = detail;
  const lines: string[] = [`# ${meeting.title}`, ""];

  const meta: string[] = [];
  if (meeting.recordedAt) {
    meta.push(new Date(meeting.recordedAt).toLocaleString());
  }
  if (meeting.durationSeconds) {
    meta.push(`${Math.round(meeting.durationSeconds / 60)} min`);
  }
  if (meeting.language) {
    meta.push(meeting.language);
  }
  if (meta.length > 0) {
    lines.push(`_${meta.join(" · ")}_`, "");
  }

  if (summary?.executiveOverview) {
    lines.push("## Executive overview", "", summary.executiveOverview, "");
  }

  if (summary) {
    lines.push("## Attendees", "", bulletList(summary.attendees), "");
    lines.push("## Key decisions", "", bulletList(summary.keyDecisions), "");
    lines.push("## Discussion points", "", bulletList(summary.discussionPoints), "");
    lines.push("## Open questions", "", bulletList(summary.openQuestions), "");
    lines.push("## Next steps", "", bulletList(summary.nextSteps), "");
  }

  const topicLabels = topics.map((topic) => topic.displayLabel);
  if (topicLabels.length > 0) {
    lines.push("## Topics", "", topicLabels.map((t) => `\`${t}\``).join(" "), "");
  }

  lines.push("## Action items", "");
  lines.push(
    actionItems.length > 0
      ? actionItems.map(actionItemLine).join("\n")
      : "_No action items extracted._",
  );
  lines.push("");

  return lines.join("\n").trim() + "\n";
}

/** Compact Markdown of just the action-item checklist (for quick copy). */
export function formatActionItemsMarkdown(detail: MeetingDetail): string {
  const lines = [`# Action items — ${detail.meeting.title}`, ""];
  lines.push(
    detail.actionItems.length > 0
      ? detail.actionItems.map(actionItemLine).join("\n")
      : "_No action items extracted._",
  );
  return lines.join("\n").trim() + "\n";
}

function padTwo(value: number): string {
  return value.toString().padStart(2, "0");
}

function msToClock(ms: number, msSeparator: "," | "."): string {
  const totalMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  return `${padTwo(hours)}:${padTwo(minutes)}:${padTwo(seconds)}${msSeparator}${millis
    .toString()
    .padStart(3, "0")}`;
}

/** Plain-text transcript with speaker labels and [mm:ss] markers. */
export function formatTranscriptTxt(entries: TranscriptEntry[]): string {
  return (
    entries
      .map((entry) => {
        const minutes = Math.floor(entry.startMs / 60_000);
        const seconds = Math.floor((entry.startMs % 60_000) / 1000);
        return `[${padTwo(minutes)}:${padTwo(seconds)}] ${entry.speaker}: ${entry.text}`;
      })
      .join("\n\n") + "\n"
  );
}

/** SubRip (.srt) captions. */
export function formatTranscriptSrt(entries: TranscriptEntry[]): string {
  return (
    entries
      .map((entry, index) => {
        const start = msToClock(entry.startMs, ",");
        const end = msToClock(Math.max(entry.endMs, entry.startMs + 1), ",");
        return `${index + 1}\n${start} --> ${end}\n${entry.speaker}: ${entry.text}`;
      })
      .join("\n\n") + "\n"
  );
}

/** WebVTT (.vtt) captions. */
export function formatTranscriptVtt(entries: TranscriptEntry[]): string {
  const cues = entries
    .map((entry) => {
      const start = msToClock(entry.startMs, ".");
      const end = msToClock(Math.max(entry.endMs, entry.startMs + 1), ".");
      return `${start} --> ${end}\n${entry.speaker}: ${entry.text}`;
    })
    .join("\n\n");
  return `WEBVTT\n\n${cues}\n`;
}
