import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withTestServer } from "./testServer.js";

async function createIsolatedApp() {
  vi.resetModules();
  vi.stubEnv("LOG_LEVEL", "silent");
  vi.stubEnv("DEEPGRAM_API_KEY", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  const { createApp } = await import("../src/app.js");
  return createApp();
}

describe("GET /api/health", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns service status without exposing provider secrets", async () => {
    await withTestServer(await createIsolatedApp(), async (baseUrl) => {
      const response = await request(baseUrl).get("/api/health").expect(200);

      expect(response.body).toMatchObject({
        ok: true,
        service: "scribeflow-api",
        dependencies: {
          deepgramConfigured: false,
          geminiConfigured: false,
          supabaseConfigured: false,
        },
      });
      expect(typeof response.body.timestamp).toBe("string");
      expect(response.text).not.toContain("API_KEY");
      expect(response.text).not.toContain("SERVICE_ROLE");
    });
  });
});
