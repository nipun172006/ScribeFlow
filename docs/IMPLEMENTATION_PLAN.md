# Implementation Plan

## 1. Foundation

Deliverables: monorepo, shared types, Express shell, React shell, docs, validation scripts.  
Dependencies: none.  
Acceptance tests: typecheck, lint, unit tests, build, health check, route smoke tests.  
Main risks: overclaiming unfinished AI behavior.

## 2. Supabase Persistence and Private Uploads

Status: implemented in this repository; local/cloud migration execution still depends on Supabase availability.  
Deliverables: reviewed Supabase migrations, backend-only Supabase client, repository implementation, private storage bucket, signed resumable upload initialization, upload confirmation, meeting list/detail APIs, speaker rename and action-item status persistence, frontend upload/archive/detail integration.  
Dependencies: Phase 1 shared schemas and data model.  
Acceptance tests: migration contract tests, API tests with repository/storage doubles, upload validation tests, frontend upload/archive/detail tests, typecheck, lint and build.  
Main risks: migration execution still needs a real local or cloud Supabase project; TUS upload behavior must be verified against a real bucket before demo.

### Phase 2.5 Cloud Verification Checkpoint

Deliverables: link Supabase CLI to the cloud project, push both migrations,
generate linked database types, run linked database lint, and run
`npm run verify:supabase-cloud` against a real running API.
Current status: complete. Cloud migrations and generated types are in place, the
signed TUS verifier succeeds against Supabase Cloud, public access is rejected
and signed server-authorized retrieval succeeds.
Acceptance tests: migration list shows both local timestamps applied remotely;
the verifier creates a meeting, uploads bytes through signed TUS, confirms the
object, verifies list/detail APIs, rejects public storage access and verifies a
short-lived signed download.

## 3. Uploaded-Audio Transcription and Diarisation

Status: implemented in this repository; final status depends on the real Deepgram verifier result for the supplied demo WAV.
Deliverables: Deepgram Nova-3 uploaded-audio transcription, `diarize_model=latest`, provider-neutral normalization, persisted speaker and transcript segment rows, atomic Supabase replacement RPC, deterministic speaking-time calculations, WER utility and real-data processing/detail UI.
Dependencies: repositories and storage service.  
Acceptance tests: mocked provider service tests, API transcription-state tests, WER utility tests, migration contract tests, linked Supabase migration push/lint, and `npm run verify:deepgram` against the demo recording.
Main risks: provider timeouts, audio quality, diarisation inconsistencies and WER exceeding the target on the real recording.

## 4. Gemini Structured Summary and Action Items

Status: Phase 4A Part 2 backend persistence implemented; frontend UI replacement remains future work.
Deliverables: Gemini structured summary, action item extraction, evidence spans and user-visible empty-state replacement only after validated model output exists.
Dependencies: normalized transcript segments.  
Acceptance tests: mocked Gemini service tests, schema validation, malformed output rejection, evidence-ID validation, atomic persistence contract tests, `npm run verify:gemini` and `npm run verify:gemini:persist` against retained transcribed data.
Main risks: hallucinated tasks or missing source evidence.

## 5. RAG Indexing and Search

Deliverables: chunking, embeddings, pgvector storage, archive/global search results.  
Dependencies: persisted transcript and summary data.  
Acceptance tests: retrieval relevance tests over known fixture meetings.  
Main risks: poor chunk boundaries and high-cost embedding calls.

## 6. Live Transcription

Deliverables: browser microphone capture, API WebSocket session, Deepgram streaming.  
Dependencies: transcription service boundary and storage model.  
Acceptance tests: WebSocket protocol tests and manual browser microphone test.  
Main risks: browser permissions, audio encoding and connection recovery.

## 7. Analytics

Deliverables: meeting trends, speaking-time distribution, completion rate, topic counts.  
Dependencies: repositories, transcript segments, action items and topics.  
Acceptance tests: deterministic query tests for known fixtures.  
Main risks: confusing AI-generated insights with deterministic metrics.

## 8. Testing and Evaluation

Deliverables: integration coverage, accessibility checks, provider failure tests, demo fixtures.  
Dependencies: all feature paths.  
Acceptance tests: CI run with typecheck, lint, tests and build.  
Main risks: tests passing only with local secrets or fragile external calls.

## 9. Deployment and Demo Preparation

Deliverables: deployed web/API, Supabase project, environment configuration, demo script.  
Dependencies: stable feature set.  
Acceptance tests: production smoke test and viva walkthrough.  
Main risks: missing environment variables, CORS misconfiguration and provider quota limits.
