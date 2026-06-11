import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schemaSql = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260611190000_create_meeting_persistence_schema.sql",
  ),
  "utf8",
).toLowerCase();

const storageSql = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260611191000_create_private_audio_bucket.sql",
  ),
  "utf8",
).toLowerCase();

describe("Supabase migration contract", () => {
  it("creates required extensions and tables", () => {
    expect(schemaSql).toContain("create extension if not exists pgcrypto");
    expect(schemaSql).toContain(
      "create extension if not exists vector with schema extensions",
    );

    for (const tableName of [
      "meetings",
      "meeting_speakers",
      "transcript_segments",
      "meeting_summaries",
      "action_items",
      "meeting_topics",
      "meeting_chunks",
    ]) {
      expect(schemaSql).toContain(`create table public.${tableName}`);
    }
  });

  it("defines relationships, cascades, indexes, vector search and RLS", () => {
    expect(schemaSql).toContain("on delete cascade");
    expect(schemaSql).toContain("on delete set null");
    expect(schemaSql).toContain("enable row level security");
    expect(schemaSql).not.toContain("create policy");
    expect(schemaSql).toContain("extensions.vector(768)");
    expect(schemaSql).toContain("using hnsw");
    expect(schemaSql).toContain("vector_cosine_ops");
    expect(schemaSql).toContain("using gin (search_vector)");
    expect(schemaSql).toContain(
      "revoke all on table public.meetings from anon, authenticated",
    );
  });

  it("creates a private storage bucket with limits and MIME restrictions", () => {
    expect(storageSql).toContain("meeting-audio");
    expect(storageSql).toContain("public = false");
    expect(storageSql).toContain("262144000");
    expect(storageSql).toContain("audio/mpeg");
    expect(storageSql).toContain("audio/wav");
    expect(storageSql).toContain("video/mp4");
    expect(storageSql).toContain("application/ogg");
    expect(storageSql).not.toContain("create policy");
  });
});
