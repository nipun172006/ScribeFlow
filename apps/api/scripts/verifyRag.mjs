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

async function main() {
  loadDotEnv();

  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
  assert(geminiConfigured, "GEMINI_API_KEY is required for RAG verification.");

  const apiBaseUrl = getApiBaseUrl();

  // Check API health
  const healthResult = await requestJson(apiBaseUrl, "/health");
  assert(
    healthResult.response.ok,
    `API health check failed with HTTP ${healthResult.response.status}.`,
  );

  // Find a completed meeting
  const listResult = await requestJson(
    apiBaseUrl,
    "/meetings?page=1&pageSize=5&status=completed&sort=createdAt&order=desc",
  );
  assert(
    listResult.response.ok,
    `Could not list meetings: HTTP ${listResult.response.status}.`,
  );

  const meeting = listResult.payload?.items?.[0];
  assert(meeting, "No completed meeting was found for RAG verification.");
  assert(
    meeting.status === "completed",
    `Meeting status is ${meeting.status}, expected completed.`,
  );

  console.log(`📋 Testing with meeting: ${meeting.title} (${meeting.id})`);

  // Call the indexing endpoint
  const indexResult = await requestJson(apiBaseUrl, `/meetings/${meeting.id}/index`, {
    method: "POST",
  });

  assert(
    indexResult.response.ok,
    `Indexing failed with HTTP ${indexResult.response.status}: ${JSON.stringify(indexResult.payload)}`,
  );

  const indexingMetadata = indexResult.payload;
  assert(indexingMetadata?.chunkCount > 0, "Indexing returned no chunks.");

  console.log(
    `✅ Indexed ${indexingMetadata.chunkCount} chunks with model ${indexingMetadata.embeddingModel}`,
  );

  // Test queries
  const testQueries = [
    "presentation demo",
    "action items",
    "architecture diagram",
    "transcript speakers",
    "processing time",
  ];

  const queryResults = [];

  for (const query of testQueries) {
    const searchResult = await requestJson(apiBaseUrl, "/search", {
      method: "POST",
      body: JSON.stringify({ query, limit: 5 }),
    });

    assert(
      searchResult.response.ok,
      `Search for "${query}" failed with HTTP ${searchResult.response.status}`,
    );

    const results = searchResult.payload?.results;
    assert(
      Array.isArray(results),
      `Search did not return results array for "${query}".`,
    );

    const resultWithOurMeeting = results.find((r) => r.meetingId === meeting.id);

    queryResults.push({
      query,
      resultCount: results.length,
      foundInMeeting: Boolean(resultWithOurMeeting),
      topResult:
        results.length > 0
          ? {
              chunkKind: results[0].chunkKind,
              similarity: results[0].similarityScore,
              textPreview: results[0].chunkText.substring(0, 50),
            }
          : null,
    });
  }

  console.log(`✅ Executed ${testQueries.length} search queries`);

  // Test idempotency
  const indexResult2 = await requestJson(apiBaseUrl, `/meetings/${meeting.id}/index`, {
    method: "POST",
  });

  assert(
    indexResult2.response.ok,
    `Second indexing failed with HTTP ${indexResult2.response.status}`,
  );

  const indexingMetadata2 = indexResult2.payload;
  assert(
    indexingMetadata2?.idempotent === true,
    "Second indexing should be idempotent",
  );
  assert(
    indexingMetadata2?.chunkCount === indexingMetadata?.chunkCount,
    "Chunk count changed on second indexing",
  );

  console.log("✅ Idempotency test passed");

  const safeResult = {
    ok: true,
    meeting: {
      id: meeting.id,
      title: meeting.title,
      status: meeting.status,
    },
    indexing: {
      chunkCount: indexingMetadata.chunkCount,
      embeddingModel: indexingMetadata.embeddingModel,
      embeddingDimensions: indexingMetadata.embeddingDimensions,
      idempotent: indexingMetadata2.idempotent,
    },
    queries: queryResults,
    metadata: {
      testQueriesCount: testQueries.length,
      allQueriesSucceeded: queryResults.every((q) => q.resultCount > 0),
    },
  };

  console.log("\n" + JSON.stringify(safeResult, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : "RAG verification failed.",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
