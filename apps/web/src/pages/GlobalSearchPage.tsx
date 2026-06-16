import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Search, Sparkles } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { SearchInput } from "../components/SearchInput";
import { searchMeetings } from "../lib/apiClient";

export function GlobalSearchPage() {
  const [query, setQuery] = useState("");

  const searchMutation = useMutation({
    mutationFn: (searchQuery: string) => searchMeetings(searchQuery),
  });

  const handleSearch = () => {
    if (query.trim()) {
      searchMutation.mutate(query.trim());
    }
  };

  const hasSearched = searchMutation.data !== undefined;
  const results = searchMutation.data?.results ?? [];

  return (
    <div className="space-y-9">
      <PageHeader
        eyebrow="Search"
        title="Ask across meetings"
        description="Natural-language search retrieves transcript chunks, summaries and timestamped sources."
      />

      <section className="rounded-[2rem] bg-white/[0.035] p-3 ring-1 ring-white/[0.08] backdrop-blur-xl sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <SearchInput
              label="Search all meeting content"
              value={query}
              onChange={setQuery}
              onSubmit={handleSearch}
              placeholder="What did we decide about the project scope?"
            />
          </div>
          <button
            type="button"
            onClick={handleSearch}
            disabled={searchMutation.isPending || !query.trim()}
            className="inline-flex items-center justify-center rounded-control bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast transition duration-fast hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            <Search size={16} className="mr-2" aria-hidden="true" />
            Search
          </button>
        </div>
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <Sparkles size={16} aria-hidden="true" className="text-accent" />
          Results cite source meetings, speakers and timestamps.
        </p>
      </section>

      {searchMutation.isPending && <LoadingState label="Searching across meetings" />}

      {searchMutation.error && (
        <ErrorState title="Search failed" message={searchMutation.error.message} />
      )}

      {hasSearched &&
        !searchMutation.isPending &&
        !searchMutation.error &&
        results.length === 0 && (
          <EmptyState
            icon={<Search size={20} aria-hidden="true" />}
            title="No results found"
            message={`No matches found for "${searchMutation.variables}". Try a different query.`}
            variant="open"
          />
        )}

      {hasSearched && !searchMutation.isPending && results.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-muted">
            Found {results.length} result{results.length === 1 ? "" : "s"}
          </h2>
          <div className="grid gap-4">
            {results.map((result, index) => {
              const segmentId = result.sourceSegmentIds?.[0];
              const targetUrl = segmentId
                ? `/meetings/${result.meetingId}?segmentId=${segmentId}`
                : `/meetings/${result.meetingId}`;

              return (
                <div
                  key={`${result.meetingId}-${index}`}
                  className="flex flex-col gap-3 rounded-card border border-white/10 bg-white/[0.06] p-5 shadow-soft backdrop-blur-xl transition duration-normal hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.09]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <Link
                        to={targetUrl}
                        className="text-base font-semibold text-primary hover:text-accent focus-visible:outline-accent"
                      >
                        {result.meetingTitle}
                      </Link>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-control border border-accent/25 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                          {result.chunkKind.replace(/_/g, " ")}
                        </span>
                        {result.similarityScore !== null && (
                          <span className="text-xs text-muted">
                            Score: {(result.similarityScore * 100).toFixed(1)}%
                          </span>
                        )}
                        {result.startMs !== null && (
                          <span className="text-xs text-muted">
                            Time: {Math.floor(result.startMs / 1000)}s
                          </span>
                        )}
                        {result.speakerNames?.length > 0 && (
                          <span className="text-xs text-muted">
                            Speaker: {result.speakerNames.join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                    <Link
                      to={targetUrl}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-control border border-white/10 bg-white/[0.045] px-3 py-1.5 text-sm font-medium text-muted transition hover:border-white/20 hover:bg-white/[0.08] hover:text-primary focus-visible:outline-accent"
                      aria-label={`Open meeting ${result.meetingTitle}`}
                    >
                      Open <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  </div>
                  <p className="text-sm leading-relaxed text-muted line-clamp-3">
                    {result.chunkText}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!hasSearched && !searchMutation.isPending && !searchMutation.error && (
        <EmptyState
          icon={<Search size={20} aria-hidden="true" />}
          title="Semantic Search"
          message="Enter a question or topic above to find relevant moments across all your indexed meetings."
          variant="open"
        />
      )}
    </div>
  );
}
