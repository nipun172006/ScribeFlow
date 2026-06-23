import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import type { ReactNode } from "react";
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ListChecks,
  Tags,
} from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { getCrossMeetingAnalytics } from "../lib/apiClient";
import { formatDuration } from "../lib/format";

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

function ChartFrame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <figure
      role="img"
      aria-label={label}
      className="m-0 h-64 rounded-card border border-white/10 bg-surface-raised/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
    >
      {children}
    </figure>
  );
}

const shortDate = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

export function AnalyticsPage() {
  const analyticsQuery = useQuery({
    queryKey: ["analytics", "cross-meeting"],
    queryFn: getCrossMeetingAnalytics,
  });

  const data = analyticsQuery.data;

  const frequencyData = useMemo(
    () =>
      (data?.meetingFrequency ?? []).map((point) => ({
        name: shortDate(point.date),
        value: point.value,
      })),
    [data?.meetingFrequency],
  );

  const speakerData = useMemo(
    () =>
      (data?.speakerParticipation ?? []).slice(0, 8).map((speaker) => ({
        name: speaker.displayName,
        minutes: Math.round(speaker.totalSpeakingSeconds / 60),
      })),
    [data?.speakerParticipation],
  );

  const completionTrend = useMemo(
    () =>
      (data?.actionItemCompletion ?? []).map((point) => ({
        name: shortDate(point.date),
        rate: Math.round(point.completionRate),
      })),
    [data?.actionItemCompletion],
  );

  const totals = data?.totals;
  const hasData = (totals?.meetingCount ?? 0) > 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Analytics"
        title="Cross-meeting analytics"
        description="Deterministic insights aggregated across every meeting: frequency, speaking time, action-item completion and recurring topics."
      />

      {analyticsQuery.isLoading ? (
        <LoadingState label="Aggregating cross-meeting analytics" />
      ) : null}

      {analyticsQuery.error instanceof Error ? (
        <ErrorState
          title="Analytics are unavailable"
          message={analyticsQuery.error.message}
        />
      ) : null}

      {data && !hasData ? (
        <EmptyState
          icon={<BarChart3 size={20} aria-hidden="true" />}
          title="No analytics yet"
          message="Process a few meetings to populate cross-meeting frequency, speaking time, completion and topic trends."
          variant="open"
        />
      ) : null}

      {data && hasData ? (
        <>
          <section
            className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Headline metrics"
          >
            <MetricCard
              label="Total meetings"
              value={String(totals?.meetingCount ?? 0)}
              detail={`${totals?.completedMeetingCount ?? 0} completed`}
              icon={<CalendarClock size={18} aria-hidden="true" />}
            />
            <MetricCard
              label="Action-item completion"
              value={`${Math.round(totals?.completionRate ?? 0)}%`}
              detail={`${totals?.completedActionItemCount ?? 0} of ${totals?.actionItemCount ?? 0} done`}
              icon={<CheckCircle2 size={18} aria-hidden="true" />}
            />
            <MetricCard
              label="Action items"
              value={String(totals?.actionItemCount ?? 0)}
              detail="Across all meetings"
              icon={<ListChecks size={18} aria-hidden="true" />}
            />
            <MetricCard
              label="Speaking time"
              value={formatDuration(totals?.totalSpeakingSeconds ?? 0)}
              detail="Summed participant speech"
              icon={<Clock3 size={18} aria-hidden="true" />}
            />
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <AnalyticsPanel title="Meeting frequency">
              {frequencyData.length === 0 ? (
                <EmptyState
                  icon={<CalendarClock size={20} aria-hidden="true" />}
                  title="No meetings recorded"
                  message="Meeting volume over time will appear here."
                  variant="open"
                />
              ) : (
                <ChartFrame label="Bar chart of meetings recorded per day">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={frequencyData}>
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
                        formatter={(value: unknown) => [`${value}`, "Meetings"]}
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
              {speakerData.length === 0 ? (
                <EmptyState
                  icon={<Clock3 size={20} aria-hidden="true" />}
                  title="No speaker analytics"
                  message="Speaking time will appear here after meetings are transcribed."
                  variant="open"
                />
              ) : (
                <ChartFrame label="Bar chart of speaking time per participant in minutes">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={speakerData} layout="vertical">
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
                        formatter={(value: unknown) => [
                          `${value} min`,
                          "Speaking time",
                        ]}
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

            <AnalyticsPanel title="Action-item completion trend">
              {completionTrend.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 size={20} aria-hidden="true" />}
                  title="No action-item analytics"
                  message="Completion rate over time will be computed from stored tasks."
                  variant="open"
                />
              ) : (
                <ChartFrame label="Line chart of action-item completion rate over time">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={completionTrend}>
                      <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: chartTheme.tick, fontSize: 12 }}
                        axisLine={{ stroke: chartTheme.axis }}
                        tickLine={false}
                        tickMargin={8}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fill: chartTheme.tick, fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                        tickFormatter={(value: number) => `${value}%`}
                      />
                      <Tooltip
                        cursor={{ stroke: chartTheme.cursor }}
                        contentStyle={chartTheme.tooltip}
                        labelStyle={chartTheme.tooltipLabel}
                        itemStyle={chartTheme.tooltipItem}
                        formatter={(value: unknown) => [`${value}%`, "Completion"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="rate"
                        stroke={chartTheme.primary}
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: chartTheme.primary }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartFrame>
              )}
            </AnalyticsPanel>

            <AnalyticsPanel title="Recurring topics">
              {data.topRecurringTopics.length === 0 ? (
                <EmptyState
                  icon={<Tags size={20} aria-hidden="true" />}
                  title="No recurring topics"
                  message="Topic counts will be aggregated from meeting analysis records."
                  variant="open"
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.topRecurringTopics.map((topic) => (
                    <span
                      key={topic.topic}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-surface-raised/80 px-3 py-1.5 text-sm font-medium text-primary shadow-soft"
                    >
                      {topic.topic}
                      <span className="text-xs text-muted tabular-nums">
                        ({topic.count})
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </AnalyticsPanel>
          </div>
        </>
      ) : null}
    </div>
  );
}
