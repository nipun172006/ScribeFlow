import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  FileAudio,
  Library,
  Plus,
  Tags,
} from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { MeetingRow } from "../components/MeetingRow";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { listMeetings } from "../lib/apiClient";

export function DashboardPage() {
  const recentMeetingsQuery = useQuery({
    queryKey: ["meetings", "dashboard-recent"],
    queryFn: () =>
      listMeetings({
        page: 1,
        pageSize: 5,
        sort: "createdAt",
        order: "desc",
      }),
  });

  const recentMeetings = recentMeetingsQuery.data?.items ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace"
        title="Meeting intelligence, ready for real processing"
        description="Start from an uploaded recording or a future live meeting session. Deepgram transcription is connected; generated summaries and action extraction remain future Gemini work."
        actions={
          <Link
            to="/meetings/new"
            className="inline-flex items-center gap-2 rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition duration-fast hover:bg-accent/90"
          >
            <Plus size={18} aria-hidden="true" />
            New Meeting
          </Link>
        }
      />

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Workspace metrics"
      >
        <MetricCard
          label="Total meetings"
          value="0"
          detail="No processed meetings yet"
          icon={<Library size={18} aria-hidden="true" />}
        />
        <MetricCard
          label="Meeting hours"
          value="0h"
          detail="Duration will be calculated from transcripts"
          icon={<Clock3 size={18} aria-hidden="true" />}
        />
        <MetricCard
          label="Open action items"
          value="0"
          detail="No extracted tasks yet"
          icon={<FileAudio size={18} aria-hidden="true" />}
        />
        <MetricCard
          label="Completion rate"
          value="--"
          detail="Available after action items exist"
          icon={<CheckCircle2 size={18} aria-hidden="true" />}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <section className="space-y-4" aria-labelledby="recent-meetings">
          <div className="flex items-center justify-between gap-3">
            <h2 id="recent-meetings" className="text-lg font-semibold">
              Recent meetings
            </h2>
            <Link
              to="/archive"
              className="text-sm font-medium text-accent hover:text-accent/80"
            >
              View archive
            </Link>
          </div>
          {recentMeetingsQuery.isLoading ? (
            <LoadingState label="Loading recent meetings" />
          ) : null}
          {recentMeetingsQuery.error instanceof Error ? (
            <ErrorState
              title="Recent meetings are unavailable"
              message={recentMeetingsQuery.error.message}
            />
          ) : null}
          {!recentMeetingsQuery.isLoading &&
          !recentMeetingsQuery.error &&
          recentMeetings.length === 0 ? (
            <EmptyState
              icon={<FileAudio size={20} aria-hidden="true" />}
              title="No meetings stored yet"
              message="Supabase-backed meeting records will appear here after you create upload or live metadata."
              action={
                <Link
                  to="/meetings/new"
                  className="inline-flex items-center gap-2 rounded-control border border-border bg-surface-raised px-3 py-2 text-sm font-semibold text-primary hover:border-accent/70"
                >
                  <Plus size={16} aria-hidden="true" />
                  Prepare upload
                </Link>
              }
            />
          ) : null}
          {recentMeetings.length > 0 ? (
            <div className="space-y-3">
              {recentMeetings.map((meeting) => (
                <MeetingRow key={meeting.id} meeting={meeting} />
              ))}
            </div>
          ) : null}
        </section>

        <section className="space-y-4" aria-labelledby="recurring-topics">
          <h2 id="recurring-topics" className="text-lg font-semibold">
            Recurring topics
          </h2>
          <EmptyState
            icon={<Tags size={20} aria-hidden="true" />}
            title="No topics detected"
            message="Topics will be stored after transcript analysis and RAG indexing are implemented."
          />
        </section>
      </div>

      <section className="space-y-4" aria-labelledby="activity-preview">
        <h2 id="activity-preview" className="text-lg font-semibold">
          Activity preview
        </h2>
        <EmptyState
          icon={<BarChart3 size={20} aria-hidden="true" />}
          title="Analytics are waiting for meeting records"
          message="Speaking distribution, action item trends and completion rates will use deterministic calculations from persisted meeting data."
        />
      </section>
    </div>
  );
}
