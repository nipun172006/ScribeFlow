# ScribeFlow Deployment

ScribeFlow deploys cleanly as one Render Web Service. The Express API serves
`/api/*` and, in production, serves the built Vite React app for every non-API
route.

```text
https://<render-service>.onrender.com/              -> React app
https://<render-service>.onrender.com/archive       -> React app route
https://<render-service>.onrender.com/search        -> React app route
https://<render-service>.onrender.com/meetings/...  -> React app route
https://<render-service>.onrender.com/api/health    -> Express API
https://<render-service>.onrender.com/api/...       -> Express API
```

## Build Shape

Render runs from the repository root:

```bash
npm ci
npm run build
npm run start
```

`npm run build` builds the shared package, API, and web app. `npm run start`
starts `apps/api/dist/server.js`. When `NODE_ENV=production`, the API serves
`apps/web/dist` and returns `index.html` for SPA routes such as `/archive` and
`/meetings/:id`.

The React app uses same-origin API URLs when `VITE_API_BASE_URL` is not set. On
Render, leave `VITE_API_BASE_URL` unset unless intentionally pointing the browser
at a separate API deployment.

## Render Setup

1. Push the latest code to GitHub.
2. Ensure Supabase migrations are applied to the target project:

```bash
npx supabase db push
```

3. Create a Render Web Service from the GitHub repository, or use
   `render.yaml`.
4. Use these service settings:

```text
Build Command: npm ci && npm run build
Start Command: npm run start
Health Check Path: /api/health
```

5. Add environment variables in the Render dashboard. Put real secret values in
   Render only, never in GitHub.

Required provider and persistence variables:

```text
NODE_ENV=production
NODE_VERSION=22.13.0
SUPABASE_URL=<your Supabase project URL>
SUPABASE_SECRET_KEY=<preferred backend-only Supabase secret key>
SUPABASE_SERVICE_ROLE_KEY=<legacy fallback only, leave blank if using secret key>
SUPABASE_AUDIO_BUCKET=meeting-audio
DEEPGRAM_API_KEY=<Deepgram API key>
DEEPGRAM_MODEL=nova-3
DEEPGRAM_DIARIZE_MODEL=latest
GEMINI_API_KEY=<Gemini API key>
GEMINI_MODEL=gemini-2.5-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-2
GEMINI_EMBEDDING_DIMENSIONS=768
MAX_UPLOAD_BYTES=52428800
LOG_LEVEL=info
```

Optional origin variables:

```text
WEB_ORIGIN=<custom production origin, if calling the API from another origin>
CORS_ORIGIN=<comma-separated extra allowed origins, if needed>
```

For the single-service Render deployment, the browser calls the same origin and
does not need a frontend Supabase client or a public Supabase key.

6. Deploy the service.
7. Test these URLs:

```text
/
/api/health
/archive
/search
/analytics
/meetings/<existing meeting id>
```

Then upload a small recording and run a quick live-recording check.

## Local Production Smoke Test

After building:

```bash
npm run build
NODE_ENV=production PORT=8787 npm run start
```

Verify:

```text
http://localhost:8787/
http://localhost:8787/archive
http://localhost:8787/search
http://localhost:8787/api/health
```

`/api/health` must return JSON. SPA routes must return the React app, not a 404.

If port `8787` is busy during local verification:

```bash
lsof -ti tcp:8787 | xargs kill -9 2>/dev/null || true
```

Only stop processes you intentionally started for the smoke test.

## Notes

- Render free services can cold start after inactivity. The first request may be
  slow.
- Do not set `VITE_API_BASE_URL` on Render for the single-service deployment.
- `SUPABASE_SECRET_KEY` takes precedence over the legacy
  `SUPABASE_SERVICE_ROLE_KEY`.
- Audio remains in the private Supabase Storage bucket. Express does not proxy
  audio bytes for normal uploads.
