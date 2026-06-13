-- ScribeFlow Phase 5A: Add semantic search RPC for meeting chunks
-- Provides vector similarity search over meeting_chunks embeddings.

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
set search_path = public, pg_temp
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

revoke all on function public.match_meeting_chunks(
  extensions.vector,
  float8,
  int
) from public, anon, authenticated;

grant execute on function public.match_meeting_chunks(
  extensions.vector,
  float8,
  int
) to service_role;

comment on function public.match_meeting_chunks(
  extensions.vector,
  float8,
  int
) is
  'Backend-only semantic search over meeting chunks using vector similarity.';
