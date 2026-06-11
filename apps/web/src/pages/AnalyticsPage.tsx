import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactNode } from "react";
import { CheckCircle2, Clock3, Tags } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";

const emptyChartData: Array<{ name: string; value: number }> = [];

function AnalyticsPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-surface p-5">
      <h2 className="text-base font-semibold text-primary">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function AnalyticsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Analytics"
        title="Cross-meeting analytics"
        description="This page will aggregate persisted meeting records. Phase 2 avoids invented analytics and displays empty structures only."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <AnalyticsPanel title="Meetings over time">
          <div className="h-64 rounded-card border border-border/70 bg-background/50 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={emptyChartData}>
                <CartesianGrid stroke="rgb(62 65 70)" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="rgb(161 166 176)" />
                <YAxis stroke="rgb(161 166 176)" />
                <Bar dataKey="value" fill="rgb(45 212 191)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-sm text-muted">No meeting records available.</p>
        </AnalyticsPanel>

        <AnalyticsPanel title="Speaking-time distribution">
          <EmptyState
            icon={<Clock3 size={20} aria-hidden="true" />}
            title="No speaker analytics"
            message="Speaking time will be summed from transcript segment durations."
          />
        </AnalyticsPanel>

        <AnalyticsPanel title="Action-item completion">
          <EmptyState
            icon={<CheckCircle2 size={20} aria-hidden="true" />}
            title="No action-item analytics"
            message="Completion rate will be computed from stored open and completed tasks."
          />
        </AnalyticsPanel>

        <AnalyticsPanel title="Recurring topics">
          <EmptyState
            icon={<Tags size={20} aria-hidden="true" />}
            title="No recurring topics"
            message="Topic counts will be aggregated from meeting analysis records."
          />
        </AnalyticsPanel>
      </div>
    </div>
  );
}
