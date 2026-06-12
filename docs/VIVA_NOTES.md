# Viva Notes

## Speech-to-Text

Speech-to-text converts spoken audio into written text. In ScribeFlow Phase 3, uploaded recordings are transcribed by Deepgram Nova-3 from a short-lived private Supabase signed download URL.

## Speaker Diarisation

Speaker diarisation answers "who spoke when?" It splits the transcript into speaker-labelled parts such as raw speaker 0 and raw speaker 1. ScribeFlow displays those as `Speaker 1`, `Speaker 2` and so on.

## Transcription vs Diarisation

Transcription produces the words. Diarisation assigns those words or segments to speakers. A meeting system needs both to show a useful conversation transcript.

## Speaker Number vs Identity

Deepgram speaker indexes are not human identities. `Speaker 1` means the first diarised voice cluster, not a verified person. Users can rename speakers later, but ScribeFlow does not infer that a voice belongs to `YOU`, `PARTNER` or any real attendee.

## Utterances and Word Timestamps

Deepgram utterances are speaker-labelled spans of speech. Word timestamps record each word's start and end time. ScribeFlow stores both segment timing and word metadata so transcript rows, search snippets and speaking-time analytics can point back to source audio.

## Keyterms

Keyterms are short hints sent to Deepgram, such as project names or technical vocabulary. They can improve recognition of unusual words, but they do not identify speakers and they are not a substitute for the reference transcript.

## Structured Output

Structured output means asking an AI model to return data in a fixed shape, such as JSON with `executiveOverview`, `keyDecisions` and `actionItems`. This is easier to validate than free-form text.

## Embeddings

Embeddings are arrays of numbers that represent the meaning of text. Similar text should have similar vectors.

## Vector Similarity Search

Vector similarity search compares embeddings to find text chunks that are semantically close to a query, even when exact words differ.

## RAG

RAG means retrieval-augmented generation. The system first retrieves relevant source chunks, then uses those chunks to answer or summarize with better grounding.

## Transcript Chunking

Full transcripts can be too long to embed or send to a model at once. Chunking splits them into smaller source-grounded pieces with timestamps.

## Hallucination

Hallucination is when an AI model produces information that sounds plausible but is not supported by the source. ScribeFlow reduces this risk by validating structured output and preserving evidence timestamps.

## Source Timestamps

Timestamps improve trust because users can jump back to the exact meeting moment that supports a summary or action item.

## Server-Side API Keys

Provider keys stay on the server because browser code is visible to users. If Deepgram, Gemini or Supabase service-role keys were sent to the frontend, anyone could extract and misuse them.

## Deterministic Speaking-Time Analytics

Speaking time should be calculated from transcript segment durations. An LLM should not estimate it because exact timestamps already exist.

## Relational Tables

Relational tables store structured facts with clear relationships. ScribeFlow uses tables for meetings, speakers, transcript segments, summaries, action items, topics and future RAG chunks because each record has predictable fields and relationships.

## Primary Keys and Foreign Keys

A primary key uniquely identifies one row, such as one meeting. A foreign key links one table to another, such as an action item belonging to a meeting. These relationships help the database protect consistency.

## Cascade Deletes

Cascade delete means child records are removed when the parent is removed. If a meeting is deleted, its speakers, transcript segments, action items, topics and chunks should not remain orphaned.

## Row Level Security

Row Level Security is a database protection layer that controls which rows a role can access. ScribeFlow enables RLS now as defense in depth, but creates no browser policies because the Phase 2 application is backend-only for database access.

## Private Storage Bucket

The audio bucket is private so uploaded recordings are not publicly readable. Future playback or download should use short-lived signed URLs created by the backend.

## Signed Private Audio Access

For transcription, the API creates a short-lived signed download URL for the private audio object and sends it directly to Deepgram. The browser never sees that URL, and the database never stores it.

## Public Keys vs Server Secret Keys

