# ScribeFlow Architecture

## System Overview

ScribeFlow is an npm-workspaces monorepo with three TypeScript packages:

- `apps/web`: React, Vite, Tailwind, React Router and TanStack Query.
- `apps/api`: Express API, request validation, security middleware and future provider boundaries.
- `packages/shared`: Zod schemas and TypeScript domain types shared by frontend and backend.

The backend is the only process allowed to communicate with Deepgram, Gemini and Supabase backend credentials. The frontend only talks to ScribeFlow API endpoints and receives short-lived upload instructions for private Supabase Storage.

```mermaid
flowchart LR
  Browser["React Web App"] --> API["Express API"]
  API --> Deepgram["Deepgram Nova-3"]
  API --> Gemini["Gemini Models"]
  API --> SupabaseDb["Supabase Postgres + pgvector"]
  API --> SupabaseStorage["Supabase Storage"]
  Shared["Shared Zod Schemas"] --> Browser
  Shared --> API
```

## Component Boundaries

- Web app: presentation, form state, route state and friendly API errors.
- API controllers: HTTP request validation and response shaping.
- Services: provider-facing business boundaries, including Deepgram uploaded-audio transcription.
- Repositories: database access and deterministic analytics queries.
- Storage service: signed resumable upload tokens, object metadata checks, cleanup and future signed read URLs.
- Shared package: transport-safe schemas and inferred types.

## Phase 2 Uploaded Meeting Data Flow

```text
Browser
  -> API creates meeting and signed upload token
  -> Browser uploads directly to private Supabase Storage with TUS
  -> Browser notifies API
  -> API verifies object metadata
  -> API marks meeting ready
```

Audio bytes do not pass through Express in Phase 2. Direct browser-to-Supabase TUS upload gives genuine byte progress, supports resumable transfer, avoids buffering large files in the Node process and still keeps authorization server-controlled through short-lived signed upload tokens. The browser never receives the Supabase secret key.

```mermaid
sequenceDiagram
  participant Browser
  participant API
  participant Database
  participant Storage

  Browser->>API: POST /api/meetings/upload metadata
  API->>Database: Insert meeting status uploading
  API->>Storage: Create signed upload token
  API-->>Browser: Meeting ID + signed TUS endpoint + signed token
  Browser->>Storage: TUS upload to /upload/resumable/sign with x-signature
  Browser->>API: POST /api/meetings/:id/upload/complete
  API->>Storage: Verify object size and MIME metadata
  API->>Database: status created, upload_completed_at, file_size_bytes
```

## Cloud Verification Flow

The opt-in `npm run verify:supabase-cloud` script exercises the same Phase 2
boundaries against a real running API and Supabase project:

```text
Browser/API verifier
  -> API creates meeting
  -> API creates signed upload token
  -> TUS client uploads to private Supabase Storage
  -> API verifies storage metadata
  -> API marks meeting created
  -> list/detail APIs return persisted data
```

The script is intentionally API-side because it also checks private storage with
a backend key. It keeps signed upload tokens and signed download URLs in memory
only and prints safe evidence such as HTTP status codes, meeting ID, object path
and byte counts.

Supabase has two resumable upload authorization modes:

```text
User-authenticated TUS:
  /storage/v1/upload/resumable
  Authorization: Bearer <user access token>

Signed TUS:
  /storage/v1/upload/resumable/sign
  x-signature: <signed upload token>
```

ScribeFlow uses the signed TUS endpoint in Phase 2. The browser receives only a
short-lived path-scoped token and never receives the Supabase server secret.
The cloud verifier has confirmed signed upload, private public-access rejection,
signed server-authorized retrieval, and persisted meeting list/detail reads.

## Phase 3 Uploaded-Audio Transcription Flow

```mermaid
sequenceDiagram
  participant User
  participant Web
  participant API
  participant Storage
  participant Deepgram
  participant Database

  User->>Web: Open processing page for uploaded meeting
  Web->>API: POST /api/meetings/:id/transcribe
  API->>Database: Check state, mark status transcribing
  API->>Storage: Create short-lived signed download URL
  API->>Deepgram: Transcribe URL with Nova-3 and diarize_model=latest
  API->>API: Normalize utterances, words and speaker timing
  API->>Database: replace_meeting_transcription RPC
  API->>Database: status transcribed, speakers, segments
  Web->>API: Fetch meeting detail
```

The signed download URL stays in the API process and is never returned to the browser. The endpoint is idempotent: if a meeting is already `transcribed` and has transcript rows, the API returns persisted transcript data without calling Deepgram again. A meeting in `transcribing` returns `409 TRANSCRIPTION_ALREADY_RUNNING`; a meeting still in `uploading` returns `409 UPLOAD_NOT_COMPLETE`.

