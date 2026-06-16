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

const chartTheme = {
  grid: "rgba(148, 163, 184, 0.18)",
  tick: "rgba(226, 232, 240, 0.76)",
  axis: "rgba(148, 163, 184, 0.18)",
  cursor: "rgba(54, 211, 194, 0.08)",
  primary: "#36d6c2",
  secondary: "#8b8cf6",
  tooltip: {
    background: "rgba(15, 23, 42, 0.96)",
    border: "1px solid rgba(148, 163, 184, 0.24)",
    borderRadius: "14px",
    color: "#f8fafc",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.42)",
  },
  tooltipLabel: {
    color: "#f8fafc",
    fontWeight: 600,
  },
  tooltipItem: {
    color: "#dbeafe",
  },
} as const;

function AnalyticsPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-white/10 bg-white/[0.055] p-5 shadow-soft backdrop-blur-xl">
      <h2 className="font-display text-lg font-semibold text-primary">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ChartFrame({ children }: { children: ReactNode }) {
  return (
    <div className="h-64 rounded-card border border-white/10 bg-surface-raised/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      {children}
    </div>
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
            <ChartFrame>
              <div className="flex h-full flex-col">
                <div className="min-h-0 flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[]}>
                      <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: chartTheme.tick, fontSize: 12 }}
                        axisLine={{ stroke: chartTheme.axis }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: chartTheme.tick, fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="pt-3 text-sm text-muted">No meeting records available.</p>
              </div>
            </ChartFrame>
          ) : (
            <ChartFrame>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.chartData}>
                  <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: chartTheme.tick, fontSize: 12 }}
                    axisLine={{ stroke: chartTheme.axis }}
                    tickLine={false}
                    tickMargin={8}
                  />
                  <YAxis
                    tick={{ fill: chartTheme.tick, fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: chartTheme.cursor }}
                    contentStyle={chartTheme.tooltip}
                    labelStyle={chartTheme.tooltipLabel}
                    itemStyle={chartTheme.tooltipItem}
                  />
                  <Bar
                    dataKey="value"
                    fill={chartTheme.primary}
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </AnalyticsPanel>

        <AnalyticsPanel title="Speaking-time distribution">
          {metrics.speakerData.length === 0 ? (
            <EmptyState
              icon={<Clock3 size={20} aria-hidden="true" />}
              title="No speaker analytics"
              message="Speaking time will appear here after meetings are transcribed."
              variant="open"
            />
          ) : (
            <ChartFrame>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.speakerData} layout="vertical">
                  <CartesianGrid stroke={chartTheme.grid} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: chartTheme.tick, fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fill: chartTheme.tick, fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={80}
                  />
                  <Tooltip
                    cursor={{ fill: chartTheme.cursor }}
                    contentStyle={chartTheme.tooltip}
                    labelStyle={chartTheme.tooltipLabel}
                    itemStyle={chartTheme.tooltipItem}
                    formatter={(value: unknown) => [`${value} min`, "Speaking time"]}
                  />
                  <Bar
                    dataKey="minutes"
                    fill={chartTheme.secondary}
                    radius={[0, 8, 8, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </AnalyticsPanel>

        <AnalyticsPanel title="Action-item completion">
          {metrics.completionRate === null ? (
            <EmptyState
              icon={<CheckCircle2 size={20} aria-hidden="true" />}
              title="No action-item analytics"
              message="Completion rate will be computed from stored open and completed tasks."
              variant="open"
            />
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center gap-5 rounded-card border border-white/10 bg-surface-raised/70 px-5 py-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="font-metric text-6xl font-semibold tabular-nums text-primary">
                {metrics.completionRate}%
              </div>
              <div className="flex gap-6 text-sm">
                <div className="flex flex-col items-center">
                  <span className="font-metric text-2xl font-semibold text-success tabular-nums">
                    {metrics.completedActions}
                  </span>
                  <span className="text-muted">Completed</span>
                </div>
                <div className="h-12 w-[1px] bg-white/10" />
                <div className="flex flex-col items-center">
                  <span className="font-metric text-2xl font-semibold text-accent tabular-nums">
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
              variant="open"
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {metrics.topTopics.map(([topic, count]) => (
                <span
                  key={topic}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-surface-raised/80 px-3 py-1.5 text-sm font-medium text-primary shadow-soft"
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
