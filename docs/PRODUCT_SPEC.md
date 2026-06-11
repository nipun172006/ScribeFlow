# ScribeFlow Product Specification

## Problem Statement

University teams often record project meetings but lose decisions, owners, deadlines and rationale inside long audio files. ScribeFlow is a premium meeting-intelligence workspace that turns meeting audio into structured, searchable knowledge while preserving source timestamps for trust.

Phase 2 establishes Supabase persistence, private audio storage, signed resumable upload initialization, upload confirmation and frontend data integration. It does not implement real AI processing.

## Target User

- Student project teams preparing weekly progress meetings.
- Faculty reviewers who need clear meeting evidence during viva preparation.
- Demonstration users who need to understand the system boundaries without reading every source file.

## User Journeys

1. Upload a meeting recording.
2. Watch processing stages: upload, transcription, speaker identification, analysis, action extraction and indexing.
3. Review a speaker-labelled transcript.
4. Rename speakers from raw diarisation labels to real names.
5. Read a structured summary with decisions, discussion points and next steps.
6. Review action items with owner, deadline, status and transcript evidence.
7. Search across prior meetings using natural language.
8. Review analytics for meeting volume, speaking time, action completion and recurring topics.
9. Start a live microphone meeting session in a later phase.

## Core Features

- Recording upload workflow.
- Live meeting entry point.
- Speaker-labelled transcript.
- Renameable speakers.
- Structured meeting summary.
- Action item extraction.
- RAG-backed meeting archive search.
- Cross-meeting analytics.
- Demonstration-quality dark-first UI.
- Server-only provider credentials.

## Requirement Mapping

| Assignment requirement                  | Screen                                | Backend capability                                             | Test                                                    |
| --------------------------------------- | ------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------- |
| Speaker-labelled transcript             | `/meetings/:meetingId` transcript tab | `TranscriptionService`, `transcript_segments`                  | API integration tests in Phase 3                        |
| Renameable speaker identities           | detail page speaker controls          | `PATCH /api/meetings/:meetingId/speakers/:speakerId`           | API test with repository double in Phase 2              |
| Structured summary                      | detail page overview tab              | `MeetingAnalysisService`                                       | Structured-output schema tests in Phase 5               |
| Action items with task, owner, deadline | detail page action items tab          | `PATCH /api/action-items/:actionItemId`, `action_items`        | Status API test in Phase 2; extraction tests in Phase 5 |
| Searchable meeting archive using RAG    | `/archive`, `/search`                 | `SearchService`, `EmbeddingService`, `meeting_chunks`          | Retrieval tests in Phase 6                              |
| Meeting analytics                       | `/analytics`, detail analytics tab    | deterministic analytics queries                                | Unit tests for calculations in Phase 8                  |
| Live microphone meeting mode            | `/meetings/new` live tab              | WebSocket preparation, `TranscriptionService.startLiveSession` | WebSocket tests in Phase 7                              |
| Polished UI                             | all frontend routes                   | API error shape for explicit states                            | route and integration tests                             |
| Server-only provider secrets            | no frontend secret access             | environment validation and backend-only Supabase client        | secret scans and health test                            |

## Success Metrics

- A user can start the app locally with one root command.
- All required routes render on desktop and mobile.
- The API health endpoint reports provider configuration without exposing secret values.
- Future AI work has clear service boundaries, shared data contracts and persisted source records.
- Documentation lets a student explain the architecture in a viva.

## Non-Goals

- Authentication.
- Payments.
- Notifications.
- Third-party calendar or meeting bot integrations.
- Real Deepgram or Gemini provider calls in Phase 2.
- Live microphone recording, WebSocket transcription and RAG execution in Phase 2.
- Fabricated AI summaries, transcripts or analytics.

## Demo Scenario

1. Open ScribeFlow dashboard.
2. Navigate to New Meeting.
3. Fill upload metadata and choose an audio file.
4. Submit metadata, receive signed upload instructions and upload directly to private Supabase Storage.
5. Show byte-based upload progress, upload verification and the persisted meeting in archive/detail views.
6. Explain how the next phase connects Deepgram transcription behind the API.

## Edge Cases

- Empty workspace with no meetings.
- Invalid or missing upload file.
- Unsupported file MIME type.
- Missing Supabase or AI provider configuration.
- AI provider failure after later integration.
- Ambiguous speaker labels.
- No action items detected.
- Meeting with no deadline text.
- Search with no relevant results.
- Mobile navigation and keyboard operation.

## Definition of Done

- npm workspaces are configured for web, API and shared packages.
- Shared schemas cover meetings, speakers, transcripts, summaries, action items, search and analytics.
- Express API starts without provider keys and exposes `/api/health`.
- Supabase-backed endpoints return real data or typed `503` errors when configuration is missing.
- AI search and analytics endpoints still return typed `501` errors instead of fake data.
- React routes and reusable components are implemented with upload, archive and detail data integration.
- Typecheck, lint, tests and production build execute successfully.
- Documentation explains product, architecture, data model, plan and viva concepts.
- Frontend and built output contain no provider secret names or values.
