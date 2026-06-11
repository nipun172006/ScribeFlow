# ScribeFlow Agent Instructions

- Preserve the npm-workspaces architecture: `apps/web`, `apps/api`, `packages/shared`.
- Read `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md` and relevant code before changing boundaries.
- Use TypeScript across frontend, backend and shared packages.
- Never expose Deepgram, Gemini or Supabase service-role credentials to frontend code.
- Never commit real secrets.
- Never create silent mock fallbacks for failed AI requests.
- Keep demo fixtures clearly labelled as fixtures or tests.
- Validate incoming API payloads.
- Keep provider model names in server configuration.
- Update documentation when architecture, data flow or data model changes.
- Run and report exact results for typecheck, lint, tests and build.
- Avoid unrelated refactors.
