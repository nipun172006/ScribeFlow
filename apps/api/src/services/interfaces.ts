import type {
  ActionItem,
  Meeting,
  MeetingAnalytics,
  MeetingDetail,
  MeetingListQuery,
  MeetingSpeaker,
  MeetingSummary,
  PaginatedMeetingList,
  SearchInput,
  SearchResult,
  StartLiveMeetingInput,
  TranscriptSegment,
  UpdateActionItemInput,
  UploadInstructions,
  UploadMeetingInput,
} from "@scribeflow/shared";

export type AudioSource = {
  buffer: Buffer;
  originalFileName: string;
  mimeType: string;
};

export type TranscriptionResult = {
  language: string | null;
  durationSeconds: number | null;
  speakers: MeetingSpeaker[];
  segments: TranscriptSegment[];
};

export type MeetingAnalysisResult = {
  summary: MeetingSummary;
  actionItems: ActionItem[];
  topics: string[];
};

export type CreateUploadMeetingRecord = UploadMeetingInput & {
  id: string;
  storageBucket: string;
  storagePath: string;
};

export type StoredAudioObject = {
  bucket: string;
  path: string;
  mimeType: string | null;
  sizeBytes: number;
};

export type CreateSignedUploadInput = {
  bucket: string;
  objectPath: string;
};

export type UploadObjectInfo = {
  bucket: string;
  path: string;
  sizeBytes: number;
  mimeType: string | null;
  updatedAt: string | null;
};

export interface TranscriptionService {
  transcribeUpload(audio: AudioSource): Promise<TranscriptionResult>;
  startLiveSession(meetingId: string): Promise<void>;
}

export interface MeetingAnalysisService {
  analyseMeeting(input: {
    meeting: Meeting;
    speakers: MeetingSpeaker[];
    segments: TranscriptSegment[];
  }): Promise<MeetingAnalysisResult>;
}

export interface EmbeddingService {
  embedTexts(texts: string[]): Promise<number[][]>;
}

export interface MeetingRepository {
  createUploadMeeting(input: CreateUploadMeetingRecord): Promise<Meeting>;
  createLiveMeeting(input: StartLiveMeetingInput): Promise<Meeting>;
  markUploadCompleted(input: {
    meetingId: string;
    fileSizeBytes: number;
    mimeType: string | null;
  }): Promise<Meeting>;
  markMeetingFailed(input: {
    meetingId: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<Meeting>;
  listMeetings(query: MeetingListQuery): Promise<PaginatedMeetingList>;
  getMeetingById(meetingId: string): Promise<Meeting | null>;
  getMeetingDetail(meetingId: string): Promise<MeetingDetail | null>;
  updateSpeakerName(input: {
    meetingId: string;
    speakerId: string;
    displayName: string;
  }): Promise<MeetingSpeaker>;
  updateActionItemStatus(input: {
    actionItemId: string;
    status: UpdateActionItemInput["status"];
  }): Promise<ActionItem>;
  getMeetingAnalytics(meetingId: string): Promise<MeetingAnalytics | null>;
}

export interface StorageService {
  createSignedResumableUpload(
    input: CreateSignedUploadInput,
  ): Promise<UploadInstructions>;
  getObjectInfo(input: {
    bucket: string;
    objectPath: string;
  }): Promise<UploadObjectInfo>;
  removeObject(input: { bucket: string; objectPath: string }): Promise<void>;
  createSignedDownloadUrl(input: {
    bucket: string;
    objectPath: string;
    expiresInSeconds?: number;
  }): Promise<string>;
}

export interface SearchService {
  indexMeeting(input: {
    meeting: Meeting;
    summary: MeetingSummary;
    segments: TranscriptSegment[];
  }): Promise<void>;
  search(input: SearchInput): Promise<SearchResult[]>;
}
