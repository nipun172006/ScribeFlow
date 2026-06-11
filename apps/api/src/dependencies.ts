import { createSupabaseClient } from "./config/supabaseClient.js";
import { SupabaseMeetingRepository } from "./repositories/supabaseMeetingRepository.js";
import type { MeetingRepository, StorageService } from "./services/interfaces.js";
import { SupabaseStorageService } from "./services/supabaseStorageService.js";

export type ApiDependencies = {
  getMeetingRepository: () => MeetingRepository;
  getStorageService: () => StorageService;
};

export function createApiDependencies(): ApiDependencies {
  return {
    getMeetingRepository: () => new SupabaseMeetingRepository(createSupabaseClient()),
    getStorageService: () => new SupabaseStorageService(createSupabaseClient()),
  };
}
