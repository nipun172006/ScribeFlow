import { createSupabaseClient } from "./config/supabaseClient.js";
import { SupabaseMeetingRepository } from "./repositories/supabaseMeetingRepository.js";
import { DeepgramTranscriptionService } from "./services/deepgramTranscriptionService.js";
import { GeminiMeetingAnalysisService } from "./services/geminiMeetingAnalysisService.js";
import { GeminiMeetingEmbeddingService } from "./services/meetingEmbeddingService.js";
import { MeetingIndexingService } from "./services/meetingIndexingService.js";
import { SupabaseMeetingSearchService } from "./services/meetingSearchService.js";
import type {
  MeetingAnalysisService,
  MeetingRepository,
  StorageService,
  TranscriptionService,
} from "./services/interfaces.js";
import { SupabaseStorageService } from "./services/supabaseStorageService.js";

export type ApiDependencies = {
  getMeetingRepository: () => MeetingRepository;
  getStorageService: () => StorageService;
  getTranscriptionService: () => TranscriptionService;
  getMeetingAnalysisService: () => MeetingAnalysisService;
  getMeetingIndexingService: () => MeetingIndexingService;
  getMeetingSearchService: () => SupabaseMeetingSearchService;
};

export function createApiDependencies(): ApiDependencies {
  const embeddingService = new GeminiMeetingEmbeddingService();

  return {
    getMeetingRepository: () => new SupabaseMeetingRepository(createSupabaseClient()),
    getStorageService: () => new SupabaseStorageService(createSupabaseClient()),
    getTranscriptionService: () => new DeepgramTranscriptionService(),
    getMeetingAnalysisService: () => new GeminiMeetingAnalysisService(),
    getMeetingIndexingService: () =>
      new MeetingIndexingService(createSupabaseClient(), embeddingService),
    getMeetingSearchService: () =>
      new SupabaseMeetingSearchService(createSupabaseClient(), embeddingService),
  };
}
