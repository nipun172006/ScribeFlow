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

## 3. Uploaded-Audio Transcription and Diarisation

Deliverables: Deepgram upload transcription, diarisation normalization, persisted speaker and transcript segment rows, deterministic duration/speaking-time calculations.  
Dependencies: repositories and storage service.  
Acceptance tests: fixture audio transcription test with provider mocked at boundary.  
Main risks: large file handling, provider timeouts, diarisation inconsistencies.

## 4. Transcript Normalization and Speaker Renaming

Deliverables: segment grouping from provider words, speaker records, transcript UI polish; rename persistence already exists from Phase 2.  
Dependencies: Deepgram output shape.  
Acceptance tests: deterministic speaking-time unit tests and speaker rename API tests.  
Main risks: preserving raw speaker labels while allowing user-friendly names.

## 5. Structured Meeting Analysis

Deliverables: Gemini structured summary, action item extraction, evidence spans.  
Dependencies: normalized transcript segments.  
Acceptance tests: schema validation against recorded fixtures and malformed output rejection.  
Main risks: hallucinated tasks or missing source evidence.

## 6. RAG Indexing and Search

Deliverables: chunking, embeddings, pgvector storage, archive/global search results.  
Dependencies: persisted transcript and summary data.  
Acceptance tests: retrieval relevance tests over known fixture meetings.  
Main risks: poor chunk boundaries and high-cost embedding calls.

## 7. Live Transcription

Deliverables: browser microphone capture, API WebSocket session, Deepgram streaming.  
Dependencies: transcription service boundary and storage model.  
Acceptance tests: WebSocket protocol tests and manual browser microphone test.  
Main risks: browser permissions, audio encoding and connection recovery.

## 8. Analytics

Deliverables: meeting trends, speaking-time distribution, completion rate, topic counts.  
Dependencies: repositories, transcript segments, action items and topics.  
Acceptance tests: deterministic query tests for known fixtures.  
Main risks: confusing AI-generated insights with deterministic metrics.

## 9. Testing and Evaluation

Deliverables: integration coverage, accessibility checks, provider failure tests, demo fixtures.  
Dependencies: all feature paths.  
Acceptance tests: CI run with typecheck, lint, tests and build.  
Main risks: tests passing only with local secrets or fragile external calls.

## 10. Deployment and Demo Preparation

Deliverables: deployed web/API, Supabase project, environment configuration, demo script.  
Dependencies: stable feature set.  
Acceptance tests: production smoke test and viva walkthrough.  
Main risks: missing environment variables, CORS misconfiguration and provider quota limits.
