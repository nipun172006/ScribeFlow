import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, Filter, Library, Search } from "lucide-react";
import type { MeetingListQuery } from "@scribeflow/shared";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { MeetingRow } from "../components/MeetingRow";
import { PageHeader } from "../components/PageHeader";
import { SearchInput } from "../components/SearchInput";
import { listMeetings } from "../lib/apiClient";

export function ArchivePage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [sort, setSort] = useState<MeetingListQuery["sort"]>("createdAt");
  const [order, setOrder] = useState<MeetingListQuery["order"]>("desc");
  const [page, setPage] = useState(1);

  const meetingsQuery = useQuery({
    queryKey: ["meetings", { query, status, sourceType, sort, order, page }],
    queryFn: () =>
      listMeetings({
        page,
        pageSize: 10,
        query: query || undefined,
        status: (status || undefined) as MeetingListQuery["status"] | undefined,
        sourceType: (sourceType || undefined) as
          | MeetingListQuery["sourceType"]
          | undefined,
        sort,
        order,
      }),
  });

  const items = meetingsQuery.data?.items ?? [];
  const pagination = meetingsQuery.data?.pagination;

  return (
    <div className="space-y-9">
      <PageHeader
        eyebrow="Archive"
        title="Meeting archive"
        description="Search and filter persisted meeting records. Open any meeting to review transcript, summary, actions, analytics and searchable evidence."
      />

      <section className="space-y-4 rounded-panel bg-white/[0.035] p-4 ring-1 ring-white/[0.07] backdrop-blur-xl md:p-5">
        <SearchInput
          label="Search archive"
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPage(1);
          }}
          placeholder="Search meeting titles"
        />
        <div className="grid gap-3 md:grid-cols-5">
          <label className="block">
            <span className="sf-label flex items-center gap-2">
              <CalendarRange size={16} aria-hidden="true" />
              Date
            </span>
            <input type="date" className="sf-field mt-2" disabled />
          </label>
          <label className="block">
            <span className="sf-label flex items-center gap-2">
              <Filter size={16} aria-hidden="true" />
              Topic
            </span>
            <select className="sf-field mt-2" defaultValue="" disabled>
              <option value="">All topics</option>
            </select>
          </label>
          <label className="block">
            <span className="sf-label">Status</span>
            <select
              className="sf-field mt-2"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="created">Created</option>
              <option value="uploading">Uploading</option>
              <option value="transcribing">Transcribing</option>
              <option value="transcribed">Transcribed</option>
              <option value="analysing">Analysing</option>
              <option value="indexing">Indexing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </label>
          <label className="block">
            <span className="sf-label">Source</span>
            <select
              className="sf-field mt-2"
              value={sourceType}
              onChange={(event) => {
                setSourceType(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All sources</option>
              <option value="upload">Upload</option>
              <option value="live">Live</option>
            </select>
          </label>
          <label className="block">
            <span className="sf-label">Sort</span>
            <select
              className="sf-field mt-2"
              value={`${sort}:${order}`}
              onChange={(event) => {
                const [nextSort, nextOrder] = event.target.value.split(":") as [
                  MeetingListQuery["sort"],
                  MeetingListQuery["order"],
                ];
                setSort(nextSort);
                setOrder(nextOrder);
                setPage(1);
              }}
            >
              <option value="createdAt:desc">Newest first</option>
              <option value="createdAt:asc">Oldest first</option>
              <option value="recordedAt:desc">Recorded newest</option>
              <option value="title:asc">Title A-Z</option>
            </select>
          </label>
        </div>
      </section>

      {meetingsQuery.isLoading ? <LoadingState label="Loading meetings" /> : null}

      {meetingsQuery.error instanceof Error ? (
        <ErrorState
          title="Meeting archive is unavailable"
          message={meetingsQuery.error.message}
        />
      ) : null}

      {!meetingsQuery.isLoading && !meetingsQuery.error && items.length === 0 ? (
        <EmptyState
          icon={<Library size={20} aria-hidden="true" />}
          title="Archive is empty"
          message="No meetings are stored yet. Upload or live metadata records will appear here after Supabase is configured."
          variant="open"
          action={
            <span className="inline-flex items-center gap-2 text-sm text-muted">
              <Search size={16} aria-hidden="true" />
              Current query: {query || "none"}
            </span>
          }
        />
      ) : null}

      {items.length > 0 ? (
        <section className="space-y-3" aria-label="Saved meetings">
          {items.map((meeting) => (
            <MeetingRow key={meeting.id} meeting={meeting} />
          ))}
          {pagination ? (
            <div className="flex items-center justify-between gap-4 pt-2">
              <p className="text-sm text-muted">
                Page {pagination.page} of {Math.max(1, pagination.totalPages)}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="sf-secondary-button px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  className="sf-secondary-button px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
