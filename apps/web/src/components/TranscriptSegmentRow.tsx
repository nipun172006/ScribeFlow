import type { TranscriptSegment } from "@scribeflow/shared";
import { formatTimestamp } from "../lib/format";
import { SpeakerBadge } from "./SpeakerBadge";

type TranscriptSegmentRowProps = {
  segment: TranscriptSegment;
  speakerName: string;
};

export function TranscriptSegmentRow({
  segment,
  speakerName,
}: TranscriptSegmentRowProps) {
  return (
    <article className="grid gap-3 rounded-card border border-border bg-surface p-4 md:grid-cols-[7rem_10rem_1fr]">
      <span className="text-sm tabular-nums text-muted">
        {formatTimestamp(segment.startMs)}
      </span>
      <SpeakerBadge name={speakerName} />
      <p className="text-sm leading-6 text-primary">{segment.text}</p>
    </article>
  );
}
