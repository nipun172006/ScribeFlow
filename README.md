# ScribeFlow

ScribeFlow is a premium AI meeting-intelligence platform designed to transform uploaded meeting audio into speaker-labelled transcripts, structured summaries, actionable tasks, and a semantic search RAG index.

## Current Features

- **Audio Uploads:** Secure, resumable TUS uploads directly to Supabase private storage.
- **Transcription & Diarisation:** High-accuracy processing using Deepgram Nova-3.
- **Structured Analysis:** Google Gemini integration for extracting JSON-structured summaries, key decisions, and action items.
- **Evidence Linking:** Every action item and summary point links back to exact transcript segment timestamps.
- **Semantic RAG Search:** Deep transcript chunking and embedding (via Gemini) mapped to `pgvector` for similarity searching.
- **Analytics:** Cross-meeting metrics, speaking-time distribution, and dynamic topic tracking.

## Local Setup

### Prerequisites

- Node.js `22.13.0` LTS recommended.
- npm 11+
- Docker (for local Supabase instance).

### Setup Commands

```bash
# Install dependencies
npm install

# Copy environment template and fill in keys (Supabase, Deepgram, Gemini)
cp .env.example .env

# Start local Supabase (if not using cloud project)
npm run supabase:start
npm run db:reset
```

## Demo Commands

Start the local frontend and backend servers concurrently:

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

## Production Deployment

ScribeFlow is configured for a single Render Web Service. In production, the
compiled Express API serves both `/api/*` and the built React app from
`apps/web/dist`.

Use these Render commands:

```bash
npm ci && npm run build
npm run start
```

Set the health check path to `/api/health`. Do not set `VITE_API_BASE_URL` on
Render for the single-service deployment; when it is unset, the browser calls
same-origin API routes such as `/api/meetings`. For local Vite development, keep
`VITE_API_BASE_URL=http://localhost:8787` in `.env`.

Set real Supabase, Deepgram and Gemini secrets in the Render dashboard, not in
GitHub. `SUPABASE_SECRET_KEY` is preferred, and `SUPABASE_SERVICE_ROLE_KEY`
exists only as a legacy fallback.

See [Deployment](docs/DEPLOYMENT.md) for the full Render checklist.

## Verification Commands

Use these scripts to verify integrations without running the frontend:

```bash
# Verify Deepgram transcription & WER calculation
npm run verify:deepgram

# Verify Gemini analysis and database persistence
npm run verify:gemini:persist

# Verify Semantic Search and RAG indexing
npm run verify:rag
```

## Validation Pipeline

Run this suite before committing to ensure formatting, type safety, and tests pass:

```bash
npm run format:check
npm run typecheck
npm run lint
npm run test:run
npm run build
npm audit --audit-level=high
```

_(If formatting fails, run `npm run format` first)._

## Main Routes

- `/` : Dashboard metrics and recent meeting summaries.
- `/meetings/new` : Upload new audio and begin processing.
- `/archive` : List all past, persisted meetings.
- `/search` : Global semantic search and transcript deep-linking.
- `/analytics` : Cross-meeting speaker trends and topic analytics.

## Documentation

- [Demo Checklist](docs/DEMO_CHECKLIST.md)
- [Demo Script](docs/DEMO_SCRIPT.md)
- [Viva Notes](docs/VIVA_NOTES.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Data Model](docs/DATA_MODEL.md)
- [Product Spec](docs/PRODUCT_SPEC.md)
- [Deployment](docs/DEPLOYMENT.md)
