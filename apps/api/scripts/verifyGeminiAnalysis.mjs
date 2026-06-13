import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  let content = "";

  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    let value = match[2] ?? "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getApiBaseUrl() {
  return (
    process.env.VERIFY_API_BASE_URL?.trim() ||
    process.env.VITE_API_BASE_URL?.trim() ||
    "http://localhost:8787/api"
  ).replace(/\/$/, "");
}

async function readJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

async function requestJson(apiBaseUrl, path, init = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const payload = await readJson(response);
  return { response, payload };
}

function summarizeActionItems(actionItems) {
  return actionItems.map((item) => ({
    task: item.task,
    ownerName: item.ownerName,
    deadlineText: item.deadlineText,
    confidence: item.confidence,
    evidenceSegmentIds: item.evidenceSegmentIds,
  }));
}

async function main() {
  loadDotEnv();

  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
  assert(geminiConfigured, "GEMINI_API_KEY is required for Gemini verification.");

  const apiBaseUrl = getApiBaseUrl();
  const {
    GeminiMeetingAnalysisService,
    buildGeminiAnalysisInputFromDetail,
    validateAnalysisEvidenceIds,
  } = await import("../dist/services/geminiMeetingAnalysisService.js");

  const healthResult = await requestJson(apiBaseUrl, "/health");
  assert(
    healthResult.response.ok,
    `API health check failed with HTTP ${healthResult.response.status}.`,
  );
  assert(
    healthResult.payload?.dependencies?.geminiConfigured === true,
    "Running API does not report Gemini as configured.",
  );

  const listResult = await requestJson(
    apiBaseUrl,
    "/meetings?page=1&pageSize=1&status=transcribed&sort=createdAt&order=desc",
  );
  assert(
    listResult.response.ok,
    `Could not list transcribed meetings: HTTP ${listResult.response.status}.`,
  );

  const meeting = listResult.payload?.items?.[0];
  assert(meeting, "No transcribed meeting was found for Gemini verification.");

  const detailResult = await requestJson(apiBaseUrl, `/meetings/${meeting.id}`);
  assert(
    detailResult.response.ok,
    `Could not fetch meeting detail: HTTP ${detailResult.response.status}.`,
  );

  const detail = detailResult.payload;
  assert(
    Array.isArray(detail?.transcriptSegments) && detail.transcriptSegments.length > 0,
    "The latest transcribed meeting has no transcript segments.",
  );

  const beforeStatus = detail.meeting.status;
  const analysisInput = buildGeminiAnalysisInputFromDetail(detail);
  const service = new GeminiMeetingAnalysisService();
  const result = await service.analyseTranscript(analysisInput);

  validateAnalysisEvidenceIds(
    result.analysis,
    detail.transcriptSegments.map((segment) => segment.id),
  );

  const afterDetailResult = await requestJson(apiBaseUrl, `/meetings/${meeting.id}`);
  assert(
    afterDetailResult.response.ok,
    `Could not re-fetch meeting detail after analysis: HTTP ${afterDetailResult.response.status}.`,
  );
  assert(
    afterDetailResult.payload?.meeting?.status === beforeStatus,
    "Gemini verification unexpectedly changed the meeting status.",
  );

  const safeResult = {
    ok: true,
    persisted: false,
    meetingStatusUnchanged: true,
    meeting: {
      id: detail.meeting.id,
      title: detail.meeting.title,
      status: detail.meeting.status,
      transcriptSegmentCount: detail.transcriptSegments.length,
    },
    gemini: {
      configured: true,
      model: result.modelName,
      responseId: result.responseId,
      processingTimeMs: result.processingTimeMs,
    },
    counts: {
      attendees: result.analysis.attendees.length,
      decisions: result.analysis.keyDecisions.length,
      discussionPoints: result.analysis.discussionPoints.length,
      openQuestions: result.analysis.openQuestions.length,
      nextSteps: result.analysis.nextSteps.length,
      topics: result.analysis.topics.length,
      actionItems: result.analysis.actionItems.length,
    },
    topics: result.analysis.topics,
    actionItems: summarizeActionItems(result.analysis.actionItems),
    evidenceIdsValid: true,
  };

  console.log(JSON.stringify(safeResult, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Gemini verification failed.",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
