# Viva Notes

## Speech-to-Text

Speech-to-text converts spoken audio into written text. In ScribeFlow, Deepgram Nova-3 is planned for this job.

## Speaker Diarisation

Speaker diarisation answers "who spoke when?" It splits the transcript into speaker-labelled parts such as Speaker 0 and Speaker 1.

## Transcription vs Diarisation

Transcription produces the words. Diarisation assigns those words or segments to speakers. A meeting system needs both to show a useful conversation transcript.

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

## Public Keys vs Server Secret Keys

Public browser keys are designed for limited frontend use. Server secret or service-role keys can bypass RLS and must stay on the backend. ScribeFlow prefers `SUPABASE_SECRET_KEY` and supports `SUPABASE_SERVICE_ROLE_KEY` only as a legacy fallback.

## Signed Upload Token

A signed upload token is a short-lived permission to upload one object to storage. The browser can use it for the selected upload path, but it does not receive the backend secret key.

## Resumable TUS Upload

TUS is a resumable upload protocol. It lets the browser send large audio files in chunks, report real byte progress and resume safely after interruptions.

## Why Audio Bypasses Express

Large audio files do not need to be buffered by the Node API. The API creates the meeting record and signed upload token, then the browser uploads directly to Supabase Storage. This reduces server memory pressure while keeping authorization controlled by the backend.

## Vector Columns Before Embeddings

The `meeting_chunks.embedding` column exists before embeddings are generated so the schema is ready for the RAG phase. In Phase 2 the values remain null, which is honest and avoids fake search behavior.

## Persistence vs AI Processing

Database persistence means safely storing records and files. AI processing means using Deepgram or Gemini to create transcripts, summaries, action items and embeddings. Phase 2 implements persistence only.

## Snake Case vs Camel Case

Postgres column names use `snake_case`, which is conventional in SQL. API objects use `camelCase`, which is conventional in TypeScript. Mapper functions convert between the two so frontend code does not depend on raw database row shapes.
