import type { TranscriptSegment } from "@scribeflow/shared";
import { cx } from "../lib/classNames";
import { formatTimestamp } from "../lib/format";
import { SpeakerBadge } from "./SpeakerBadge";

type TranscriptSegmentRowProps = {
  segment: TranscriptSegment;
  speakerName: string;
  highlighted?: boolean;
};

export function TranscriptSegmentRow({
  segment,
  speakerName,
  highlighted,
}: TranscriptSegmentRowProps) {
  return (
    <article
      id={`segment-${segment.id}`}
      data-transcript-segment-id={segment.id}
      className={cx(
        "grid scroll-mt-24 gap-3 rounded-card border bg-surface p-4 transition duration-normal md:grid-cols-[7rem_10rem_1fr]",
        highlighted ? "border-accent bg-accent/10 shadow-soft" : "border-border",
      )}
    >
      <span className="text-sm tabular-nums text-muted">
        {formatTimestamp(segment.startMs)}
      </span>
      <SpeakerBadge name={speakerName} />
      <p className="text-sm leading-6 text-primary">{segment.text}</p>
    </article>
  );
}
