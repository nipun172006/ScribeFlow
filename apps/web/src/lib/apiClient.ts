import type {
  ActionItem,
  ApiErrorResponse,
  MeetingDetail,
  MeetingListQuery,
  MeetingSpeaker,
  PaginatedMeetingList,
  StartLiveMeetingInput,
  UpdateActionItemInput,
  UploadCompletionResponse,
  UploadFailureInput,
  UploadMeetingInput,
  UploadMeetingResponse,
} from "@scribeflow/shared";

const viteEnv = (
  import.meta as ImportMeta & { env?: Record<string, string | undefined> }
).env;
const apiBaseUrl = viteEnv?.VITE_API_BASE_URL ?? "http://localhost:8787/api";

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
    await fetch(`${apiBaseUrl}${path}`, {
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