Migration `20260612120000_add_uploaded_audio_transcription.sql` adds the `transcribed` status and `public.replace_meeting_transcription(...)`. The function deletes old speaker/segment rows and inserts the normalized replacement in one transaction, then marks the meeting `transcribed` and stores only safe provider metadata such as request ID, model, diarisation model, counts, confidence and processing time.

## Phase 4A Gemini Structured Analysis and Persistence

```mermaid
sequenceDiagram
  participant API
  participant Gemini
  participant Database

  API->>Database: Read persisted transcript and speakers
  API->>Gemini: Text-only transcript with strict JSON schema
  Gemini-->>API: Structured JSON
  API->>API: Validate Zod schema and evidence segment IDs
  API->>Database: Persist summary, topics and tasks atomically
```

Phase 4A adds the backend Gemini service, `POST /api/meetings/:meetingId/analyze`, and `public.persist_meeting_analysis(...)`. The endpoint is idempotent: if a persisted summary already exists, it returns the stored analysis without another Gemini call. Gemini receives text-only transcript data, never audio or credentials.

## Planned RAG Flow After Analysis

```mermaid
sequenceDiagram
  participant API
  participant Gemini
  participant Database

  API->>Gemini: Generate embeddings for transcript chunks
  API->>Database: Store vectors in pgvector
```

## Planned Live Meeting Data Flow

```mermaid
sequenceDiagram
  participant Browser
  participant API
  participant Deepgram
  participant Database

  Browser->>API: Open live WebSocket session
  API->>Deepgram: Open streaming transcription session
  Browser->>API: Stream microphone audio frames
  Deepgram-->>API: Partial and final transcript events
  API-->>Browser: Live transcript updates
  API->>Database: Persist final segments and meeting state
```

## Transcription and Diarisation Strategy

- Use Deepgram Nova-3 for uploaded-audio speech-to-text.
- Enable current Deepgram batch diarisation with `diarize_model=latest`; do not send the deprecated `diarize=true` parameter alongside it.
- Normalize provider utterances and words into `transcript_segments`.
- Preserve word timing metadata where available.
- Create `meeting_speakers` from raw diarisation labels.
- Allow users to rename display names without mutating raw speaker indexes.
- Compute speaker duration and percentage deterministically from word timestamps.
- Measure WER against the supplied reference transcript by removing only standalone non-spoken title and speaker-label lines in memory.

## Summary and Action-Extraction Strategy

- Use Gemini structured output with a strict schema for attendees, overview, decisions, discussion points, questions, next steps, topics and action items.
- Include transcript segment IDs and timestamps in prompts so extracted tasks can cite evidence.
- Reject malformed model output rather than silently falling back to mock data.
- Keep confidence scores and evidence text so users can review uncertain items.

## RAG Indexing and Retrieval Strategy

- Chunk transcripts by time window, speaker turn and semantic boundaries.
- Store chunk text, timestamps, speaker references and metadata.
- Generate Gemini embeddings with centrally configured model names.
- Store vectors in Supabase Postgres with pgvector.
- Search uses vector similarity plus metadata filters, then returns source-grounded results.

Transcript chunking is needed because full meeting transcripts can exceed model context windows and because search results must point to specific source spans.

## Analytics Computation Strategy

Speaking time, participant count, action item count, completion rate and topic counts should be deterministic calculations. Phase 3 calculates meeting-level speaking time from Deepgram word timestamps and stores totals on `meeting_speakers`. An LLM should not estimate these values because the source records already contain exact timestamps and statuses. Deterministic calculations are reproducible, debuggable and easier to explain in a viva.

## Security Boundaries

- No provider keys in frontend code.
- Only `VITE_API_BASE_URL` is exposed to the browser.
- Server secrets are loaded from environment variables.
- Health checks report only boolean configuration flags.
- Deepgram keys stay backend-only; the browser never receives Deepgram credentials.
- `SUPABASE_SECRET_KEY` is preferred; `SUPABASE_SERVICE_ROLE_KEY` is a legacy fallback.
- Supabase backend-key access stays in the API.
- RLS is enabled on all application tables with no `anon` or `authenticated` policies.
- The `meeting-audio` bucket is private and has no anonymous storage policies.
- Pino redacts authorization headers, `x-signature` values and signed upload tokens.
- Future authentication can be added at the API boundary without changing provider boundaries.

## Error Handling

- Incoming payloads are validated with Zod.
- API errors use:

```json
{
  "error": {
    "code": "FEATURE_NOT_IMPLEMENTED",
    "message": "Transcript and summary search are not indexed yet.",
    "requestId": "..."
  }
}
```

- Production provider failures must return explicit user-facing errors.
- Silent mock fallbacks are forbidden.
- Request IDs are included in all API errors.

## Future Deployment Shape

- Static web app hosted on Vercel, Netlify or Supabase hosting.
- Node API hosted on a server platform that supports file upload and WebSockets.
- Supabase Postgres, pgvector and Storage for persistence.
- Environment variables managed by deployment platform secrets.
- Background workers can be split from the API when processing grows.
