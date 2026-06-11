import type { Meeting } from "@scribeflow/shared";
import { Link } from "react-router-dom";
import { CalendarDays, Clock3, UsersRound } from "lucide-react";
import { formatDate, formatDuration } from "../lib/format";
import { StatusBadge } from "./StatusBadge";

type MeetingRowProps = {
  meeting: Meeting;
};

export function MeetingRow({ meeting }: MeetingRowProps) {
  return (
    <article className="rounded-card border border-border bg-surface p-4 transition duration-fast hover:border-accent/60">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            to={`/meetings/${meeting.id}`}
            className="text-base font-semibold text-primary hover:text-accent"
          >
            {meeting.title}
          </Link>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={15} aria-hidden="true" />
              {formatDate(meeting.recordedAt ?? meeting.createdAt)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock3 size={15} aria-hidden="true" />
              {meeting.durationSeconds == null
                ? "Duration unavailable"
                : formatDuration(meeting.durationSeconds)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <UsersRound size={15} aria-hidden="true" />
              {meeting.knownParticipants.length > 0
                ? `${meeting.knownParticipants.length} known`
                : "No known participants"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium uppercase text-muted">
            {meeting.sourceType}
          </span>
          <StatusBadge status={meeting.status} />
        </div>
      </div>
    </article>
  );
}
