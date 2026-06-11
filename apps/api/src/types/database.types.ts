/**
 * Migration-derived Supabase database types for Phase 2.
 *
 * Regenerate from a running local Supabase stack with:
 * npm run db:types
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type TableDefinition<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      meetings: TableDefinition<
        {
          id: string;
          title: string;
          source_type: "upload" | "live";
          status:
            | "created"
            | "uploading"
            | "transcribing"
            | "analysing"
            | "indexing"
            | "completed"
            | "failed";
          original_file_name: string | null;
          storage_bucket: string | null;
          storage_path: string | null;
          mime_type: string | null;
          expected_file_size_bytes: number | null;
          file_size_bytes: number | null;
          duration_seconds: number | null;
          language: string | null;
          recorded_at: string | null;
          processing_started_at: string | null;
          upload_completed_at: string | null;
          completed_at: string | null;
          processing_time_ms: number | null;
          known_participants: string[];
          technical_terms: string[];
          error_code: string | null;
          error_message: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          title: string;
          source_type: "upload" | "live";
          status:
            | "created"
            | "uploading"
            | "transcribing"
            | "analysing"
            | "indexing"
            | "completed"
            | "failed";
          original_file_name?: string | null;
          storage_bucket?: string | null;
          storage_path?: string | null;
          mime_type?: string | null;
          expected_file_size_bytes?: number | null;
          file_size_bytes?: number | null;
          duration_seconds?: number | null;
          language?: string | null;
          recorded_at?: string | null;
          processing_started_at?: string | null;
          upload_completed_at?: string | null;
          completed_at?: string | null;
          processing_time_ms?: number | null;
          known_participants?: string[];
          technical_terms?: string[];
          error_code?: string | null;
          error_message?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        },
        {
          title?: string;
          source_type?: "upload" | "live";
          status?:
            | "created"
            | "uploading"
            | "transcribing"
            | "analysing"
            | "indexing"
            | "completed"
            | "failed";
          original_file_name?: string | null;
          storage_bucket?: string | null;
          storage_path?: string | null;
          mime_type?: string | null;
          expected_file_size_bytes?: number | null;
          file_size_bytes?: number | null;
          duration_seconds?: number | null;
          language?: string | null;
          recorded_at?: string | null;
          processing_started_at?: string | null;
          upload_completed_at?: string | null;
          completed_at?: string | null;
          processing_time_ms?: number | null;
          known_participants?: string[];
          technical_terms?: string[];
          error_code?: string | null;
          error_message?: string | null;
          metadata?: Json;
          updated_at?: string;
        }
      >;
      meeting_speakers: TableDefinition<
        {
          id: string;
          meeting_id: string;
          raw_speaker_index: number;
          display_name: string;
          total_speaking_seconds: number;
          speaking_percentage: number;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          meeting_id: string;
          raw_speaker_index: number;
          display_name: string;
          total_speaking_seconds?: number;
          speaking_percentage?: number;
          created_at?: string;
          updated_at?: string;
        },
        {
          display_name?: string;
          total_speaking_seconds?: number;
          speaking_percentage?: number;
          updated_at?: string;
        }
      >;
      transcript_segments: TableDefinition<
        {
          id: string;
          meeting_id: string;
          speaker_id: string | null;
          raw_speaker_index: number | null;
          segment_index: number;
          start_ms: number;
          end_ms: number;
          text: string;
          confidence: number | null;
          words: Json;
          search_vector: unknown | null;
          created_at: string;
        },
        {
          id?: string;
          meeting_id: string;
          speaker_id?: string | null;
          raw_speaker_index?: number | null;
          segment_index: number;
          start_ms: number;
          end_ms: number;
          text: string;
          confidence?: number | null;
          words?: Json;
          created_at?: string;
        },
        {
          speaker_id?: string | null;
          raw_speaker_index?: number | null;
          segment_index?: number;
          start_ms?: number;
          end_ms?: number;
          text?: string;
          confidence?: number | null;
          words?: Json;
        }
      >;
      meeting_summaries: TableDefinition<
        {
          meeting_id: string;
          attendees: Json;
          executive_overview: string;
          key_decisions: Json;
          discussion_points: Json;
          open_questions: Json;
          next_steps: Json;
          model_name: string | null;
          schema_version: number;
          created_at: string;
          updated_at: string;
        },
        {
          meeting_id: string;
          attendees?: Json;
          executive_overview?: string;
          key_decisions?: Json;
          discussion_points?: Json;
          open_questions?: Json;
          next_steps?: Json;
          model_name?: string | null;
          schema_version?: number;
          created_at?: string;
          updated_at?: string;
        },
        {
          attendees?: Json;
          executive_overview?: string;
          key_decisions?: Json;
          discussion_points?: Json;
          open_questions?: Json;
          next_steps?: Json;
          model_name?: string | null;
          schema_version?: number;
          updated_at?: string;
        }
      >;
      action_items: TableDefinition<
        {
          id: string;
          meeting_id: string;
          task: string;
          owner_name: string | null;
          owner_speaker_id: string | null;
          deadline: string | null;
          deadline_text: string | null;
          status: "open" | "completed";
          confidence: number | null;
          source_segment_id: string | null;
          source_start_ms: number | null;
          source_end_ms: number | null;
          evidence_text: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          meeting_id: string;
          task: string;
          owner_name?: string | null;
          owner_speaker_id?: string | null;
          deadline?: string | null;
          deadline_text?: string | null;
          status?: "open" | "completed";
          confidence?: number | null;
          source_segment_id?: string | null;
          source_start_ms?: number | null;
          source_end_ms?: number | null;
          evidence_text?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        {
          status?: "open" | "completed";
          completed_at?: string | null;
          updated_at?: string;
        }
      >;
      meeting_topics: TableDefinition<
        {
          id: string;
          meeting_id: string;
          normalized_label: string;
          display_label: string;
          confidence: number | null;
          mention_count: number;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          meeting_id: string;
          normalized_label: string;
          display_label: string;
          confidence?: number | null;
          mention_count?: number;
          created_at?: string;
          updated_at?: string;
        },
        {
          normalized_label?: string;
          display_label?: string;
          confidence?: number | null;
          mention_count?: number;
          updated_at?: string;
        }
      >;
      meeting_chunks: TableDefinition<
        {
          id: string;
          meeting_id: string;
          chunk_index: number;
          content: string;
          start_ms: number | null;
          end_ms: number | null;
          speaker_names: string[];
          metadata: Json;
          embedding: string | null;
          embedding_model: string | null;
          search_vector: unknown | null;
          created_at: string;
        },
        {
          id?: string;
          meeting_id: string;
          chunk_index: number;
          content: string;
          start_ms?: number | null;
          end_ms?: number | null;
          speaker_names?: string[];
          metadata?: Json;
          embedding?: string | null;
          embedding_model?: string | null;
          created_at?: string;
        },
        {
          chunk_index?: number;
          content?: string;
          start_ms?: number | null;
          end_ms?: number | null;
          speaker_names?: string[];
          metadata?: Json;
          embedding?: string | null;
          embedding_model?: string | null;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
