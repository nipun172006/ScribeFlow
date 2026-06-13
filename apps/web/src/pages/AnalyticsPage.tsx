import { useMemo } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import type { ReactNode } from "react";
import { CheckCircle2, Clock3, Tags } from "lucide-react";
import type { MeetingDetail } from "@scribeflow/shared";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { listMeetings, getMeetingDetail } from "../lib/apiClient";

function AnalyticsPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-surface p-5">
      <h2 className="text-base font-semibold text-primary">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function AnalyticsPage() {
  const meetingsQuery = useQuery({
    queryKey: ["meetings", "analytics"],
    queryFn: () =>
      listMeetings({ page: 1, pageSize: 50, sort: "createdAt", order: "desc" }),
  });

  const meetings = useMemo(
    () => meetingsQuery.data?.items ?? [],
    [meetingsQuery.data?.items],
  );
  const completedMeetings = useMemo(
    () => meetings.filter((m) => m.status === "completed" || m.status === "indexing"),
    [meetings],
  );

  const detailsQueries = useQueries({
    queries: completedMeetings.slice(0, 20).map((m) => ({
      queryKey: ["meeting-detail", m.id],
      queryFn: () => getMeetingDetail(m.id),
      staleTime: 60000,
    })),
  });

  const details = useMemo(() => {
    return detailsQueries
      .map((q) => q.data)
      .filter((d) => d != null) as MeetingDetail[];
  }, [detailsQueries]);

  const metrics = useMemo(() => {
    const chartData = (() => {
      if (meetings.length === 0) return [];
      const groups = new Map<string, number>();
      for (const m of [...meetings].reverse()) {
        const dateStr = new Date(m.createdAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
        groups.set(dateStr, (groups.get(dateStr) || 0) + 1);
      }
      return Array.from(groups.entries()).map(([name, value]) => ({ name, value }));
    })();

    const speakersMap = new Map<string, number>();
    let openActions = 0;
    let completedActions = 0;
    const topicsMap = new Map<string, number>();

    for (const d of details) {
      for (const s of d.speakers) {
        speakersMap.set(
          s.displayName,
          (speakersMap.get(s.displayName) || 0) + s.totalSpeakingSeconds,
        );
      }
      for (const a of d.actionItems) {
        if (a.status === "open") openActions++;
        if (a.status === "completed") completedActions++;
      }
      for (const t of d.topics) {
        topicsMap.set(
          t.displayLabel,
          (topicsMap.get(t.displayLabel) || 0) + t.mentionCount,
        );
      }
    }

    const speakerData = Array.from(speakersMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, seconds]) => ({ name, minutes: Math.round(seconds / 60) }));

    const completionRate =
      openActions + completedActions > 0
        ? Math.round((completedActions / (openActions + completedActions)) * 100)
        : null;

    const topTopics = Array.from(topicsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

    return {
      chartData,
      speakerData,
      openActions,
      completedActions,
      completionRate,
      topTopics,
    };
  }, [meetings, details]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Analytics"
        title="Cross-meeting analytics"
        description="Insights aggregated from your recent meetings, transcripts, and AI analysis."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <AnalyticsPanel title="Meetings over time">
          {metrics.chartData.length === 0 ? (
            <div className="h-64 rounded-card border border-border/70 bg-background/50 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[]}>
                  <CartesianGrid stroke="rgb(62 65 70)" strokeDasharray="3 3" />
                  <XAxis dataKey="name" stroke="rgb(161 166 176)" />
                  <YAxis stroke="rgb(161 166 176)" />
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-3 text-sm text-muted">No meeting records available.</p>
            </div>
          ) : (
            <div className="h-64 rounded-card border border-border/70 bg-background/50 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.chartData}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    stroke="var(--muted)"
                    fontSize={12}
                    tickMargin={8}
                  />
                  <YAxis stroke="var(--muted)" fontSize={12} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "var(--surface-raised)" }}
                    contentStyle={{
                      backgroundColor: "var(--surface)",
                      borderColor: "var(--border)",
                      borderRadius: "6px",
                    }}
                  />
                  <Bar dataKey="value" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </AnalyticsPanel>

        <AnalyticsPanel title="Speaking-time distribution">
          {metrics.speakerData.length === 0 ? (
            <EmptyState
              icon={<Clock3 size={20} aria-hidden="true" />}
              title="No speaker analytics"
              message="Speaking time will appear here after meetings are transcribed."
            />
          ) : (
            <div className="h-64 rounded-card border border-border/70 bg-background/50 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.speakerData} layout="vertical">
                  <CartesianGrid
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                    horizontal={false}
                  />
                  <XAxis type="number" stroke="var(--muted)" fontSize={12} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke="var(--muted)"
                    fontSize={12}
                    width={80}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--surface-raised)" }}
                    contentStyle={{
                      backgroundColor: "var(--surface)",
                      borderColor: "var(--border)",
                      borderRadius: "6px",
                    }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any) => [`${value} min`, "Speaking time"]}
                  />
                  <Bar dataKey="minutes" fill="var(--success)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </AnalyticsPanel>

        <AnalyticsPanel title="Action-item completion">
          {metrics.completionRate === null ? (
            <EmptyState
              icon={<CheckCircle2 size={20} aria-hidden="true" />}
              title="No action-item analytics"
              message="Completion rate will be computed from stored open and completed tasks."
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <div className="text-6xl font-bold tabular-nums text-primary">
                {metrics.completionRate}%
              </div>
              <div className="flex gap-6 text-sm">
                <div className="flex flex-col items-center">
                  <span className="font-semibold text-success">
                    {metrics.completedActions}
                  </span>
                  <span className="text-muted">Completed</span>
                </div>
                <div className="h-10 w-[1px] bg-border" />
                <div className="flex flex-col items-center">
                  <span className="font-semibold text-accent">
                    {metrics.openActions}
                  </span>
                  <span className="text-muted">Open</span>
                </div>
              </div>
            </div>
          )}
        </AnalyticsPanel>

        <AnalyticsPanel title="Recurring topics">
          {metrics.topTopics.length === 0 ? (
            <EmptyState
              icon={<Tags size={20} aria-hidden="true" />}
              title="No recurring topics"
              message="Topic counts will be aggregated from meeting analysis records."
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {metrics.topTopics.map(([topic, count]) => (
                <span
                  key={topic}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-raised px-3 py-1.5 text-sm font-medium text-primary shadow-soft"
                >
                  {topic}
                  <span className="text-xs text-muted tabular-nums">({count})</span>
                </span>
              ))}
            </div>
          )}
        </AnalyticsPanel>
      </div>
    </div>
  );
}
