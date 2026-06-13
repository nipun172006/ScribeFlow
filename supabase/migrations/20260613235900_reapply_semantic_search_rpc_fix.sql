-- ScribeFlow Phase 5A: Fix semantic search RPC for meeting chunks
-- Updates the search_path to include the extensions schema so the `<=>` operator can be found

create or replace function public.match_meeting_chunks(
  p_query_embedding extensions.vector,
  p_match_threshold float8 default 0.5,
  p_match_count int default 10
)
returns table (
  id uuid,
  meeting_id uuid,
  content text,
  metadata jsonb,
  start_ms bigint,
  end_ms bigint,
  speaker_names text[],
  similarity float8
)
language plpgsql
set search_path = public, extensions, pg_temp
as $$
begin
  return query
  select
    chunk.id,
    chunk.meeting_id,
    chunk.content,
    chunk.metadata,
    chunk.start_ms,
    chunk.end_ms,
    chunk.speaker_names,
    (1 - (chunk.embedding <=> p_query_embedding))::float8 as similarity
  from public.meeting_chunks as chunk
  where chunk.embedding is not null
    and (1 - (chunk.embedding <=> p_query_embedding)) > p_match_threshold
  order by chunk.embedding <=> p_query_embedding
  limit p_match_count;
end;
$$;