Public browser keys are designed for limited frontend use. Server secret or service-role keys can bypass RLS and must stay on the backend. ScribeFlow prefers `SUPABASE_SECRET_KEY` and supports `SUPABASE_SERVICE_ROLE_KEY` only as a legacy fallback.

## Signed Upload Token

A signed upload token is a short-lived permission to upload one object to storage. The browser can use it for the selected upload path, but it does not receive the backend secret key.

## Resumable TUS Upload

TUS is a resumable upload protocol. It lets the browser send large audio files in chunks, report real byte progress and resume safely after interruptions.

## Why Audio Bypasses Express

Large audio files do not need to be buffered by the Node API. The API creates the meeting record and signed upload token, then the browser uploads directly to Supabase Storage. This reduces server memory pressure while keeping authorization controlled by the backend.

## Vector Columns Before Embeddings

The `meeting_chunks.embedding` column exists before embeddings are generated so the schema is ready for the RAG phase. In Phase 3 the values remain null, which is honest and avoids fake search behavior.

## Persistence vs AI Processing

Database persistence means safely storing records and files. AI processing means using Deepgram or Gemini to create transcripts, summaries, action items and embeddings. Phase 2 implemented persistence and private uploads; Phase 3 adds Deepgram uploaded-audio transcription while Gemini summaries and embeddings remain later work.

## Snake Case vs Camel Case

Postgres column names use `snake_case`, which is conventional in SQL. API objects use `camelCase`, which is conventional in TypeScript. Mapper functions convert between the two so frontend code does not depend on raw database row shapes.

## Local Migration vs Remote Migration

A local migration runs against a developer Supabase stack, usually through Docker.
A remote migration runs against the cloud Supabase project. Both should apply the
same SQL files so the code and deployed database stay in sync.

## Migration History

Supabase records which migration timestamps were applied. This history prevents
the same migration from being applied twice and helps teams understand which
schema version a project is running.

## `supabase link`

`supabase link` connects the local `supabase/` folder to one cloud project. It
does not copy secrets into frontend code; it lets CLI commands know which remote
project should receive migrations.

## `db push`

`supabase db push` compares local migration files with the linked project and
applies missing migrations. A dry run should be checked first so the team can
review what would change before writing to the cloud database.

## Generated Database Types

Generated database types are better than hand-maintained types because they come
from the real database schema. If a column or table changes, regeneration makes
TypeScript catch mismatches in repositories and mappers.

## Signed Upload Verification

The cloud verifier creates a real meeting, receives a signed TUS token, uploads
bytes to private storage, asks the API to verify the object and then checks that
list/detail APIs return the persisted meeting. It prints only safe identifiers
and byte counts, not credentials or signed URLs.

Supabase has two resumable upload routes. The ordinary route,
`/storage/v1/upload/resumable`, is for a logged-in user session and uses an
`Authorization` bearer token. ScribeFlow uses the signed route,
`/storage/v1/upload/resumable/sign`, because the backend creates a temporary
path-scoped upload token and the browser sends it as `x-signature`. This keeps
the server secret on the API while still allowing direct browser-to-storage
upload progress.

## Unit Test vs Integration Test

A unit test checks one boundary with doubles or fixtures. An integration test
checks real systems working together, such as the API, Supabase database,
private Storage and the TUS upload protocol.

## Word Error Rate

Word Error Rate compares a reference transcript with the provider transcript:
substitutions plus deletions plus insertions divided by reference word count.
The reference cleanup removes only non-spoken standalone title and speaker-label
lines such as `YOU:` and `PARTNER:`. It does not rewrite spoken sentences to make
the score look better.

## Raw Provider JSON

ScribeFlow stores normalized transcript segments, speakers and safe metadata
instead of the complete raw Deepgram response. This keeps database records
provider-neutral, avoids storing unnecessary account or request details, and
makes frontend contracts stable.

## Atomic Transcript Replacement

The `replace_meeting_transcription` database function deletes old speakers and
segments, inserts the new normalized transcript and marks the meeting
`transcribed` in one transaction. That prevents a partially replaced transcript
from being shown if a database write fails halfway through.
