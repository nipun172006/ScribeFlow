import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueries } from "@tanstack/react-query";
import { CheckCircle2, Clock3, FileAudio, Library, Plus, Tags } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { MeetingRow } from "../components/MeetingRow";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { listMeetings, getMeetingDetail } from "../lib/apiClient";

export function DashboardPage() {
  const recentMeetingsQuery = useQuery({
    queryKey: ["meetings", "dashboard-recent"],
    queryFn: () =>
      listMeetings({
        page: 1,
        pageSize: 20,
        sort: "createdAt",
        order: "desc",
      }),
  });

  const recentMeetings = useMemo(
    () => recentMeetingsQuery.data?.items ?? [],
    [recentMeetingsQuery.data?.items],
  );
  const totalMeetings = recentMeetingsQuery.data?.pagination.totalItems ?? 0;

  const completedMeetings = useMemo(
    () =>
      recentMeetings.filter((m) => m.status === "completed" || m.status === "indexing"),
    [recentMeetings],
  );

  const detailsQueries = useQueries({
    queries: completedMeetings.slice(0, 10).map((m) => ({
      queryKey: ["meeting-detail", m.id],
      queryFn: () => getMeetingDetail(m.id),
      staleTime: 60000,
    })),
  });

  const details = useMemo(() => {
    return detailsQueries.map((q) => q.data).filter((d) => d != null);
  }, [detailsQueries]);

  const metrics = useMemo(() => {
    const totalHours =
      recentMeetings.reduce((acc, m) => acc + (m.durationSeconds ?? 0), 0) / 3600;

    let openActions = 0;
    let completedActions = 0;
    let totalChunks = 0;
    const topicCounts = new Map<string, number>();

    for (const detail of details) {
      totalChunks += detail.chunkCount ?? 0;
      for (const action of detail.actionItems) {
        if (action.status === "open") openActions++;
        if (action.status === "completed") completedActions++;
      }
      for (const topic of detail.topics) {
        topicCounts.set(
          topic.displayLabel,
          (topicCounts.get(topic.displayLabel) || 0) + topic.mentionCount,
        );
      }
    }

    const completionRate =
      openActions + completedActions > 0
        ? Math.round((completedActions / (openActions + completedActions)) * 100)
        : null;

    const topTopics = Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    return {
      totalHours,
      openActions,
      completedActions,
      completionRate,
      totalChunks,
      topTopics,
    };
  }, [recentMeetings, details]);

  return (
    <div className="space-y-9">
      <PageHeader
        eyebrow="Workspace"
        title="Meeting intelligence, ready for every recording"
        description="Upload audio or record live from your browser. ScribeFlow transcribes, separates speakers, extracts decisions and action items, then makes every meeting searchable."
      />

      <section
        className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Workspace metrics"
      >
        <MetricCard
          label="Total meetings"
          value={totalMeetings.toString()}
          detail={
            totalMeetings > 0
              ? `${completedMeetings.length} completed`
              : "No processed meetings yet"
          }
          icon={<Library size={18} aria-hidden="true" />}
        />
        <MetricCard
          label="Meeting hours"
          value={`${metrics.totalHours.toFixed(1)}h`}
          detail="Calculated from recent transcripts"
          icon={<Clock3 size={18} aria-hidden="true" />}
        />
        <MetricCard
          label="Open action items"
          value={metrics.openActions.toString()}
          detail={
            metrics.openActions > 0
              ? `${metrics.completedActions} completed`
              : "No extracted tasks yet"
          }
          icon={<CheckCircle2 size={18} aria-hidden="true" />}
        />
        <MetricCard
          label="Searchable chunks"
          value={metrics.totalChunks.toString()}
          detail={
            metrics.totalChunks > 0
              ? "Indexed for semantic search"
              : "Available after indexing"
          }
          icon={<FileAudio size={18} aria-hidden="true" />}
        />
      </section>

      <div className="grid gap-8 xl:grid-cols-[1.45fr_1fr]">
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
              variant="open"
              action={
                <Link to="/meetings/new" className="sf-secondary-button px-3 py-2">
                  <Plus size={16} aria-hidden="true" />
                  Add recording
                </Link>
              }
            />
          ) : null}
          {recentMeetings.length > 0 ? (
            <div className="space-y-3">
              {recentMeetings.slice(0, 5).map((meeting) => (
                <MeetingRow key={meeting.id} meeting={meeting} />
              ))}
            </div>
          ) : null}
        </section>

        <section className="space-y-4" aria-labelledby="recurring-topics">
          <h2 id="recurring-topics" className="text-lg font-semibold">
            Recurring topics
          </h2>
          {metrics.topTopics.length === 0 ? (
            <EmptyState
              icon={<Tags size={20} aria-hidden="true" />}
              title="No topics detected"
              message="Topics will appear here after meetings have completed Gemini analysis. Cross-meeting aggregation works from recent analysed meetings."
              variant="open"
            />
          ) : (
            <div className="flex flex-wrap gap-2 rounded-panel bg-white/[0.025] p-5 ring-1 ring-white/[0.06] backdrop-blur-xl">
              {metrics.topTopics.map(([topic, count]) => (
                <span
                  key={topic}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1 text-sm font-medium text-primary"
                >
                  {topic}
                  <span className="text-xs text-muted tabular-nums">({count})</span>
                </span>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
