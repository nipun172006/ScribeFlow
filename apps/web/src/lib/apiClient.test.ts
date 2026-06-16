import { describe, expect, it } from "vitest";
import { buildApiUrl, resolveApiBaseUrl } from "./apiClient";

describe("API URL helpers", () => {
  it("builds same-origin API URLs when no base URL is configured", () => {
    expect(resolveApiBaseUrl(undefined)).toBe("");
    expect(resolveApiBaseUrl("")).toBe("");
    expect(buildApiUrl("/health", "")).toBe("/api/health");
    expect(buildApiUrl("meetings", "")).toBe("/api/meetings");
  });

  it("uses configured API origins and tolerates legacy /api suffixes", () => {
    expect(resolveApiBaseUrl("http://localhost:8787")).toBe("http://localhost:8787");
    expect(resolveApiBaseUrl("http://localhost:8787/api/")).toBe(
      "http://localhost:8787",
    );
    expect(buildApiUrl("/meetings", "https://scribeflow.example")).toBe(
      "https://scribeflow.example/api/meetings",
    );
  });
});
