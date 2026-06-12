import { describe, expect, it } from "vitest";
import {
  calculateWer,
  cleanupReferenceText,
  tokenizeForWer,
} from "../scripts/evaluateWer.mjs";

describe("WER evaluation utility", () => {
  it("removes only standalone labels, title and blank lines from references", () => {
    const cleaned = cleanupReferenceText(`
TWO-PERSON COLLEGE EVENT PLANNING MEETING

YOU:
We need posters for the event.
PARTNER:
Partner: This inline label should stay as spoken content.
`);

    expect(cleaned.cleanup).toEqual({
      originalLineCount: 8,
      removedBlankLines: 3,
      removedTitleLines: 1,
      removedStandaloneSpeakerLabels: 2,
      keptLineCount: 2,
    });
    expect(cleaned.text).toBe(
      "We need posters for the event. Partner: This inline label should stay as spoken content.",
    );
  });

  it("computes word error rate from normalized tokens", () => {
    expect(tokenizeForWer("Hello, WORLD!")).toEqual(["hello", "world"]);
    const result = calculateWer("hello world", "hello there world");

    expect(result.referenceWordCount).toBe(2);
    expect(result.hypothesisWordCount).toBe(3);
    expect(result.edits).toBe(1);
    expect(result.substitutions).toBe(0);
    expect(result.deletions).toBe(0);
    expect(result.insertions).toBe(1);
    expect(result.wordErrorRate).toBe(0.5);
  });

  it("reports substitution and deletion counts separately", () => {
    const substitution = calculateWer("hello world", "hello team");
    const deletion = calculateWer("hello bright world", "hello world");

    expect(substitution.substitutions).toBe(1);
    expect(substitution.insertions).toBe(0);
    expect(deletion.deletions).toBe(1);
  });

  it("rejects references with no spoken words", () => {
    expect(() => calculateWer("", "hello")).toThrow("Reference transcript");
  });
});
