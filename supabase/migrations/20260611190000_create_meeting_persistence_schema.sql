-- ScribeFlow Phase 2 persistence schema.
-- Backend-only single-workspace academic application.
-- RLS is enabled as defense in depth; browser roles intentionally receive no table policies.

create extension if not exists pgcrypto;
create extension if not exists vector with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text not null,
  status text not null,
  original_file_name text,
  storage_bucket text,
  storage_path text,
  mime_type text,
  expected_file_size_bytes bigint,
  file_size_bytes bigint,
  duration_seconds double precision,
  language text,
  recorded_at timestamptz,
  processing_started_at timestamptz,
  upload_completed_at timestamptz,
  completed_at timestamptz,
  processing_time_ms bigint,
  known_participants text[] not null default '{}',
  technical_terms text[] not null default '{}',
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meetings_title_not_blank check (length(btrim(title)) > 0),
  constraint meetings_source_type_check check (source_type in ('upload', 'live')),
  constraint meetings_status_check check (
    status in (
      'created',
      'uploading',
      'transcribing',
      'analysing',
      'indexing',
      'completed',
      'failed'
    )
  ),
  constraint meetings_expected_file_size_nonnegative check (
    expected_file_size_bytes is null or expected_file_size_bytes >= 0
  ),
  constraint meetings_file_size_nonnegative check (
    file_size_bytes is null or file_size_bytes >= 0
  ),
  constraint meetings_duration_nonnegative check (
    duration_seconds is null or duration_seconds >= 0
  ),
  constraint meetings_processing_time_nonnegative check (
    processing_time_ms is null or processing_time_ms >= 0
  ),
  constraint meetings_storage_bucket_path_pair check (
    (storage_bucket is null and storage_path is null)
    or (storage_bucket is not null and storage_path is not null)
  ),
  constraint meetings_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create trigger set_meetings_updated_at
before update on public.meetings
for each row
execute function public.set_updated_at();

create index meetings_created_at_desc_idx on public.meetings (created_at desc);
create index meetings_recorded_at_desc_idx on public.meetings (recorded_at desc);
create index meetings_status_idx on public.meetings (status);
create index meetings_source_type_idx on public.meetings (source_type);
create index meetings_status_created_at_desc_idx on public.meetings (status, created_at desc);
create unique index meetings_storage_object_unique_idx
  on public.meetings (storage_bucket, storage_path)
  where storage_bucket is not null and storage_path is not null;

create table public.meeting_speakers (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  raw_speaker_index integer not null,
  display_name text not null,
  total_speaking_seconds double precision not null default 0,
  speaking_percentage double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_speakers_raw_index_nonnegative check (raw_speaker_index >= 0),
  constraint meeting_speakers_display_name_not_blank check (length(btrim(display_name)) > 0),
  constraint meeting_speakers_total_speaking_nonnegative check (total_speaking_seconds >= 0),
  constraint meeting_speakers_percentage_range check (
    speaking_percentage >= 0 and speaking_percentage <= 100
  ),
  constraint meeting_speakers_meeting_raw_unique unique (meeting_id, raw_speaker_index)
);

create trigger set_meeting_speakers_updated_at
before update on public.meeting_speakers
for each row
execute function public.set_updated_at();

create index meeting_speakers_meeting_id_idx on public.meeting_speakers (meeting_id);
create index meeting_speakers_meeting_raw_idx
  on public.meeting_speakers (meeting_id, raw_speaker_index);

create table public.transcript_segments (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  speaker_id uuid references public.meeting_speakers (id) on delete set null,
  raw_speaker_index integer,
  segment_index integer not null,
  start_ms bigint not null,
  end_ms bigint not null,
  text text not null,
  confidence double precision,
  words jsonb not null default '[]'::jsonb,
  search_vector tsvector generated always as (to_tsvector('simple'::regconfig, text)) stored,
  created_at timestamptz not null default now(),
  constraint transcript_segments_index_nonnegative check (segment_index >= 0),
  constraint transcript_segments_start_nonnegative check (start_ms >= 0),
  constraint transcript_segments_end_after_start check (end_ms >= start_ms),
  constraint transcript_segments_raw_speaker_nonnegative check (
    raw_speaker_index is null or raw_speaker_index >= 0
  ),
  constraint transcript_segments_text_not_blank check (length(btrim(text)) > 0),
  constraint transcript_segments_confidence_range check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  ),
  constraint transcript_segments_words_array check (jsonb_typeof(words) = 'array'),
  constraint transcript_segments_meeting_segment_unique unique (meeting_id, segment_index)
);

create index transcript_segments_meeting_segment_idx
  on public.transcript_segments (meeting_id, segment_index);
create index transcript_segments_meeting_start_idx
  on public.transcript_segments (meeting_id, start_ms);
create index transcript_segments_speaker_id_idx on public.transcript_segments (speaker_id);
create index transcript_segments_search_vector_idx
  on public.transcript_segments using gin (search_vector);

create table public.meeting_summaries (
  meeting_id uuid primary key references public.meetings (id) on delete cascade,
  attendees jsonb not null default '[]'::jsonb,
  executive_overview text not null default '',
  key_decisions jsonb not null default '[]'::jsonb,
  discussion_points jsonb not null default '[]'::jsonb,
  open_questions jsonb not null default '[]'::jsonb,
  next_steps jsonb not null default '[]'::jsonb,
  model_name text,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_summaries_attendees_array check (jsonb_typeof(attendees) = 'array'),
  constraint meeting_summaries_key_decisions_array check (jsonb_typeof(key_decisions) = 'array'),
  constraint meeting_summaries_discussion_points_array check (jsonb_typeof(discussion_points) = 'array'),
  constraint meeting_summaries_open_questions_array check (jsonb_typeof(open_questions) = 'array'),
  constraint meeting_summaries_next_steps_array check (jsonb_typeof(next_steps) = 'array')
);

