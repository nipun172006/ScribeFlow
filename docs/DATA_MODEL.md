# Supabase Data Model

Transport-layer dates are ISO 8601 strings in the API. Database dates use `timestamptz`. Database rows use `snake_case`; API responses map them to shared camelCase domain objects.

The current schema supports uploaded and browser-recorded meetings, Deepgram transcription and diarisation, Gemini summaries and action items, topic persistence and semantic-search chunks. Database rows remain `snake_case`; API responses expose camelCase domain objects.

## Shared Rules

- Primary keys are UUIDs generated with `gen_random_uuid()`.
- Absolute times use `timestamptz`.
- Byte sizes and millisecond durations use `bigint`.
- All application tables have Row Level Security enabled.
- No `anon` or `authenticated` policies are created.
- Browser roles have direct grants revoked; the backend secret client is the only access path in this single-workspace academic version.

## `meetings`

Stores the persisted meeting record, upload metadata and processing state.

Key columns: `id`, `title`, `source_type`, `status`, `original_file_name`, `storage_bucket`, `storage_path`, `mime_type`, `expected_file_size_bytes`, `file_size_bytes`, `duration_seconds`, `language`, `recorded_at`, `processing_started_at`, `upload_completed_at`, `completed_at`, `processing_time_ms`, `known_participants`, `technical_terms`, `error_code`, `error_message`, `metadata`, `created_at`, `updated_at`.

Constraints: non-empty title, checked `source_type`, checked `status` including `transcribed`, non-negative sizes/durations/processing time, storage bucket/path pair consistency, JSON object metadata, unique non-null `(storage_bucket, storage_path)`.

Indexes: `created_at desc`, `recorded_at desc`, `status`, `source_type`, `(status, created_at desc)`, unique partial storage object index.

Deterministic fields: status transitions, storage metadata, byte counts, upload/completion timestamps, processing time.  
AI/provider-generated fields now: Deepgram duration and detected language after transcription. Error fields may store safe provider failure messages.
User-editable fields now or later: `title`, `recorded_at`, `known_participants`, `technical_terms`.

## `meeting_speakers`

Stores diarised speaker identities and renameable display names.

Columns: `id`, `meeting_id`, `raw_speaker_index`, `display_name`, `total_speaking_seconds`, `speaking_percentage`, `created_at`, `updated_at`.

Relationship: `meeting_id` references `meetings(id)` with `on delete cascade`.

Constraints: non-negative raw speaker index, non-blank display name, non-negative speaking seconds, percentage between 0 and 100, unique `(meeting_id, raw_speaker_index)`.

Indexes: `meeting_id`, `(meeting_id, raw_speaker_index)`.

Deterministic fields: speaking totals and percentages from word timestamps.
AI/provider-generated fields now: initial raw speaker grouping from Deepgram diarisation.
User-editable fields: `display_name`.

## `transcript_segments`

Stores normalized timestamped transcript text.

Columns: `id`, `meeting_id`, `speaker_id`, `raw_speaker_index`, `segment_index`, `start_ms`, `end_ms`, `text`, `confidence`, `words`, generated `search_vector`, `created_at`.

Relationships: `meeting_id` references meetings with `on delete cascade`; `speaker_id` references speakers with `on delete set null`.

Constraints: non-negative segment index and start time, `end_ms >= start_ms`, raw speaker index null or non-negative, non-blank text, confidence null or 0..1, `words` JSON array, unique `(meeting_id, segment_index)`.

Indexes: `(meeting_id, segment_index)`, `(meeting_id, start_ms)`, `speaker_id`, GIN on `search_vector`.

AI/provider-generated fields now: text, confidence, word metadata, speaker labels.
Deterministic fields: segment index after normalization, generated search vector.  
User-editable fields: none in Phase 3.

## `meeting_summaries`

Stores one structured summary per meeting after analysis succeeds.

Columns: `meeting_id`, `attendees`, `executive_overview`, `key_decisions`, `discussion_points`, `open_questions`, `next_steps`, `model_name`, `schema_version`, `created_at`, `updated_at`.

Relationship: `meeting_id` is the primary key and references meetings with `on delete cascade`.

Constraints: JSON arrays for attendees, decisions, discussion points, open questions and next steps.

AI-generated fields now: all summary content and model name. The JSON section arrays store validated text plus evidence segment IDs; the API maps them to UI-safe summary text for meeting detail.
Deterministic fields: schema version and timestamps.  
User-editable fields: none in Phase 4A.

