import type {
  ActionItem,
  AnalyzeMeetingResponse,
  ApiErrorResponse,
  CrossMeetingAnalytics,
  MeetingAnalytics,
  MeetingDetail,
  MeetingListQuery,
  MeetingSpeaker,
  PaginatedMeetingList,
  StartLiveMeetingInput,
  TranscribeMeetingResponse,
  UpdateActionItemInput,
  UploadCompletionResponse,
  UploadFailureInput,
  UploadMeetingInput,
  UploadMeetingResponse,
} from "@scribeflow/shared";

const viteEnv = (
  import.meta as ImportMeta & { env?: Record<string, string | undefined> }
).env;
export const resolveApiBaseUrl = (configuredBaseUrl?: string) => {
  const trimmedBaseUrl = configuredBaseUrl?.trim().replace(/\/+$/, "") ?? "";

  if (!trimmedBaseUrl) {
    return "";
  }

  return trimmedBaseUrl.endsWith("/api")
    ? trimmedBaseUrl.slice(0, -"/api".length)
    : trimmedBaseUrl;
};

const apiBaseUrl = resolveApiBaseUrl(viteEnv?.VITE_API_BASE_URL);

export const buildApiUrl = (path: string, baseUrl = apiBaseUrl) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}/api${normalizedPath}`;
};

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;

  constructor(params: {
    status: number;
    code: string;
    message: string;
    requestId: string | null;
  }) {
    super(params.message);
    this.name = "ApiClientError";
    this.status = params.status;
    this.code = params.code;
    this.requestId = params.requestId;
  }
}

function isApiErrorResponse(payload: unknown): payload is ApiErrorResponse {
  return typeof payload === "object" && payload !== null && "error" in payload;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | ApiErrorResponse
    | T
    | null;

  if (!response.ok) {
    const apiError = isApiErrorResponse(payload) ? payload.error : null;
    throw new ApiClientError({
      status: response.status,
      code: apiError?.code ?? "INTERNAL_SERVER_ERROR",
      message:
        apiError?.message ??
        "The request failed. Please try again or check the API server.",
      requestId: apiError?.requestId ?? null,
    });
  }

  return payload as T;
}

async function jsonRequest<T>(path: string, init?: RequestInit) {
  return parseResponse<T>(
    await fetch(buildApiUrl(path), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    }),
  );
}

export function initializeUploadMeeting(input: UploadMeetingInput) {
  return jsonRequest<UploadMeetingResponse>("/meetings/upload", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function completeMeetingUpload(meetingId: string) {
  return jsonRequest<UploadCompletionResponse>(
    `/meetings/${meetingId}/upload/complete`,
    {
      method: "POST",
    },
  );
}

export function failMeetingUpload(meetingId: string, input: UploadFailureInput) {
  return jsonRequest<UploadCompletionResponse>(`/meetings/${meetingId}/upload/fail`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createLiveMeeting(input: StartLiveMeetingInput) {
  return jsonRequest<UploadCompletionResponse>("/meetings/live", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listMeetings(query: Partial<MeetingListQuery> = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      params.set(key, String(value));
    }
  });

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return jsonRequest<PaginatedMeetingList>(`/meetings${suffix}`);
}

export function getMeetingDetail(meetingId: string) {
  return jsonRequest<MeetingDetail>(`/meetings/${meetingId}`);
}

export function getMeetingAnalytics(meetingId: string) {
  return jsonRequest<MeetingAnalytics>(`/meetings/${meetingId}/analytics`);
}

export function getCrossMeetingAnalytics() {
  return jsonRequest<CrossMeetingAnalytics>("/analytics");
}

export function transcribeMeeting(meetingId: string) {
  return jsonRequest<TranscribeMeetingResponse>(`/meetings/${meetingId}/transcribe`, {
    method: "POST",
  });
}

export function analyzeMeeting(meetingId: string) {
  return jsonRequest<AnalyzeMeetingResponse>(`/meetings/${meetingId}/analyze`, {
    method: "POST",
  });
}

export function renameSpeaker(params: {
  meetingId: string;
  speakerId: string;
  displayName: string;
}) {
  return jsonRequest<{ speaker: MeetingSpeaker }>(
    `/meetings/${params.meetingId}/speakers/${params.speakerId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ displayName: params.displayName }),
    },
  );
}

export function updateActionItemStatus(
  actionItemId: string,
  input: UpdateActionItemInput,
) {
  return jsonRequest<{ actionItem: ActionItem }>(`/action-items/${actionItemId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export type SearchResultItem = {
  meetingId: string;
  meetingTitle: string;
  chunkText: string;
  chunkKind: string;
  similarityScore: number;
  startMs: number | null;
  endMs: number | null;
  speakerNames: string[];
  sourceSegmentIds: string[];
};

export type SearchResponse = {
  results: SearchResultItem[];
};

export function searchMeetings(query: string, limit: number = 10) {
  return jsonRequest<SearchResponse>("/search", {
    method: "POST",
    body: JSON.stringify({ query, limit }),
  });
}
