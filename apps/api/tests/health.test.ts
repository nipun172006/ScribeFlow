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

function fakeJwtWithRole(role: string) {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");

  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role })}.signature`;
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

  it("does not treat publishable Supabase keys as backend persistence configuration", async () => {
    vi.resetModules();
    vi.stubEnv("LOG_LEVEL", "silent");
    vi.stubEnv("DEEPGRAM_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("SUPABASE_URL", "https://project-ref.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_publishable_fake_public_key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { createApp } = await import("../src/app.js");

    await withTestServer(createApp(), async (baseUrl) => {
      const response = await request(baseUrl).get("/api/health").expect(200);

      expect(response.body.dependencies.supabaseConfigured).toBe(false);
    });
  });

  it("accepts current secret keys and legacy service-role JWTs as backend configuration", async () => {
    vi.resetModules();
    vi.stubEnv("LOG_LEVEL", "silent");
    vi.stubEnv("DEEPGRAM_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("SUPABASE_URL", "https://project-ref.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_fake_backend_key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const secretKeyApp = await import("../src/app.js");

    await withTestServer(secretKeyApp.createApp(), async (baseUrl) => {
      const response = await request(baseUrl).get("/api/health").expect(200);

      expect(response.body.dependencies.supabaseConfigured).toBe(true);
    });

    vi.resetModules();
    vi.stubEnv("LOG_LEVEL", "silent");
    vi.stubEnv("DEEPGRAM_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("SUPABASE_URL", "https://project-ref.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", fakeJwtWithRole("service_role"));
    const serviceRoleApp = await import("../src/app.js");

    await withTestServer(serviceRoleApp.createApp(), async (baseUrl) => {
      const response = await request(baseUrl).get("/api/health").expect(200);

      expect(response.body.dependencies.supabaseConfigured).toBe(true);
    });
  });
});
