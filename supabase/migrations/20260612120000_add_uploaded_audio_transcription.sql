-- ScribeFlow Phase 3 uploaded-audio transcription persistence.
-- Deepgram output is normalized by the backend, then written atomically through
-- this RPC so speakers and transcript segments cannot be partially replaced.

alter table public.meetings
drop constraint meetings_status_check;

alter table public.meetings
add constraint meetings_status_check check (
  status in (
    'created',
    'uploading',
    'transcribing',
    'transcribed',
    'analysing',
    'indexing',
    'completed',
    'failed'
  )
);

create or replace function public.replace_meeting_transcription(
  p_meeting_id uuid,
  p_duration_seconds double precision,
  p_language text,
  p_model_name text,
  p_provider_request_id text,
  p_diarize_model text,
  p_confidence double precision,
  p_word_count integer,
  p_speaker_count integer,
  p_segment_count integer,
  p_speakers jsonb,
  p_segments jsonb,
  p_processing_started_at timestamptz,
  p_processing_time_ms bigint
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_finished_at timestamptz := now();
  v_current_status text;
begin
  if coalesce(jsonb_typeof(p_speakers), 'null') <> 'array' then
    raise exception 'p_speakers must be a JSON array' using errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(p_segments), 'null') <> 'array' then
    raise exception 'p_segments must be a JSON array' using errcode = '22023';
  end if;

  if jsonb_array_length(p_speakers) = 0 then
    raise exception 'p_speakers must contain at least one speaker' using errcode = '22023';
  end if;

  if jsonb_array_length(p_segments) = 0 then
    raise exception 'p_segments must contain at least one segment' using errcode = '22023';
  end if;

  select status
  into v_current_status
  from public.meetings
  where id = p_meeting_id
  for update;

  if not found then
    raise exception 'meeting % was not found', p_meeting_id using errcode = 'P0002';
  end if;

  if v_current_status <> 'transcribing' then
    raise exception 'meeting % must be transcribing before transcript replacement', p_meeting_id
      using errcode = '23514';
  end if;

  perform 1
  from jsonb_to_recordset(p_speakers) as speaker(
    raw_speaker_index integer,
    display_name text,
    total_speaking_seconds double precision,
    speaking_percentage double precision
  )
  where
    speaker.raw_speaker_index is null
    or speaker.raw_speaker_index < 0
    or nullif(btrim(coalesce(speaker.display_name, '')), '') is null
    or coalesce(speaker.total_speaking_seconds, 0) < 0
    or coalesce(speaker.speaking_percentage, 0) < 0
    or coalesce(speaker.speaking_percentage, 0) > 100;

  if found then
    raise exception 'p_speakers contains invalid speaker records' using errcode = '22023';
  end if;

  perform 1
  from jsonb_to_recordset(p_segments) as segment(
    raw_speaker_index integer,
    segment_index integer,
    start_ms bigint,
    end_ms bigint,
    text text,
    confidence double precision,
    words jsonb
  )
  where
    segment.segment_index is null
    or segment.segment_index < 0
    or segment.start_ms is null
    or segment.start_ms < 0
    or segment.end_ms is null
    or segment.end_ms < segment.start_ms
    or nullif(btrim(coalesce(segment.text, '')), '') is null
    or (segment.raw_speaker_index is not null and segment.raw_speaker_index < 0)
    or (segment.confidence is not null and (segment.confidence < 0 or segment.confidence > 1))
    or coalesce(jsonb_typeof(segment.words), 'array') <> 'array';

  if found then
    raise exception 'p_segments contains invalid transcript segment records' using errcode = '22023';
  end if;

  delete from public.transcript_segments
  where meeting_id = p_meeting_id;

  delete from public.meeting_speakers
  where meeting_id = p_meeting_id;

  insert into public.meeting_speakers (
    meeting_id,
    raw_speaker_index,
    display_name,
    total_speaking_seconds,
    speaking_percentage
  )
  select
    p_meeting_id,
    speaker.raw_speaker_index,
    coalesce(
      nullif(btrim(speaker.display_name), ''),
      'Speaker ' || (speaker.raw_speaker_index + 1)::text
    ),
    greatest(coalesce(speaker.total_speaking_seconds, 0), 0),
    least(greatest(coalesce(speaker.speaking_percentage, 0), 0), 100)
  from jsonb_to_recordset(p_speakers) as speaker(
    raw_speaker_index integer,
    display_name text,
    total_speaking_seconds double precision,
    speaking_percentage double precision
  )
  order by speaker.raw_speaker_index;

  insert into public.transcript_segments (
    meeting_id,
    speaker_id,
    raw_speaker_index,
    segment_index,
    start_ms,
    end_ms,
    text,
    confidence,
    words
  )
  select
    p_meeting_id,
    meeting_speaker.id,
    segment.raw_speaker_index,
    segment.segment_index,
    segment.start_ms,
    segment.end_ms,
    segment.text,
    segment.confidence,
    coalesce(segment.words, '[]'::jsonb)
  from jsonb_to_recordset(p_segments) as segment(
    raw_speaker_index integer,
    segment_index integer,
    start_ms bigint,
    end_ms bigint,
    text text,
    confidence double precision,
    words jsonb
  )
  left join public.meeting_speakers as meeting_speaker
    on meeting_speaker.meeting_id = p_meeting_id
    and meeting_speaker.raw_speaker_index = segment.raw_speaker_index
  order by segment.segment_index;

  update public.meetings
  set
    status = 'transcribed',
    duration_seconds = p_duration_seconds,
    language = coalesce(nullif(btrim(p_language), ''), language),
    processing_started_at = coalesce(p_processing_started_at, processing_started_at),
    processing_time_ms = p_processing_time_ms,
    error_code = null,
    error_message = null,
    metadata = jsonb_set(
      metadata,
      '{transcription}',
      jsonb_build_object(
        'provider',
        'deepgram',
        'requestId',
        p_provider_request_id,
        'model',
        p_model_name,
        'diarizeModel',
        p_diarize_model,
        'language',
        coalesce(nullif(btrim(p_language), ''), language),
        'durationSeconds',
        p_duration_seconds,
        'wordCount',
        greatest(coalesce(p_word_count, 0), 0),
        'speakerCount',
        greatest(coalesce(p_speaker_count, 0), 0),
        'segmentCount',
        greatest(coalesce(p_segment_count, 0), 0),
        'confidence',
        p_confidence,
        'processingTimeMs',
        p_processing_time_ms,
        'transcribedAt',
        v_finished_at
      ),
      true
    )
  where id = p_meeting_id;
end;
$$;

revoke all on function public.replace_meeting_transcription(
  uuid,
  double precision,
  text,
  text,
  text,
  text,
  double precision,
  integer,
  integer,
  integer,
  jsonb,
  jsonb,
  timestamptz,
  bigint
) from public, anon, authenticated;

grant execute on function public.replace_meeting_transcription(
  uuid,
  double precision,
  text,
  text,
  text,
  text,
  double precision,
  integer,
  integer,
  integer,
  jsonb,
  jsonb,
  timestamptz,
  bigint
) to service_role;

comment on function public.replace_meeting_transcription(
  uuid,
  double precision,
  text,
  text,
  text,
  text,
  double precision,
  integer,
  integer,
  integer,
  jsonb,
  jsonb,
  timestamptz,
  bigint
) is
  'Backend-only atomic replacement for Deepgram-normalized uploaded-audio transcription output.';

comment on table public.meeting_speakers is
  'Deepgram diarised speakers. Display names may be renamed by users through the backend API.';
comment on table public.transcript_segments is
  'Deepgram transcript segments with timestamps and word metadata. No direct browser table access.';
