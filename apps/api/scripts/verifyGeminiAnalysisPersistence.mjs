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

async function findAnalysisCandidate(apiBaseUrl) {
  for (const status of ["transcribed", "completed"]) {
    const result = await requestJson(
      apiBaseUrl,
      `/meetings?page=1&pageSize=1&status=${status}&sort=createdAt&order=desc`,
    );
    assert(
      result.response.ok,
      `Could not list ${status} meetings: HTTP ${result.response.status}.`,
    );

    const meeting = result.payload?.items?.[0];
    if (meeting) {
      return meeting;
    }
  }

  throw new Error("No transcribed or completed meeting was found.");
}

function collectEvidenceIds(analysis) {
  return [
    ...analysis.keyDecisions.flatMap((item) => item.evidenceSegmentIds),
    ...analysis.discussionPoints.flatMap((item) => item.evidenceSegmentIds),
    ...analysis.openQuestions.flatMap((item) => item.evidenceSegmentIds),
    ...analysis.nextSteps.flatMap((item) => item.evidenceSegmentIds),
    ...analysis.actionItems.flatMap((item) => item.evidenceSegmentIds),
  ];
}

function summarizeActionItems(actionItems) {
  return actionItems.map((item) => ({
    task: item.task,
    ownerName: item.ownerName,
    deadlineText: item.deadlineText,
    evidenceSegmentIds: item.evidenceSegmentIds,
  }));
}

async function main() {
  loadDotEnv();

  assert(
    Boolean(process.env.GEMINI_API_KEY?.trim()),
    "GEMINI_API_KEY is required for Gemini persistence verification.",
  );

  const apiBaseUrl = getApiBaseUrl();
  const healthResult = await requestJson(apiBaseUrl, "/health");
  assert(
    healthResult.response.ok,
    `API health check failed with HTTP ${healthResult.response.status}.`,
  );
  assert(
    healthResult.payload?.dependencies?.geminiConfigured === true,
    "Running API does not report Gemini as configured.",
  );
  assert(
    healthResult.payload?.dependencies?.supabaseConfigured === true,
    "Running API does not report Supabase as configured.",
  );

  const candidate = await findAnalysisCandidate(apiBaseUrl);
  const statusBefore = candidate.status;

  const firstResult = await requestJson(
    apiBaseUrl,
    `/meetings/${candidate.id}/analyze`,
    { method: "POST" },
  );
  assert(
    firstResult.response.ok,
    `Analyze endpoint failed with HTTP ${firstResult.response.status}: ${JSON.stringify(firstResult.payload)}`,
  );
  assert(
    firstResult.payload?.meeting?.status === "completed",
    "Analyze endpoint did not return a completed meeting.",
  );

  const detailResult = await requestJson(apiBaseUrl, `/meetings/${candidate.id}`);
  assert(
    detailResult.response.ok,
    `Could not fetch meeting detail after analysis: HTTP ${detailResult.response.status}.`,
  );
  assert(detailResult.payload?.summary, "Persisted summary was not returned.");
  assert(
    Array.isArray(detailResult.payload?.topics) &&
      detailResult.payload.topics.length > 0,
    "Persisted topics were not returned.",
  );
  assert(
    Array.isArray(detailResult.payload?.actionItems) &&
      detailResult.payload.actionItems.length > 0,
    "Persisted action items were not returned.",
  );

  const segmentIds = new Set(
    detailResult.payload.transcriptSegments.map((segment) => segment.id),
  );
  const evidenceIds = collectEvidenceIds(firstResult.payload.analysis);
  const unknownEvidenceIds = evidenceIds.filter(
    (segmentId) => !segmentIds.has(segmentId),
  );
  assert(
    unknownEvidenceIds.length === 0,
    `Persisted analysis referenced unknown evidence IDs: ${unknownEvidenceIds.join(", ")}`,
  );

  const secondResult = await requestJson(
    apiBaseUrl,
    `/meetings/${candidate.id}/analyze`,
    { method: "POST" },
  );
  assert(
    secondResult.response.ok,
    `Second analyze endpoint call failed with HTTP ${secondResult.response.status}.`,
  );
  assert(
    secondResult.payload?.alreadyAnalysed === true,
    "Second analyze call was not reported as idempotent.",
  );
  assert(
    secondResult.payload?.responseId === firstResult.payload.responseId,
    "Second analyze call did not return the persisted analysis metadata.",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        meeting: {
          id: firstResult.payload.meeting.id,
          title: firstResult.payload.meeting.title,
          statusBefore,
          statusAfter: firstResult.payload.meeting.status,
        },
        gemini: {
          model: firstResult.payload.modelName,
          responseId: firstResult.payload.responseId,
          processingTimeMs: firstResult.payload.processingTimeMs,
        },
        summary: {
          attendees: firstResult.payload.analysis.attendees.length,
          decisions: firstResult.payload.analysis.keyDecisions.length,
          discussionPoints: firstResult.payload.analysis.discussionPoints.length,
          openQuestions: firstResult.payload.analysis.openQuestions.length,
          nextSteps: firstResult.payload.analysis.nextSteps.length,
        },
        topicCount: detailResult.payload.topics.length,
        actionItemCount: detailResult.payload.actionItems.length,
        actionItems: summarizeActionItems(firstResult.payload.analysis.actionItems),
        evidenceIdsValid: true,
        idempotent: true,
        meetingDetailIncludesPersistedAnalysis: true,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Gemini persistence verification failed.",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
