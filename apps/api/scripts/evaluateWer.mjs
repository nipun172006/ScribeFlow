import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const titleLine = "TWO-PERSON COLLEGE EVENT PLANNING MEETING";
const speakerLabels = new Set(["YOU:", "PARTNER:"]);

export function cleanupReferenceText(text) {
  const lines = text.split(/\r?\n/);
  const cleanup = {
    originalLineCount: lines.length,
    removedBlankLines: 0,
    removedTitleLines: 0,
    removedStandaloneSpeakerLabels: 0,
    keptLineCount: 0,
  };
  const keptLines = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      cleanup.removedBlankLines += 1;
      continue;
    }

    if (trimmed.toLocaleUpperCase() === titleLine) {
      cleanup.removedTitleLines += 1;
      continue;
    }

    if (speakerLabels.has(trimmed.toLocaleUpperCase())) {
      cleanup.removedStandaloneSpeakerLabels += 1;
      continue;
    }

    keptLines.push(trimmed);
    cleanup.keptLineCount += 1;
  }

  return {
    text: keptLines.join(" "),
    cleanup,
  };
}

export function tokenizeForWer(text) {
  return text
    .toLocaleLowerCase()
    .normalize("NFKC")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function calculateWer(referenceText, hypothesisText) {
  const referenceWords = tokenizeForWer(referenceText);
  const hypothesisWords = tokenizeForWer(hypothesisText);

  if (referenceWords.length === 0) {
    throw new Error("Reference transcript has no usable words for WER evaluation.");
  }

  const distances = Array.from({ length: referenceWords.length + 1 }, () =>
    Array(hypothesisWords.length + 1).fill(0),
  );

  for (let index = 0; index <= referenceWords.length; index += 1) {
    distances[index][0] = index;
  }

  for (let index = 0; index <= hypothesisWords.length; index += 1) {
    distances[0][index] = index;
  }

  for (
    let referenceIndex = 1;
    referenceIndex <= referenceWords.length;
    referenceIndex += 1
  ) {
    for (
      let hypothesisIndex = 1;
      hypothesisIndex <= hypothesisWords.length;
      hypothesisIndex += 1
    ) {
      const substitutionCost =
        referenceWords[referenceIndex - 1] === hypothesisWords[hypothesisIndex - 1]
          ? 0
          : 1;
      distances[referenceIndex][hypothesisIndex] = Math.min(
        distances[referenceIndex - 1][hypothesisIndex] + 1,
        distances[referenceIndex][hypothesisIndex - 1] + 1,
        distances[referenceIndex - 1][hypothesisIndex - 1] + substitutionCost,
      );
    }
  }

  const edits = distances[referenceWords.length][hypothesisWords.length];
  let referenceIndex = referenceWords.length;
  let hypothesisIndex = hypothesisWords.length;
  let substitutions = 0;
  let deletions = 0;
  let insertions = 0;

  while (referenceIndex > 0 || hypothesisIndex > 0) {
    if (
      referenceIndex > 0 &&
      hypothesisIndex > 0 &&
      referenceWords[referenceIndex - 1] === hypothesisWords[hypothesisIndex - 1] &&
      distances[referenceIndex][hypothesisIndex] ===
        distances[referenceIndex - 1][hypothesisIndex - 1]
    ) {
      referenceIndex -= 1;
      hypothesisIndex -= 1;
      continue;
    }

    if (
      referenceIndex > 0 &&
      hypothesisIndex > 0 &&
      distances[referenceIndex][hypothesisIndex] ===
        distances[referenceIndex - 1][hypothesisIndex - 1] + 1
    ) {
      substitutions += 1;
      referenceIndex -= 1;
      hypothesisIndex -= 1;
      continue;
    }

    if (
      referenceIndex > 0 &&
      distances[referenceIndex][hypothesisIndex] ===
        distances[referenceIndex - 1][hypothesisIndex] + 1
    ) {
      deletions += 1;
      referenceIndex -= 1;
      continue;
    }

    insertions += 1;
    hypothesisIndex -= 1;
  }

  const wordErrorRate = edits / referenceWords.length;

  return {
    edits,
    substitutions,
    deletions,
    insertions,
    referenceWordCount: referenceWords.length,
    hypothesisWordCount: hypothesisWords.length,
    wordErrorRate,
    wordAccuracy: Math.max(0, 1 - wordErrorRate),
  };
}

function readArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

async function main() {
  const referencePath = readArg("reference");
  const hypothesisPath = readArg("hypothesis");

  if (!referencePath || !hypothesisPath) {
    throw new Error(
      "Usage: npm run evaluate:wer -- --reference <path> --hypothesis <path>",
    );
  }

  const referenceRaw = await readFile(resolve(referencePath), "utf8");
  const hypothesisRaw = await readFile(resolve(hypothesisPath), "utf8");
  const reference = cleanupReferenceText(referenceRaw);
  const result = calculateWer(reference.text, hypothesisRaw);
  const referenceSpokenWordCount = tokenizeForWer(reference.text).length;

  console.log(
    JSON.stringify(
      {
        ok: true,
        referencePath: resolve(referencePath),
        hypothesisPath: resolve(hypothesisPath),
        cleanup: {
          ...reference.cleanup,
          removedFormattingLineCount:
            reference.cleanup.removedTitleLines +
            reference.cleanup.removedStandaloneSpeakerLabels,
          finalSpokenWordCount: referenceSpokenWordCount,
        },
        metrics: {
          edits: result.edits,
          substitutions: result.substitutions,
          deletions: result.deletions,
          insertions: result.insertions,
          referenceWordCount: result.referenceWordCount,
          hypothesisWordCount: result.hypothesisWordCount,
          wordErrorRate: Number(result.wordErrorRate.toFixed(4)),
          wordErrorRatePercent: Number((result.wordErrorRate * 100).toFixed(2)),
          wordAccuracyPercent: Number((result.wordAccuracy * 100).toFixed(2)),
          belowTenPercent: result.wordErrorRate < 0.1,
        },
      },
      null,
      2,
    ),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(
      JSON.stringify(
        {
          ok: false,
          message:
            error instanceof Error ? error.message : "Unknown WER evaluation error.",
        },
        null,
        2,
      ),
    );
    process.exit(1);
  });
}
