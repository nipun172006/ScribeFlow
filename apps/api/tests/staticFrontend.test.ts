import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("production frontend serving", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    {
      name: "configured Storage",
      supabaseUrl: "https://project-ref.supabase.co",
      connectSrc: "connect-src 'self' https://project-ref.storage.supabase.co",
    },
    {
      name: "unconfigured Storage",
      supabaseUrl: "",
      connectSrc: "connect-src 'self'",
    },
    {
      name: "unsupported Storage host",
      supabaseUrl: "https://example.com",
      connectSrc: "connect-src 'self'",
    },
  ])(
    "serves the SPA and restricts connections for $name",
    async ({ supabaseUrl, connectSrc }) => {
      const webDistPath = await mkdtemp(path.join(tmpdir(), "scribeflow-web-dist-"));

      try {
        await writeFile(
          path.join(webDistPath, "index.html"),
          '<!doctype html><title>ScribeFlow</title><div id="root">phase11-spa</div>',
        );

        vi.resetModules();
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("LOG_LEVEL", "silent");
        vi.stubEnv("WEB_DIST_PATH", webDistPath);
        vi.stubEnv("DEEPGRAM_API_KEY", "");
        vi.stubEnv("GEMINI_API_KEY", "");
        vi.stubEnv("SUPABASE_URL", supabaseUrl);
        vi.stubEnv("SUPABASE_SECRET_KEY", "");
        vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

        const { createApp } = await import("../src/app.js");
        const app = createApp();

        const healthResponse = await request(app).get("/api/health").expect(200);
        expect(healthResponse.type).toContain("json");
        expect(healthResponse.body).toMatchObject({
          ok: true,
          service: "scribeflow-api",
        });

        const spaResponse = await request(app).get("/meetings/new").expect(200);
        expect(spaResponse.type).toContain("html");
        expect(spaResponse.text).toContain("phase11-spa");
        const csp = spaResponse.headers["content-security-policy"]?.split(";") ?? [];
        expect(csp).toContain(connectSrc);
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("script-src 'self'");

        const apiMissingResponse = await request(app)
          .get("/api/not-a-real-route")
          .expect(404);
        expect(apiMissingResponse.type).toContain("json");
        expect(apiMissingResponse.body.error.code).toBe("ROUTE_NOT_FOUND");
      } finally {
        await rm(webDistPath, { force: true, recursive: true });
      }
    },
  );
});
