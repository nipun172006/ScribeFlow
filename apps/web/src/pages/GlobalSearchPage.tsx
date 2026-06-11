import { useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { SearchInput } from "../components/SearchInput";

export function GlobalSearchPage() {
  const [query, setQuery] = useState("");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Search"
        title="Ask across meetings"
        description="Natural-language search will retrieve transcript chunks, summaries and timestamped sources after RAG indexing is implemented."
      />

      <section className="rounded-card border border-border bg-surface p-5">
        <SearchInput
          label="Search all meeting content"
          value={query}
          onChange={setQuery}
          placeholder="What did we decide about the project scope?"
        />
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <Sparkles size={16} aria-hidden="true" />
          Results will cite source meetings, speakers and timestamps.
        </p>
      </section>

      <EmptyState
        icon={<Search size={20} aria-hidden="true" />}
        title="No search index yet"
        message="The search UI is ready for source-result cards, but no transcript embeddings have been generated."
      />
    </div>
  );
}
