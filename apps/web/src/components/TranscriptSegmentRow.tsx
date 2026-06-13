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
        "grid scroll-mt-24 gap-3 rounded-card border bg-white/[0.055] p-4 shadow-soft backdrop-blur-xl transition duration-normal md:grid-cols-[7rem_10rem_1fr]",
        highlighted
          ? "border-accent bg-accent/10 shadow-[0_0_0_1px_rgba(54,211,194,0.18),0_24px_72px_rgba(0,0,0,0.34)]"
          : "border-white/10",
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
