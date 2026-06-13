# ScribeFlow Demo Checklist

## Required Environment Variables

Before starting the demo, ensure the `.env` file at the root of the project contains the following variables. **Never commit this file.**

```bash
# Supabase Configuration
SUPABASE_URL="YOUR_SUPABASE_URL"
SUPABASE_SERVICE_ROLE_KEY="YOUR_SUPABASE_SERVICE_ROLE_KEY"

# Deepgram Configuration
DEEPGRAM_API_KEY="YOUR_DEEPGRAM_API_KEY"

# Google Gemini Configuration
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
```

## Setup Commands

Run these commands to prepare the environment:

```bash
# Load environment variables into current shell
set -a
source .env
set +a

# Install dependencies (if not already done)
npm install
```

## Starting the Application

Start the backend and frontend simultaneously:

```bash
npm run dev
```

The frontend will be available at `http://localhost:5173` and the backend at `http://localhost:3000`.

## Demo Operations

### Upload Demo Audio

1. Open the New Meeting page (`http://localhost:5173/meetings/new`).
2. Enter a title and select a pre-recorded demo audio file (e.g., `demo.m4a`).
3. Click "Upload & Process".
4. The file will upload to Supabase Storage, and Deepgram/Gemini processing will begin automatically in the background.

### Running Verifiers (Optional/Background)

To manually demonstrate the individual service components without the frontend, use the following verifiers. Only run these if you have API quota available.

**Deepgram Transcription & WER Verifier**

```bash
npm run verify:deepgram
```

**Gemini Analysis & Persistence Verifier**

```bash
npm run verify:gemini:persist
```

**Semantic Search & RAG Verifier**

```bash
npm run verify:rag
```

## Best Demo Search Queries

Use these queries in the Global Search page to show off the semantic search capabilities:

1. "Who is assigned the marketing budget task?"
2. "What are the key decisions regarding the new architecture?"
3. "Are there any mentions of deployment timelines?"

## Browser Demo Route Order

1. **Dashboard** (`/`): Show overall metrics and recent meetings.
2. **New Meeting** (`/meetings/new`): Upload a new recording.
3. **Processing** (`/meetings/:id`): Show the real-time processing indicators.
4. **Meeting Detail** (`/meetings/:id`): Walk through the transcript, summary, and action items.
5. **Global Search** (`/search`): Search for semantic meaning and deep-link back to a transcript segment.
6. **Analytics** (`/analytics`): Show cross-meeting insights and speaker distributions.

## Fallback Plan

- **Internet or API Quota Failure:** Do not upload a new meeting. Rely on the **Retained Meetings** already processed and visible in the Dashboard or Archive.
- **Search Quota Failure:** Use search queries that match the pre-indexed terms already visible in the local database or show the previously verified metrics from the command line output.
- **Verifier Live Failure:** Show the documented terminal outputs from a successful previous run.

## Final Pre-Demo Validation

Run the validation pipeline to prove code quality before the presentation:

```bash
npm run format:check
npm run typecheck
npm run lint
npm run test:run
npm run build
npm audit --audit-level=high
```
