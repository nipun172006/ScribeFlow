export type ReferenceCleanup = {
  originalLineCount: number;
  removedBlankLines: number;
  removedTitleLines: number;
  removedStandaloneSpeakerLabels: number;
  keptLineCount: number;
};

export function cleanupReferenceText(text: string): {
  text: string;
  cleanup: ReferenceCleanup;
};

export function tokenizeForWer(text: string): string[];

export function calculateWer(
  referenceText: string,
  hypothesisText: string,
): {
  edits: number;
  substitutions: number;
  deletions: number;
  insertions: number;
  referenceWordCount: number;
  hypothesisWordCount: number;
  wordErrorRate: number;
  wordAccuracy: number;
};
