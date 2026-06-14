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

const storageLimitSql = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260614090000_align_audio_bucket_upload_limit.sql",
  ),
  "utf8",
).toLowerCase();

const transcriptionSql = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260612120000_add_uploaded_audio_transcription.sql",
  ),
  "utf8",
).toLowerCase();

const analysisSql = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260613100000_add_gemini_analysis_persistence.sql",
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
    expect(storageLimitSql).toContain("52428800");
    expect(storageSql).toContain("audio/mpeg");
    expect(storageSql).toContain("audio/wav");
    expect(storageSql).toContain("video/mp4");
    expect(storageSql).toContain("application/ogg");
    expect(storageSql).not.toContain("create policy");
  });

  it("adds transcribed status and atomic transcription replacement RPC", () => {
    expect(transcriptionSql).toContain("'transcribed'");
    expect(transcriptionSql).toContain(
      "create or replace function public.replace_meeting_transcription",
    );
    expect(transcriptionSql).toContain("delete from public.transcript_segments");
    expect(transcriptionSql).toContain("delete from public.meeting_speakers");
    expect(transcriptionSql).toContain("insert into public.meeting_speakers");
    expect(transcriptionSql).toContain("insert into public.transcript_segments");
    expect(transcriptionSql).toContain("v_current_status <> 'transcribing'");
    expect(transcriptionSql).toContain("p_speakers contains invalid speaker records");
    expect(transcriptionSql).toContain(
      "p_segments contains invalid transcript segment records",
    );
    expect(transcriptionSql).toContain("status = 'transcribed'");
    expect(transcriptionSql).toContain("'requestid'");
    expect(transcriptionSql).toContain("'diarizemodel'");
    expect(transcriptionSql).toContain("'wordcount'");
    expect(transcriptionSql).toContain("set search_path = public, pg_temp");
    expect(transcriptionSql).toContain("revoke all on function");
    expect(transcriptionSql).not.toContain("create policy");
  });

  it("adds atomic Gemini analysis persistence with evidence IDs", () => {
    expect(analysisSql).toContain("add column if not exists evidence_segment_ids");
    expect(analysisSql).toContain("using gin (evidence_segment_ids)");
    expect(analysisSql).toContain(
      "create or replace function public.persist_meeting_analysis",
    );
    expect(analysisSql).toContain("set search_path = public, pg_temp");
    expect(analysisSql).toContain("v_current_status <> 'analysing'");
    expect(analysisSql).toContain("references unknown transcript segment ids");
    expect(analysisSql).toContain("insert into public.meeting_summaries");
    expect(analysisSql).toContain("insert into public.meeting_topics");
    expect(analysisSql).toContain("insert into public.action_items");
    expect(analysisSql).toContain("status = 'completed'");
    expect(analysisSql).toContain("'provider'");
    expect(analysisSql).toContain("'gemini'");
    expect(analysisSql).toContain("revoke all on function");
    expect(analysisSql).not.toContain("create policy");
  });
});
