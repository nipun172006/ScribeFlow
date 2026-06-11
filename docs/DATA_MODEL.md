# Supabase Data Model

Transport-layer dates are ISO 8601 strings in the API. Database dates use `timestamptz`. Database rows use `snake_case`; API responses map them to shared camelCase domain objects.

Phase 2 includes SQL migrations for all planned persistence tables, but AI-generated rows such as summaries, transcript segments, topics, chunks and action items are inserted only in later phases.

## Shared Rules

- Primary keys are UUIDs generated with `gen_random_uuid()`.
- Absolute times use `timestamptz`.
- Byte sizes and millisecond durations use `bigint`.
- All application tables have Row Level Security enabled.
- No `anon` or `authenticated` policies are created.
- Browser roles have direct grants revoked; the backend secret client is the only access path in this single-workspace academic version.

## `meetings`

Stores the persisted meeting record and upload metadata.

Key columns: `id`, `title`, `source_type`, `status`, `original_file_name`, `storage_bucket`, `storage_path`, `mime_type`, `expected_file_size_bytes`, `file_size_bytes`, `duration_seconds`, `language`, `recorded_at`, `processing_started_at`, `upload_completed_at`, `completed_at`, `processing_time_ms`, `known_participants`, `technical_terms`, `error_code`, `error_message`, `metadata`, `created_at`, `updated_at`.

Constraints: non-empty title, checked `source_type`, checked `status`, non-negative sizes/durations/processing time, storage bucket/path pair consistency, JSON object metadata, unique non-null `(storage_bucket, storage_path)`.

Indexes: `created_at desc`, `recorded_at desc`, `status`, `source_type`, `(status, created_at desc)`, unique partial storage object index.

Deterministic fields: status transitions, storage metadata, byte counts, upload/completion timestamps, processing time.  
AI-generated fields later: `duration_seconds`, detected `language`, error fields from provider failures.  
User-editable fields now or later: `title`, `recorded_at`, `known_participants`, `technical_terms`.

## `meeting_speakers`

Stores diarised speaker identities and renameable display names.

Columns: `id`, `meeting_id`, `raw_speaker_index`, `display_name`, `total_speaking_seconds`, `speaking_percentage`, `created_at`, `updated_at`.

Relationship: `meeting_id` references `meetings(id)` with `on delete cascade`.

Constraints: non-negative raw speaker index, non-blank display name, non-negative speaking seconds, percentage between 0 and 100, unique `(meeting_id, raw_speaker_index)`.

Indexes: `meeting_id`, `(meeting_id, raw_speaker_index)`.

Deterministic fields: speaking totals and percentages.  
AI-generated fields later: initial raw speaker grouping from diarisation.  
User-editable fields: `display_name`.

## `transcript_segments`

Stores normalized timestamped transcript text.

Columns: `id`, `meeting_id`, `speaker_id`, `raw_speaker_index`, `segment_index`, `start_ms`, `end_ms`, `text`, `confidence`, `words`, generated `search_vector`, `created_at`.

Relationships: `meeting_id` references meetings with `on delete cascade`; `speaker_id` references speakers with `on delete set null`.

Constraints: non-negative segment index and start time, `end_ms >= start_ms`, raw speaker index null or non-negative, non-blank text, confidence null or 0..1, `words` JSON array, unique `(meeting_id, segment_index)`.

Indexes: `(meeting_id, segment_index)`, `(meeting_id, start_ms)`, `speaker_id`, GIN on `search_vector`.

AI-generated fields later: text, confidence, word metadata, speaker labels.  
Deterministic fields: segment index after normalization, generated search vector.  
User-editable fields: none in Phase 2.

## `meeting_summaries`

Stores one structured summary per meeting after analysis succeeds.

Columns: `meeting_id`, `attendees`, `executive_overview`, `key_decisions`, `discussion_points`, `open_questions`, `next_steps`, `model_name`, `schema_version`, `created_at`, `updated_at`.

Relationship: `meeting_id` is the primary key and references meetings with `on delete cascade`.

Constraints: JSON arrays for attendees, decisions, discussion points, open questions and next steps.

AI-generated fields later: all summary content and model name.  
Deterministic fields: schema version and timestamps.  
User-editable fields: none in Phase 2.

## `action_items`

Stores extracted task records and user-controlled completion status.

Columns: `id`, `meeting_id`, `task`, `owner_name`, `owner_speaker_id`, `deadline`, `deadline_text`, `status`, `confidence`, `source_segment_id`, `source_start_ms`, `source_end_ms`, `evidence_text`, `completed_at`, `created_at`, `updated_at`.

Relationships: meeting cascade delete; owner speaker and source segment use `on delete set null`.

Constraints: non-blank task, status `open` or `completed`, confidence null or 0..1, non-negative source timestamps, `source_end_ms >= source_start_ms`.

Indexes: `(meeting_id, status)`, `owner_speaker_id`, `deadline`, `source_segment_id`.

AI-generated fields later: task, owner, deadline, confidence, evidence.  
Deterministic fields: status, `completed_at`, timestamps.  
User-editable fields in Phase 2: `status` only.

## `meeting_topics`

Stores extracted topic labels for later aggregation.

Columns: `id`, `meeting_id`, `normalized_label`, `display_label`, `confidence`, `mention_count`, `created_at`, `updated_at`.

Relationship: `meeting_id` references meetings with `on delete cascade`.

Constraints: non-blank labels, confidence null or 0..1, positive mention count.

Indexes: case-insensitive unique index on `(meeting_id, lower(normalized_label))`, plus `lower(normalized_label)` for cross-meeting aggregation.

AI-generated fields later: labels, confidence, mention count.  
Deterministic fields: lowercase normalization by application logic, timestamps.  
User-editable fields: none in Phase 2.

## `meeting_chunks`

Stores future RAG chunks and vector embeddings. Embeddings remain null during Phase 2.

Columns: `id`, `meeting_id`, `chunk_index`, `content`, `start_ms`, `end_ms`, `speaker_names`, `metadata`, `embedding extensions.vector(768)`, `embedding_model`, generated `search_vector`, `created_at`.

Relationship: `meeting_id` references meetings with `on delete cascade`.

Constraints: non-negative chunk index, non-blank content, start/end null or non-negative, `end_ms >= start_ms`, JSON object metadata, unique `(meeting_id, chunk_index)`.

Indexes: `(meeting_id, chunk_index)`, `(meeting_id, start_ms)`, GIN on `search_vector`, HNSW cosine index on `embedding` where embedding is not null.

AI-generated fields later: content chunks, embedding, embedding model.  
Deterministic fields: chunk order, source span, search vector.  
User-editable fields: none in Phase 2.

## Private Storage Bucket

Migration `20260611191000_create_private_audio_bucket.sql` creates or updates `meeting-audio` as a private Supabase Storage bucket.

Configuration: `public = false`, file size limit `262144000`, MIME allow-list for common audio/video meeting recordings. No anonymous storage policies are created.
