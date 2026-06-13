import type {
  ActionItem,
  AnalyzeMeetingResponse,
  Meeting,
  MeetingAnalytics,
  MeetingDetail,
  MeetingListQuery,
  MeetingSpeaker,
  NormalizedTranscription,
  MeetingSummary,
  PaginatedMeetingList,
  SearchInput,
  SearchResult,
  StartLiveMeetingInput,
  StructuredMeetingAnalysis,
  TranscriptSegment,
  TranscribeMeetingResponse,
  UpdateActionItemInput,
  UploadInstructions,
  UploadMeetingInput,
} from "@scribeflow/shared";

export type TranscribeRecordingInput = {
  audioUrl: string;
  language: string | null;
  knownParticipants: string[];
  technicalTerms: string[];
};

export type ReplaceMeetingTranscriptionInput = {
  meetingId: string;
  transcription: NormalizedTranscription;
  processingStartedAt: string;
  processingTimeMs: number;
};

export type MeetingAnalysisResult = {
  analysis: StructuredMeetingAnalysis;
  provider: "gemini";
  modelName: string;
  responseId: string | null;
  processingTimeMs: number;
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
  isConfigured(): boolean;
  transcribeRecording(
    input: TranscribeRecordingInput,
  ): Promise<NormalizedTranscription>;
}

export interface MeetingAnalysisService {
  isConfigured(): boolean;
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
  markTranscriptionStarted(meetingId: string): Promise<Meeting>;
  markAnalysisStarted(meetingId: string): Promise<Meeting>;
  replaceMeetingTranscription(
    input: ReplaceMeetingTranscriptionInput,
  ): Promise<TranscribeMeetingResponse>;
  getPersistedMeetingAnalysis(
    meetingId: string,
    options?: { alreadyAnalysed?: boolean },
  ): Promise<AnalyzeMeetingResponse | null>;
  persistMeetingAnalysis(input: {
    meetingId: string;
    result: MeetingAnalysisResult;
  }): Promise<AnalyzeMeetingResponse>;
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