## `action_items`

Stores extracted task records and user-controlled completion status.

Columns: `id`, `meeting_id`, `task`, `owner_name`, `owner_speaker_id`, `deadline`, `deadline_text`, `status`, `confidence`, `source_segment_id`, `source_start_ms`, `source_end_ms`, `evidence_text`, `evidence_segment_ids`, `completed_at`, `created_at`, `updated_at`.

Relationships: meeting cascade delete; owner speaker and source segment use `on delete set null`.

Constraints: non-blank task, status `open` or `completed`, confidence null or 0..1, non-negative source timestamps, `source_end_ms >= source_start_ms`.

Indexes: `(meeting_id, status)`, `owner_speaker_id`, `deadline`, `source_segment_id`, GIN on `evidence_segment_ids`.

AI-generated fields now: task, owner, deadline text, confidence and evidence. Unknown owners/deadlines remain null.
Deterministic fields: status, `completed_at`, timestamps.  
User-editable fields in Phase 4A: `status` only.

## `meeting_topics`

Stores extracted topic labels for later aggregation.

Columns: `id`, `meeting_id`, `normalized_label`, `display_label`, `confidence`, `mention_count`, `created_at`, `updated_at`.

Relationship: `meeting_id` references meetings with `on delete cascade`.

Constraints: non-blank labels, confidence null or 0..1, positive mention count.

Indexes: case-insensitive unique index on `(meeting_id, lower(normalized_label))`, plus `lower(normalized_label)` for cross-meeting aggregation.

AI-generated fields now: display labels and mention count from Gemini topic strings.
Deterministic fields: lowercase normalization by application logic, timestamps.  
User-editable fields: none in Phase 4A.

## Analysis RPC

Migration `20260613100000_add_gemini_analysis_persistence.sql` adds:

- `action_items.evidence_segment_ids`.
- `public.persist_meeting_analysis(...)`, a backend-only RPC that validates evidence segment IDs, replaces prior summary/topic/action rows atomically, stores safe Gemini metadata under `meetings.metadata.analysis`, and marks the meeting `completed`.

The API calls this RPC only after the Gemini service validates schema output. Controllers do not write raw Supabase analysis rows directly.

## `meeting_chunks`

Stores future RAG chunks and vector embeddings. Embeddings remain null during Phase 3.

Columns: `id`, `meeting_id`, `chunk_index`, `content`, `start_ms`, `end_ms`, `speaker_names`, `metadata`, `embedding extensions.vector(768)`, `embedding_model`, generated `search_vector`, `created_at`.

Relationship: `meeting_id` references meetings with `on delete cascade`.

Constraints: non-negative chunk index, non-blank content, start/end null or non-negative, `end_ms >= start_ms`, JSON object metadata, unique `(meeting_id, chunk_index)`.

Indexes: `(meeting_id, chunk_index)`, `(meeting_id, start_ms)`, GIN on `search_vector`, HNSW cosine index on `embedding` where embedding is not null.

AI-generated fields later: content chunks, embedding, embedding model.  
Deterministic fields: chunk order, source span, search vector.  
User-editable fields: none in Phase 3.

## Transcription RPC

Migration `20260612120000_add_uploaded_audio_transcription.sql` adds:

- `transcribed` as a valid meeting status.
- `public.replace_meeting_transcription(...)`, a backend-only RPC that atomically replaces `meeting_speakers` and `transcript_segments`, stores safe Deepgram metadata under `meetings.metadata.transcription`, clears safe error fields and marks the meeting `transcribed`.

Safe transcription metadata includes provider, request ID, model, diarisation model, language, duration, word count, speaker count, segment count, aggregate confidence, processing time and transcription timestamp. It never stores API keys, signed URLs, authorization headers or the raw provider response.

The API calls this RPC after normalizing Deepgram output. Controllers do not write raw Supabase rows directly.

## Private Storage Bucket

Migration `20260611191000_create_private_audio_bucket.sql` creates or updates `meeting-audio` as a private Supabase Storage bucket. Migration `20260614090000_align_audio_bucket_upload_limit.sql` aligns the bucket with the conservative Phase 9 application upload limit.

Configuration: `public = false`, file size limit `52428800`, MIME allow-list for common audio/video meeting recordings. No anonymous storage policies are created.
