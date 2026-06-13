# ScribeFlow

ScribeFlow is a university GenAI project for a premium AI meeting-intelligence platform. The final product is intended to transform uploaded or live meeting audio into speaker-labelled transcripts, summaries, action items, RAG search and analytics.

## Current Status

This repository is in Phase 4A Part 2. It contains the Phase 1 monorepo foundation, the Phase 2 Supabase persistence and private upload foundation, Phase 3 uploaded-audio transcription through Deepgram Nova-3 with batch diarisation, and backend Gemini structured analysis persistence.

Uploading a recording stores meeting metadata, uploads audio directly to private Supabase Storage through signed TUS, verifies storage metadata, then `POST /api/meetings/:meetingId/transcribe` creates a backend-only signed download URL, calls Deepgram with `diarize_model=latest`, normalizes speakers and transcript segments, and persists the meeting in `transcribed` status.

Gemini structured analysis can be run through `POST /api/meetings/:meetingId/analyze` for transcribed meetings. The endpoint validates evidence segment IDs, persists summary/topics/action items atomically, marks the meeting `completed`, and is idempotent when analysis already exists. Gemini embeddings, RAG search, live microphone streaming and cross-meeting analytics are still intentionally unimplemented.

## Repository Structure

```text
apps/
  api/      Express TypeScript backend and Supabase persistence boundary
  web/      React Vite TypeScript frontend
packages/
  shared/   Shared Zod schemas, TypeScript domain types and upload policy
docs/       Product, architecture, data model and viva documentation
supabase/
  config.toml
  migrations/  Reviewed persistence, storage and transcription migrations
```

## Prerequisites

- Node.js `22.13.0` LTS is the recommended local runtime; Node 24 LTS is also compatible.
- npm 11 or newer.
- Docker is required only for local Supabase development.

The validation environment may use Node `v23.5.0` and npm `11.3.0`. Node 23 is an odd-numbered, non-LTS runtime and can emit package engine warnings with this toolchain. Use `.nvmrc` or `engines.node` for the supported project range.

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

The default development command starts the web app and API together after building the shared package. Docker and Supabase are not required for normal frontend/API startup, but Supabase-backed endpoints return a typed `503` until persistence configuration is supplied.

## Environment Setup

`.env.example` contains placeholders only. Server secrets must not use the `VITE_` prefix.

Required for the basic local API:

- `PORT`
- `CLIENT_ORIGIN`

Supabase persistence:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` preferred backend-only key
- `SUPABASE_SERVICE_ROLE_KEY` legacy compatibility fallback
- `SUPABASE_AUDIO_BUCKET`
- `SUPABASE_SIGNED_UPLOAD_TTL_SECONDS`
- `SUPABASE_SIGNED_DOWNLOAD_TTL_SECONDS`
- `MAX_AUDIO_FILE_SIZE_BYTES`

`SUPABASE_SECRET_KEY` takes precedence when both supported backend keys are present. The frontend only reads `VITE_API_BASE_URL`; it never receives Supabase secret keys or a Supabase browser client.

Provider variables:

- `DEEPGRAM_API_KEY`
- `DEEPGRAM_MODEL`
- `DEEPGRAM_DIARIZE_MODEL`
- `DEEPGRAM_DEFAULT_LANGUAGE`
- `DEEPGRAM_REQUEST_TIMEOUT_MS`
- `DEEPGRAM_MAX_RETRIES`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_REQUEST_TIMEOUT_MS`
- `GEMINI_EMBEDDING_MODEL`
- `GEMINI_EMBEDDING_DIMENSIONS`

Deepgram is used only by the backend. No Deepgram key or signed Supabase download URL is sent to the browser.
Gemini is used only by the backend service and verifier scripts. No Gemini key is sent to the browser.

Demo verification variables:

- `DEMO_AUDIO_PATH`
- `DEMO_REFERENCE_PATH`
- `DEMO_EXPECTED_SPEAKERS`

The demo verifier reads these ignored `.env` values locally and never commits or prints the referenced Desktop files.

## Supabase Setup

Local commands:

```bash
npm run supabase:start
npm run db:reset
npm run db:lint
npm run db:types
npm run supabase:stop
```

The migrations create application tables with RLS enabled and no browser policies, plus a private `meeting-audio` bucket. Audio objects must not use public URLs. Phase 3 transcription uses short-lived signed download URLs inside the API process only.

If Docker is unavailable, review and apply the migrations against a Supabase cloud project before using upload persistence.

