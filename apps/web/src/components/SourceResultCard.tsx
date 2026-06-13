import type { SearchResult } from "@scribeflow/shared";
import { CalendarDays, Gauge, UserRound } from "lucide-react";
import { formatDate, formatTimestamp } from "../lib/format";

type SourceResultCardProps = {
  result: SearchResult;
};

export function SourceResultCard({ result }: SourceResultCardProps) {
  return (
    <article className="rounded-card border border-white/10 bg-white/[0.06] p-5 shadow-soft backdrop-blur-xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-primary">
            {result.meetingTitle}
          </h2>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={15} aria-hidden="true" />
              {formatDate(result.meetingDate)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <UserRound size={15} aria-hidden="true" />
              {result.speakerNames.join(", ") || "Speaker unknown"}
            </span>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-control border border-accent/25 bg-accent/10 px-2.5 py-1 text-xs text-accent">
          <Gauge size={14} aria-hidden="true" />
          {Math.round(result.score * 100)} relevance
        </span>
      </div>
      <p className="mt-4 text-sm leading-6 text-primary">{result.content}</p>
      <p className="mt-3 text-xs font-medium text-accent">
        {formatTimestamp(result.startMs)} - {formatTimestamp(result.endMs)}
      </p>
    </article>
  );
}
