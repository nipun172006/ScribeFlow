# ScribeFlow

ScribeFlow is a university GenAI project for a premium AI meeting-intelligence platform. The final product is intended to transform uploaded or live meeting audio into speaker-labelled transcripts, summaries, action items, RAG search and analytics.

## Current Status

This repository is in Phase 2. It contains the Phase 1 monorepo foundation plus a Supabase persistence foundation: SQL migrations, backend-only Supabase client creation, meeting CRUD, private audio bucket setup, signed resumable upload initialization, upload confirmation, and frontend data integration.

Real Deepgram transcription, speaker diarisation provider calls, Gemini generation, embeddings, semantic search, live microphone recording and analytics calculations are not implemented yet. Uploading a recording stores meeting metadata, uploads audio directly to private Supabase Storage through TUS, verifies storage metadata, and leaves the meeting in `created` status for the next phase.

The next controlled phase is uploaded-audio transcription and diarisation.

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
  migrations/  Reviewed Phase 2 database and storage migrations
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

Planned provider variables, still unused by real AI processing:

- `DEEPGRAM_API_KEY`
- `DEEPGRAM_MODEL`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_EMBEDDING_MODEL`
- `GEMINI_EMBEDDING_DIMENSIONS`

## Supabase Setup

Local commands:

```bash
npm run supabase:start
npm run db:reset
npm run db:lint
npm run db:types
npm run supabase:stop
```

The Phase 2 migrations create application tables with RLS enabled and no browser policies, plus a private `meeting-audio` bucket. Audio objects must not use public URLs. Future download access should use short-lived signed URLs from the API.

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
```

`npm run verify:supabase-cloud` is an opt-in integration verifier for a real
Supabase project. It calls the running API, creates a meeting, performs a signed
resumable TUS upload to the private bucket, confirms the upload, checks list and
detail APIs, verifies public storage access is rejected, and verifies a
server-authorized signed download without printing signed tokens or signed URLs.
This checkpoint has been verified against Supabase Cloud with the signed TUS
endpoint.

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

## Frontend Routes

- `/` dashboard with real recent-meeting loading
- `/meetings/new` upload and live metadata creation
- `/meetings/:meetingId/processing` status-aware processing page
- `/meetings/:meetingId` meeting detail from persisted API data
- `/archive` paginated persisted meeting archive
- `/search` global search shell
- `/analytics` analytics shell

Unknown routes render a designed not-found state.

## Known Unfinished Features

- Deepgram upload transcription.
- Deepgram live transcription.
- Gemini summaries, action items and embeddings.
- Transcript normalization from provider output.
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