Cloud migration and verification commands:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase migration list --linked
npx supabase db push --dry-run
npx supabase db push
npx supabase migration list --linked
npx supabase db lint --linked --fail-on error
npx supabase gen types typescript --linked --schema public > apps/api/src/types/database.types.ts
npm run build --workspace @scribeflow/api
npm run start --workspace @scribeflow/api
npm run verify:supabase-cloud
npm run verify:deepgram
npm run verify:gemini
npm run verify:gemini:persist
npm run evaluate:wer -- --reference <path> --hypothesis <path>
```

`npm run verify:supabase-cloud` is an opt-in integration verifier for a real
Supabase project. It calls the running API, creates a meeting, performs a signed
resumable TUS upload to the private bucket, confirms the upload, checks list and
detail APIs, verifies public storage access is rejected, and verifies a
server-authorized signed download without printing signed tokens or signed URLs.
This checkpoint has been verified against Supabase Cloud with the signed TUS
endpoint.

`npm run verify:deepgram` is an opt-in integration verifier for a real running
API, Supabase project and Deepgram key. It reads `DEMO_AUDIO_PATH`,
`DEMO_REFERENCE_PATH` and `DEMO_EXPECTED_SPEAKERS` from `.env`, uploads the demo
audio through signed TUS, confirms the upload, runs `/api/meetings/:id/transcribe`,
checks persisted speakers and transcript segments, computes WER, and cleans up
failed verification rows. A successful run intentionally retains at most one
verification meeting so the frontend transcript, speaker rename and analytics
views can be inspected with real data. It does not print secrets, signed upload
tokens or signed download URLs.

`npm run verify:gemini` is an opt-in integration verifier for a real running
API and Gemini key. It finds the latest `transcribed` meeting, fetches its
persisted transcript, calls Gemini with text-only segments and a strict JSON
schema, validates evidence segment IDs, and prints safe counts without saving
the analysis or changing meeting status.

`npm run verify:gemini:persist` is an opt-in persistence verifier for a real
running API, Supabase project and Gemini key. It calls the analyze endpoint,
confirms summary/topics/action items are persisted, validates evidence segment
IDs against transcript rows, and calls the endpoint again to confirm idempotency.

## Development Commands

```bash
npm run dev
npm run dev:web
npm run dev:api
npm run build
npm run typecheck
npm run lint
npm run test
npm run test:run
npm run format
npm run format:check
npm audit --audit-level=high
```

## API

Implemented in Phase 2:

- `GET /api/health`
- `POST /api/meetings/upload`
- `POST /api/meetings/:meetingId/upload/complete`
- `POST /api/meetings/:meetingId/upload/fail`
- `POST /api/meetings/live`
- `GET /api/meetings`
- `GET /api/meetings/:meetingId`
- `PATCH /api/meetings/:meetingId/speakers/:speakerId`
- `PATCH /api/action-items/:actionItemId`

Implemented in Phase 3:

- `POST /api/meetings/:meetingId/transcribe`

Implemented in Phase 4A:

- Gemini structured analysis service and `npm run verify:gemini`
- `POST /api/meetings/:meetingId/analyze`
- Atomic Gemini analysis persistence and `npm run verify:gemini:persist`

Still intentionally unimplemented with typed `501` errors:

- `POST /api/search`
- `GET /api/analytics`

## Upload Architecture

```text
Browser
  -> API creates meeting and signed upload token
  -> Browser uploads directly to private Supabase Storage with signed TUS
  -> Browser notifies API
  -> API verifies object metadata
  -> API marks meeting ready
```

Audio bytes do not pass through Express. This keeps the API memory footprint smaller, allows resumable uploads, and keeps storage authorization server-controlled through short-lived signed upload tokens.

ScribeFlow uses Supabase's signed resumable endpoint,
`/storage/v1/upload/resumable/sign`, because the browser receives a temporary
path-scoped upload token in the `x-signature` header. The ordinary authenticated
TUS endpoint, `/storage/v1/upload/resumable`, is for user-session uploads with an
`Authorization: Bearer <user access token>` header and is not used in this
single-workspace backend-authorized phase.

## Transcription Architecture

```text
Processing page
  -> API checks meeting state and Deepgram configuration
  -> API creates a short-lived signed download URL for private audio
  -> API calls Deepgram Nova-3 with diarize_model=latest
  -> API normalizes utterances, words, speakers and timing
  -> API atomically replaces speakers/transcript segments
  -> API marks meeting transcribed
```

Deepgram failures return explicit API errors and can mark the meeting failed with a safe message. The app never silently replaces failed transcription with fixtures.

## Gemini Analysis Persistence

```text
POST /api/meetings/:id/analyze
  -> API reads persisted speakers and transcript segments
  -> Gemini receives only text segments, speaker names and meeting metadata
  -> Backend validates schema and evidence segment IDs
  -> Supabase RPC persists summary, topics and action items atomically
  -> API returns the persisted analysis
```

The endpoint does not send audio to Gemini and does not expose Gemini credentials. If a meeting already has a persisted summary, the endpoint returns the existing analysis without calling Gemini again.

## Frontend Routes

- `/` dashboard with real recent-meeting loading
- `/meetings/new` upload and live metadata creation
- `/meetings/:meetingId/processing` status-aware processing page
- `/meetings/:meetingId` meeting detail with persisted transcript, speaker rename controls and meeting-level speaker timing
- `/archive` paginated persisted meeting archive
- `/search` global search shell
- `/analytics` analytics shell

Unknown routes render a designed not-found state.

## Known Unfinished Features

- Deepgram live transcription.
- Frontend UI for persisted Gemini summaries and action items.
- Gemini embeddings.
- Semantic/hybrid RAG retrieval.
- Cross-meeting analytics calculations.
- Authentication.
- Deployment configuration.

## Documentation

- [Product spec](docs/PRODUCT_SPEC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Data model](docs/DATA_MODEL.md)
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [Viva notes](docs/VIVA_NOTES.md)
