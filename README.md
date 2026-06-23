# ScribeFlow

> A premium AI meeting-intelligence platform that turns raw meeting audio into
> speaker-labelled transcripts, structured summaries, actionable tasks, and a
> semantic search index you can actually query.

ScribeFlow ingests uploaded meeting audio and runs it through transcription,
diarisation, structured analysis, and retrieval-augmented (RAG) indexing — so
every decision, action item, and summary point links straight back to the exact
moment it was said.

<p>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178c6">
  <img alt="Node" src="https://img.shields.io/badge/Node-22.13%20LTS-3c873a">
  <img alt="React" src="https://img.shields.io/badge/React-19-149eca">
  <img alt="License" src="https://img.shields.io/badge/license-private-lightgrey">
</p>

---

## Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [Verifying Integrations](#verifying-integrations)
- [Validation Pipeline](#validation-pipeline)
- [Application Routes](#application-routes)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [Documentation](#documentation)
- [Roadmap](#roadmap)

---

## Features

| Capability                      | Description                                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Audio Uploads**               | Secure, resumable [TUS](https://tus.io/) uploads directly to Supabase private storage.                                     |
| **Transcription & Diarisation** | High-accuracy speech-to-text with speaker separation via **Deepgram Nova-3**.                                              |
| **Structured Analysis**         | **Google Gemini** extracts JSON-structured summaries, key decisions, and action items.                                     |
| **Evidence Linking**            | Every action item and summary point links back to the exact transcript segment and timestamp.                              |
| **Semantic RAG Search**         | Transcript + analysis chunking and Gemini embeddings stored in `pgvector`, auto-indexed after analysis.                    |
| **Analytics**                   | Deterministic cross-meeting endpoint: meeting frequency, speaking time, action-item completion trend and recurring topics. |
| **Export & sharing**            | Copy/export a meeting summary to Markdown and download the transcript as TXT, SRT or VTT.                                  |

## Tech Stack

**Backend (`apps/api`)** — Express, TypeScript, Zod validation, Pino logging,
Deepgram SDK, Google GenAI SDK, Supabase JS, Multer, WebSockets.

**Frontend (`apps/web`)** — React 19, Vite, TanStack Query, React Router,
Radix UI, Recharts, Tailwind CSS, `tus-js-client`.

**Shared (`packages/shared`)** — Cross-cutting TypeScript types and Zod schemas
consumed by both the API and the web app.

**Infrastructure** — Supabase (Postgres + `pgvector` + Storage), deployed as a
single Render web service. Tooling: npm workspaces, Vitest, ESLint, Prettier.

## Architecture

ScribeFlow is an npm-workspaces monorepo. In production the compiled Express API
serves both the `/api/*` routes and the built React app from a single Render
service.

```
                   ┌─────────────────────────────────────────┐
   Browser ───────▶│  apps/web  (React + Vite SPA)            │
                   └───────────────────┬─────────────────────┘
                                       │  /api/*  (same origin in prod)
                   ┌───────────────────▼─────────────────────┐
                   │  apps/api  (Express + TypeScript)        │
                   │                                          │
   Audio ─upload──▶│  Storage ─▶ Transcribe ─▶ Analyse ─▶ Index│
                   └───┬───────────┬───────────┬──────────┬───┘
                       │           │           │          │
                   ┌───▼───┐  ┌────▼────┐  ┌───▼────┐ ┌───▼─────────┐
                   │Supabase│  │Deepgram │  │ Gemini │ │  pgvector   │
                   │Storage │  │ Nova-3  │  │analysis│ │  + embeddings│
                   └────────┘  └─────────┘  │+embeds │ └─────────────┘
                                            └────────┘
```

Pipeline: **upload → transcribe & diarise → structured analysis → chunk &
embed → semantic search**. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[docs/DATA_MODEL.md](docs/DATA_MODEL.md) for the full picture.

## Project Structure

```
ScribeFlow/
├── apps/
│   ├── api/            # Express backend: routes, services, integrations
│   │   ├── src/
│   │   │   ├── routes/      # HTTP route handlers
│   │   │   ├── services/    # Transcription, analysis, chunking, embedding, search, indexing
│   │   │   └── config/      # env, logger, Supabase client
│   │   ├── scripts/    # Integration verification scripts (verify:*)
│   │   └── tests/      # Vitest unit/integration tests
│   └── web/            # React + Vite frontend (pages, components)
├── packages/
│   └── shared/         # Shared TypeScript types & Zod schemas
├── supabase/           # Migrations (incl. semantic_search RPC) & config
├── docs/               # Architecture, data model, deployment, demo docs
└── scripts/            # Repo-level dev tooling
```

## Quick Start

### Prerequisites

- **Node.js 22.13.0 LTS** (see [`.nvmrc`](.nvmrc))
- **npm 11+**
- **Docker** (for a local Supabase instance)

### Setup

```bash
# 1. Install dependencies (installs all workspaces)
npm install

# 2. Copy the environment template and fill in your keys
cp .env.example .env

# 3. Start a local Supabase instance and apply the schema
npm run supabase:start
npm run db:reset
```

### Run

```bash
# Start the API and web dev servers together
npm run dev
```

The app is served at **http://localhost:5173** and the API at
**http://localhost:8787**.

## Environment Variables

Copy [`.env.example`](.env.example) to `.env` and fill in the required values.
Key groups:

| Group        | Variables                                                                                 | Notes                                                                          |
| ------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Server**   | `PORT`, `CLIENT_ORIGIN`, `CORS_ORIGIN`, `VITE_API_BASE_URL`                               | Keep `VITE_API_BASE_URL=http://localhost:8787` for local Vite dev.             |
| **Deepgram** | `DEEPGRAM_API_KEY`, `DEEPGRAM_MODEL`, `DEEPGRAM_DIARIZE_MODEL`, …                         | Transcription & diarisation.                                                   |
| **Gemini**   | `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_EMBEDDING_MODEL`, `GEMINI_EMBEDDING_DIMENSIONS` | Analysis + embeddings.                                                         |
| **Supabase** | `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_AUDIO_BUCKET`, …                         | `SUPABASE_SECRET_KEY` is preferred; the service-role key is a legacy fallback. |

> ⚠️ **Never commit real secrets.** API keys and Supabase service keys belong in
> your local `.env` or the deployment dashboard — never in Git, and never
> prefixed with `VITE_` (which would expose them to the browser).

## Available Scripts

| Script                                | Purpose                                                       |
| ------------------------------------- | ------------------------------------------------------------- |
| `npm run dev`                         | Run API + web dev servers concurrently.                       |
| `npm run dev:web` / `npm run dev:api` | Run a single app's dev server.                                |
| `npm run build`                       | Build shared, API, and web for production.                    |
| `npm run start`                       | Start the production Express server (serves API + built web). |
| `npm run typecheck`                   | Type-check all workspaces.                                    |
| `npm run lint`                        | Lint all workspaces.                                          |
| `npm run test:run`                    | Run the full Vitest suite once.                               |
| `npm run format` / `format:check`     | Apply / verify Prettier formatting.                           |
| `npm run supabase:start` / `db:reset` | Manage the local Supabase instance.                           |

## Verifying Integrations

Validate the external integrations without launching the frontend:

```bash
npm run verify:deepgram        # Deepgram transcription & WER calculation
npm run verify:gemini:persist  # Gemini analysis + database persistence
npm run verify:rag             # Semantic search & RAG indexing
```

## Validation Pipeline

Run this suite before committing to ensure formatting, type safety, and tests
pass:

```bash
npm run format:check
npm run typecheck
npm run lint
npm run test:run
npm run build
npm audit --audit-level=high
```

_If `format:check` fails, run `npm run format` first._

## Application Routes

| Route           | Purpose                                             |
| --------------- | --------------------------------------------------- |
| `/`             | Dashboard metrics and recent meeting summaries.     |
| `/meetings/new` | Upload new audio and begin processing.              |
| `/archive`      | List all past, persisted meetings.                  |
| `/search`       | Global semantic search and transcript deep-linking. |
| `/analytics`    | Cross-meeting speaker trends and topic analytics.   |

## Deployment

ScribeFlow runs as a **single Render web service**: the compiled Express API
serves both `/api/*` and the built React app from `apps/web/dist`.

```bash
npm ci && npm run build   # Render build command
npm run start             # Render start command
```

- Set the health check path to **`/api/health`**.
- Do **not** set `VITE_API_BASE_URL` on Render — when unset, the browser calls
  same-origin API routes (e.g. `/api/meetings`).
- Set real Supabase, Deepgram, and Gemini secrets in the Render dashboard, not
  in GitHub.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full Render checklist.

## Contributing

1. Branch off `main` using `your-username/short-task-name`.
2. Work within your assigned area and make focused, useful changes — avoid
   unrelated refactors.
3. Validate locally with the [Validation Pipeline](#validation-pipeline) above.
4. Open a PR into `main` describing **what changed**, the **area**, and the
   **checks run**.

See [AGENTS.md](AGENTS.md) for the working agreement (architecture boundaries,
secret handling, validation expectations).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Data Model](docs/DATA_MODEL.md)
- [Product Spec](docs/PRODUCT_SPEC.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Demo Checklist](docs/DEMO_CHECKLIST.md)
- [Demo Script](docs/DEMO_SCRIPT.md)
- [Viva Notes](docs/VIVA_NOTES.md)

## Success Metrics

How ScribeFlow demonstrates each assignment success metric:

| Assignment metric                         | How it is measured                                                                                                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transcription WER < 10% on clear audio    | `npm run verify:deepgram` computes WER against a reference transcript (`evaluateWer.mjs`); average word confidence is surfaced on the meeting detail page as a quality proxy. |
| Diarisation separates ≥ 3 speakers        | Deepgram diarisation persists `meeting_speakers`; the detail analytics tab flags meetings where fewer than 3 speakers were separated.                                         |
| Action-item extraction captures all tasks | Gemini structured output extracts task / owner / deadline with transcript evidence; verify with `npm run verify:gemini:persist`.                                              |
| Semantic search returns relevant results  | Transcript + summary chunks are embedded into `pgvector` and **auto-indexed after analysis**; verify with `npm run verify:rag`.                                               |
| Summary has all required sections         | Attendees, key decisions, discussion points, open questions and next steps are enforced by the analysis schema and rendered on the overview tab.                              |

## Roadmap

### Recently shipped

- Automatic semantic indexing as the final pipeline stage (search now works for every analysed meeting).
- Deterministic cross-meeting analytics endpoint: frequency, speaking time, completion trend and recurring topics.
- Summary → Markdown export and transcript download (TXT / SRT / VTT).
- App-wide toast feedback, route-level code splitting, and a top-level error boundary.

### Planned

- Real-time (streaming) live transcription
- Multi-language transcription tuning
- Meeting export to PDF
- Calendar / action-item reminders
