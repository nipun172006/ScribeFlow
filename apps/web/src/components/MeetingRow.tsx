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
    <article className="rounded-card border border-white/10 bg-white/[0.06] p-5 shadow-soft backdrop-blur-xl transition duration-normal hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.09]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link
            to={`/meetings/${meeting.id}`}
            className="font-display text-xl font-semibold text-primary hover:text-accent"
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
          <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 font-ui text-xs font-semibold uppercase text-muted">
            {meeting.sourceType}
          </span>
          <StatusBadge status={meeting.status} />
        </div>
      </div>
    </article>
  );
}
