import { createSupabaseClient } from "./config/supabaseClient.js";
import { SupabaseMeetingRepository } from "./repositories/supabaseMeetingRepository.js";
import { DeepgramTranscriptionService } from "./services/deepgramTranscriptionService.js";
import type {
  MeetingRepository,
  StorageService,
  TranscriptionService,
} from "./services/interfaces.js";
import { SupabaseStorageService } from "./services/supabaseStorageService.js";

export type ApiDependencies = {
  getMeetingRepository: () => MeetingRepository;
  getStorageService: () => StorageService;
  getTranscriptionService: () => TranscriptionService;
};

export function createApiDependencies(): ApiDependencies {
  return {
    getMeetingRepository: () => new SupabaseMeetingRepository(createSupabaseClient()),
    getStorageService: () => new SupabaseStorageService(createSupabaseClient()),
    getTranscriptionService: () => new DeepgramTranscriptionService(),
  };
}
