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

describe("future feature routes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 503 when search is called without backend services configured", async () => {
    await withTestServer(await createIsolatedApp(), async (baseUrl) => {
      const response = await request(baseUrl)
        .post("/api/search")
        .send({ query: "decisions from yesterday" })
        .expect(503);

      expect(response.body).toMatchObject({
        error: {
          code: "SUPABASE_NOT_CONFIGURED",
        },
      });
      expect(typeof response.body.error.requestId).toBe("string");
    });
  });

  it("validates incoming payloads before route handling", async () => {
    await withTestServer(await createIsolatedApp(), async (baseUrl) => {
      const response = await request(baseUrl)
        .patch("/api/action-items/33333333-3333-4333-8333-333333333333")
        .send({ status: "blocked" })
        .expect(400);

      expect(response.body.error.code).toBe("BAD_REQUEST");
    });
  });
});
