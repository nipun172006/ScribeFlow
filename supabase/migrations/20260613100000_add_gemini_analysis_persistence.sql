-- ScribeFlow Phase 4A Gemini structured-analysis persistence.
-- The backend calls Gemini with text-only transcript segments, then writes the
-- validated result atomically through this RPC. Browser roles still receive no
-- direct table or function access.

alter table public.action_items
add column if not exists evidence_segment_ids uuid[] not null default '{}';

create index if not exists action_items_evidence_segment_ids_gin_idx
  on public.action_items using gin (evidence_segment_ids);

comment on column public.action_items.evidence_segment_ids is
  'Gemini evidence transcript segment IDs. Validated by the backend and persistence RPC.';

create or replace function public.persist_meeting_analysis(
  p_meeting_id uuid,
  p_model_name text,
  p_response_id text,
  p_processing_time_ms bigint,
  p_analysis jsonb
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_finished_at timestamptz := now();
  v_current_status text;
begin
  if coalesce(jsonb_typeof(p_analysis), 'null') <> 'object' then
    raise exception 'p_analysis must be a JSON object' using errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(p_analysis->'attendees'), 'null') <> 'array'
    or coalesce(jsonb_typeof(p_analysis->'keyDecisions'), 'null') <> 'array'
    or coalesce(jsonb_typeof(p_analysis->'discussionPoints'), 'null') <> 'array'
    or coalesce(jsonb_typeof(p_analysis->'openQuestions'), 'null') <> 'array'
    or coalesce(jsonb_typeof(p_analysis->'nextSteps'), 'null') <> 'array'
    or coalesce(jsonb_typeof(p_analysis->'topics'), 'null') <> 'array'
    or coalesce(jsonb_typeof(p_analysis->'actionItems'), 'null') <> 'array'
  then
    raise exception 'p_analysis contains invalid analysis arrays' using errcode = '22023';
  end if;

  select status
  into v_current_status
  from public.meetings
  where id = p_meeting_id
  for update;

  if not found then
    raise exception 'meeting % was not found', p_meeting_id using errcode = 'P0002';
  end if;

  if v_current_status <> 'analysing' then
    raise exception 'meeting % must be analysing before analysis persistence', p_meeting_id
      using errcode = '23514';
  end if;

  perform 1
  from (
    select item->>'text' as item_text, item->'evidenceSegmentIds' as evidence_ids
    from jsonb_array_elements(p_analysis->'keyDecisions') as item
    union all
    select item->>'text' as item_text, item->'evidenceSegmentIds' as evidence_ids
    from jsonb_array_elements(p_analysis->'discussionPoints') as item
    union all
    select item->>'text' as item_text, item->'evidenceSegmentIds' as evidence_ids
    from jsonb_array_elements(p_analysis->'openQuestions') as item
    union all
    select item->>'text' as item_text, item->'evidenceSegmentIds' as evidence_ids
    from jsonb_array_elements(p_analysis->'nextSteps') as item
  ) as evidence_item
  where
    nullif(btrim(coalesce(evidence_item.item_text, '')), '') is null
    or coalesce(jsonb_typeof(evidence_item.evidence_ids), 'null') <> 'array';

  if found then
    raise exception 'p_analysis contains invalid evidence-backed summary items'
      using errcode = '22023';
  end if;

  perform 1
  from jsonb_to_recordset(p_analysis->'actionItems') as action_item(
    task text,
    "ownerName" text,
    "deadlineText" text,
    confidence double precision,
    "evidenceSegmentIds" jsonb
  )
  where
    nullif(btrim(coalesce(action_item.task, '')), '') is null
    or action_item.confidence is null
    or action_item.confidence < 0
    or action_item.confidence > 1
    or coalesce(jsonb_typeof(action_item."evidenceSegmentIds"), 'null') <> 'array';

  if found then
    raise exception 'p_analysis contains invalid action items' using errcode = '22023';
  end if;

  perform 1
  from (
    select evidence_id::uuid as segment_id
    from jsonb_array_elements(p_analysis->'keyDecisions') as item
    cross join lateral jsonb_array_elements_text(item->'evidenceSegmentIds') as evidence_id
    union all
    select evidence_id::uuid as segment_id
    from jsonb_array_elements(p_analysis->'discussionPoints') as item
    cross join lateral jsonb_array_elements_text(item->'evidenceSegmentIds') as evidence_id
    union all
    select evidence_id::uuid as segment_id
    from jsonb_array_elements(p_analysis->'openQuestions') as item
    cross join lateral jsonb_array_elements_text(item->'evidenceSegmentIds') as evidence_id
    union all
    select evidence_id::uuid as segment_id
    from jsonb_array_elements(p_analysis->'nextSteps') as item
    cross join lateral jsonb_array_elements_text(item->'evidenceSegmentIds') as evidence_id
    union all
    select evidence_id::uuid as segment_id
    from jsonb_array_elements(p_analysis->'actionItems') as item
    cross join lateral jsonb_array_elements_text(item->'evidenceSegmentIds') as evidence_id
  ) as evidence
  left join public.transcript_segments as segment
    on segment.id = evidence.segment_id
    and segment.meeting_id = p_meeting_id
  where segment.id is null;

  if found then
    raise exception 'p_analysis references unknown transcript segment IDs'
      using errcode = '23503';
  end if;

  delete from public.action_items
  where meeting_id = p_meeting_id;

  delete from public.meeting_topics
  where meeting_id = p_meeting_id;

  delete from public.meeting_summaries
  where meeting_id = p_meeting_id;

  insert into public.meeting_summaries (
    meeting_id,
    attendees,
    executive_overview,
    key_decisions,
    discussion_points,
    open_questions,
    next_steps,
    model_name,
    schema_version
  )
  values (
    p_meeting_id,
    coalesce(p_analysis->'attendees', '[]'::jsonb),
    coalesce(p_analysis->>'executiveOverview', ''),
    coalesce(p_analysis->'keyDecisions', '[]'::jsonb),
    coalesce(p_analysis->'discussionPoints', '[]'::jsonb),
    coalesce(p_analysis->'openQuestions', '[]'::jsonb),
    coalesce(p_analysis->'nextSteps', '[]'::jsonb),
    nullif(btrim(p_model_name), ''),
    1
  );

  insert into public.meeting_topics (
    meeting_id,
    normalized_label,
    display_label,
    confidence,
    mention_count
  )
  select
    p_meeting_id,
    lower(btrim(topic.value)),
    btrim(topic.value),
    null,
    count(*)::integer
  from jsonb_array_elements_text(p_analysis->'topics') as topic(value)
  where nullif(btrim(topic.value), '') is not null
  group by lower(btrim(topic.value)), btrim(topic.value);

  insert into public.action_items (
    meeting_id,
    task,
    owner_name,
    deadline_text,
    status,
    confidence,
    source_segment_id,
    source_start_ms,
    source_end_ms,
    evidence_text,
    evidence_segment_ids
  )
  select
    p_meeting_id,
    btrim(action_item.task),
    nullif(btrim(action_item."ownerName"), ''),
    nullif(btrim(action_item."deadlineText"), ''),
    'open',
    action_item.confidence,
    first_segment.id,
    evidence_span.start_ms,
    evidence_span.end_ms,
    evidence_span.evidence_text,
    coalesce(evidence.evidence_segment_ids, '{}'::uuid[])
  from jsonb_to_recordset(p_analysis->'actionItems') as action_item(
    task text,
    "ownerName" text,
    "deadlineText" text,
    confidence double precision,
    "evidenceSegmentIds" jsonb
  )
  cross join lateral (
    select coalesce(array_agg(evidence_id.value::uuid), '{}'::uuid[]) as evidence_segment_ids
    from jsonb_array_elements_text(action_item."evidenceSegmentIds") as evidence_id(value)
  ) as evidence
  left join lateral (
    select segment.id
    from unnest(evidence.evidence_segment_ids) with ordinality as segment_id(id, ordinal)
    join public.transcript_segments as segment
      on segment.id = segment_id.id
      and segment.meeting_id = p_meeting_id
    order by segment_id.ordinal
    limit 1
  ) as first_segment on true
  left join lateral (
    select
      min(segment.start_ms) as start_ms,
      max(segment.end_ms) as end_ms,
      string_agg(segment.text, ' ' order by segment.segment_index) as evidence_text
    from public.transcript_segments as segment
    where segment.meeting_id = p_meeting_id
      and segment.id = any(evidence.evidence_segment_ids)
  ) as evidence_span on true;

  update public.meetings
  set
    status = 'completed',
    completed_at = v_finished_at,
    error_code = null,
    error_message = null,
    metadata = jsonb_set(
      metadata,
      '{analysis}',
      jsonb_build_object(
        'provider',
        'gemini',
        'model',
        p_model_name,
        'responseId',
        p_response_id,
        'processingTimeMs',
        p_processing_time_ms,
        'attendeeCount',
        jsonb_array_length(p_analysis->'attendees'),
        'decisionCount',
        jsonb_array_length(p_analysis->'keyDecisions'),
        'discussionPointCount',
        jsonb_array_length(p_analysis->'discussionPoints'),
        'openQuestionCount',
        jsonb_array_length(p_analysis->'openQuestions'),
        'nextStepCount',
        jsonb_array_length(p_analysis->'nextSteps'),
        'topicCount',
        jsonb_array_length(p_analysis->'topics'),
        'actionItemCount',
        jsonb_array_length(p_analysis->'actionItems'),
        'analysedAt',
        v_finished_at
      ),
      true
    )
  where id = p_meeting_id;
end;
$$;

revoke all on function public.persist_meeting_analysis(
  uuid,
  text,
  text,
  bigint,
  jsonb
) from public, anon, authenticated;

grant execute on function public.persist_meeting_analysis(
  uuid,
  text,
  text,
  bigint,
  jsonb
) to service_role;

comment on function public.persist_meeting_analysis(
  uuid,
  text,
  text,
  bigint,
  jsonb
) is
  'Backend-only atomic persistence for validated Gemini structured meeting analysis.';