create trigger set_meeting_summaries_updated_at
before update on public.meeting_summaries
for each row
execute function public.set_updated_at();

create table public.action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  task text not null,
  owner_name text,
  owner_speaker_id uuid references public.meeting_speakers (id) on delete set null,
  deadline timestamptz,
  deadline_text text,
  status text not null default 'open',
  confidence double precision,
  source_segment_id uuid references public.transcript_segments (id) on delete set null,
  source_start_ms bigint,
  source_end_ms bigint,
  evidence_text text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint action_items_task_not_blank check (length(btrim(task)) > 0),
  constraint action_items_status_check check (status in ('open', 'completed')),
  constraint action_items_confidence_range check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  ),
  constraint action_items_source_start_nonnegative check (
    source_start_ms is null or source_start_ms >= 0
  ),
  constraint action_items_source_end_nonnegative check (
    source_end_ms is null or source_end_ms >= 0
  ),
  constraint action_items_source_end_after_start check (
    source_start_ms is null or source_end_ms is null or source_end_ms >= source_start_ms
  )
);

create trigger set_action_items_updated_at
before update on public.action_items
for each row
execute function public.set_updated_at();

create index action_items_meeting_status_idx on public.action_items (meeting_id, status);
create index action_items_owner_speaker_id_idx on public.action_items (owner_speaker_id);
create index action_items_deadline_idx on public.action_items (deadline);
create index action_items_source_segment_id_idx on public.action_items (source_segment_id);

create table public.meeting_topics (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  normalized_label text not null,
  display_label text not null,
  confidence double precision,
  mention_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_topics_normalized_not_blank check (length(btrim(normalized_label)) > 0),
  constraint meeting_topics_display_not_blank check (length(btrim(display_label)) > 0),
  constraint meeting_topics_confidence_range check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  ),
  constraint meeting_topics_mention_count_positive check (mention_count > 0)
);

create trigger set_meeting_topics_updated_at
before update on public.meeting_topics
for each row
execute function public.set_updated_at();

create unique index meeting_topics_meeting_normalized_unique_idx
  on public.meeting_topics (meeting_id, lower(normalized_label));
create index meeting_topics_normalized_label_idx on public.meeting_topics (normalized_label);

create table public.meeting_chunks (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  start_ms bigint,
  end_ms bigint,
  speaker_names text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(768),
  embedding_model text,
  search_vector tsvector generated always as (to_tsvector('simple'::regconfig, content)) stored,
  created_at timestamptz not null default now(),
  constraint meeting_chunks_index_nonnegative check (chunk_index >= 0),
  constraint meeting_chunks_content_not_blank check (length(btrim(content)) > 0),
  constraint meeting_chunks_start_nonnegative check (start_ms is null or start_ms >= 0),
  constraint meeting_chunks_end_nonnegative check (end_ms is null or end_ms >= 0),
  constraint meeting_chunks_end_after_start check (
    start_ms is null or end_ms is null or end_ms >= start_ms
  ),
  constraint meeting_chunks_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint meeting_chunks_meeting_chunk_unique unique (meeting_id, chunk_index)
);

create index meeting_chunks_meeting_chunk_idx on public.meeting_chunks (meeting_id, chunk_index);
create index meeting_chunks_meeting_start_idx on public.meeting_chunks (meeting_id, start_ms);
create index meeting_chunks_search_vector_idx on public.meeting_chunks using gin (search_vector);
create index meeting_chunks_embedding_hnsw_idx
  on public.meeting_chunks
  using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

alter table public.meetings enable row level security;
alter table public.meeting_speakers enable row level security;
alter table public.transcript_segments enable row level security;
alter table public.meeting_summaries enable row level security;
alter table public.action_items enable row level security;
alter table public.meeting_topics enable row level security;
alter table public.meeting_chunks enable row level security;

revoke all on table public.meetings from anon, authenticated;
revoke all on table public.meeting_speakers from anon, authenticated;
revoke all on table public.transcript_segments from anon, authenticated;
revoke all on table public.meeting_summaries from anon, authenticated;
revoke all on table public.action_items from anon, authenticated;
revoke all on table public.meeting_topics from anon, authenticated;
revoke all on table public.meeting_chunks from anon, authenticated;

comment on table public.meetings is
  'ScribeFlow backend-only meetings. RLS enabled; browser roles intentionally have no policies.';
comment on table public.meeting_speakers is
  'Diarised speakers for later transcription phases. Backend secret client only in Phase 2.';
comment on table public.transcript_segments is
  'Future transcript segments. No direct browser table access.';
comment on table public.meeting_summaries is
  'Future Gemini structured summaries. Rows are inserted only after analysis succeeds.';
comment on table public.action_items is
  'Future extracted action items with source evidence. Backend updates status.';
comment on table public.meeting_topics is
  'Future extracted topics for aggregation. Backend-only access.';
comment on table public.meeting_chunks is
  'Future RAG chunks. Embeddings remain null until the RAG phase.';
