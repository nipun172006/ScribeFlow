import { afterEach, describe, expect, it, vi } from "vitest";
import { structuredMeetingAnalysisSchema } from "@scribeflow/shared";

const segmentId = "44444444-4444-4444-8444-444444444444";
const secondSegmentId = "55555555-5555-4555-8555-555555555555";

const validAnalysis = {
  attendees: ["Priya", "Arjun"],
  executiveOverview: "The team reviewed launch readiness and open blockers.",
  keyDecisions: [
    {
      text: "The team will keep the launch date unchanged.",
      evidenceSegmentIds: [segmentId],
    },
  ],
  discussionPoints: [
    {
      text: "Upload verification and support handoff were discussed.",
      evidenceSegmentIds: [segmentId, secondSegmentId],
    },
  ],
  openQuestions: [
    {
      text: "Whether support needs a separate escalation checklist remains open.",
      evidenceSegmentIds: [secondSegmentId],
    },
  ],
  nextSteps: [
    {
      text: "Send the final readiness note.",
      evidenceSegmentIds: [secondSegmentId],
    },
  ],
  topics: ["launch readiness", "support handoff"],
  actionItems: [
    {
      task: "Send the final readiness note.",
      ownerName: null,
      deadlineText: null,
      confidence: 0.74,
      evidenceSegmentIds: [secondSegmentId],
    },
  ],
};

const validActionItem = validAnalysis.actionItems[0]!;

async function loadService(geminiKey = "test-gemini-key") {
  vi.resetModules();
  vi.stubEnv("GEMINI_API_KEY", geminiKey);
  vi.stubEnv("GEMINI_MODEL", "gemini-2.5-flash");
  vi.stubEnv("GEMINI_REQUEST_TIMEOUT_MS", "60000");

  return import("../src/services/geminiMeetingAnalysisService.js");
}

describe("GeminiMeetingAnalysisService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("detects Gemini configuration without exposing the key", async () => {
    const { GeminiMeetingAnalysisService } = await loadService("configured-key");
    expect(new GeminiMeetingAnalysisService().isConfigured()).toBe(true);

    const { GeminiMeetingAnalysisService: UnconfiguredService } = await loadService("");
    expect(
      new UnconfiguredService(() => ({
        models: { generateContent: vi.fn() },
      })).isConfigured(),
    ).toBe(false);
  });

  it("validates the shared structured analysis schema", () => {
    const parsed = structuredMeetingAnalysisSchema.parse(validAnalysis);

    expect(parsed.actionItems[0]?.ownerName).toBeNull();
    expect(parsed.actionItems[0]?.deadlineText).toBeNull();
  });

  it("rejects invalid confidence values", () => {
    expect(() =>
      structuredMeetingAnalysisSchema.parse({
        ...validAnalysis,
        actionItems: [
          {
            ...validActionItem,
            confidence: 1.5,
          },
        ],
      }),
    ).toThrow();
  });

  it("builds a structured JSON request and preserves null owner/deadline fields", async () => {
    const { GeminiMeetingAnalysisService } = await loadService();
    const generateContent = vi.fn(async () => ({
      text: JSON.stringify(validAnalysis),
      responseId: "gemini-response-123",
      modelVersion: "gemini-2.5-flash-001",
    }));
    const service = new GeminiMeetingAnalysisService(() => ({
      models: { generateContent },
    }));

    const result = await service.analyseTranscript({
      meetingTitle: "Launch Readiness",
      knownParticipants: ["Priya", "Arjun"],
      speakers: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          rawSpeakerIndex: 0,
          displayName: "Priya",
        },
      ],
      transcriptSegments: [
        {
          id: segmentId,
          speakerName: "Priya",
          startMs: 0,
          endMs: 1000,
          text: "We are keeping the launch date unchanged.",
        },
        {
          id: secondSegmentId,
          speakerName: "Arjun",
          startMs: 1000,
          endMs: 2000,
          text: "Someone should send the final readiness note.",
        },
      ],
    });

    expect(result).toMatchObject({
      provider: "gemini",
      modelName: "gemini-2.5-flash",
      responseId: "gemini-response-123",
    });
    expect(result.analysis.actionItems[0]).toMatchObject({
      ownerName: null,
      deadlineText: null,
    });

    const [request] = generateContent.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ];
    expect(request).toMatchObject({
      model: "gemini-2.5-flash",
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
        httpOptions: { timeout: 60000 },
      },
    });
    expect(request.config).toHaveProperty("responseSchema");
    expect(String(request.contents)).toContain("Use only the supplied transcript");
  });

  it("rejects unknown evidence segment IDs", async () => {
    const { validateAnalysisEvidenceIds } = await loadService();

    expect(() =>
      validateAnalysisEvidenceIds(
        {
          ...validAnalysis,
          actionItems: [
            {
              ...validActionItem,
              evidenceSegmentIds: ["66666666-6666-4666-8666-666666666666"],
            },
          ],
        },
        [segmentId, secondSegmentId],
      ),
    ).toThrow("unknown transcript segment IDs");
  });

  it("rejects invalid Gemini JSON results", async () => {
    const { GeminiMeetingAnalysisService } = await loadService();
    const service = new GeminiMeetingAnalysisService(() => ({
      models: {
        generateContent: vi.fn(async () => ({
          text: "```json\n{}\n```",
        })),
      },
    }));

    await expect(
      service.analyseTranscript({
        meetingTitle: "Launch Readiness",
        knownParticipants: [],
        speakers: [],
        transcriptSegments: [
          {
            id: segmentId,
            speakerName: "Priya",
            startMs: 0,
            endMs: 1000,
            text: "We are keeping the launch date unchanged.",
          },
        ],
      }),
    ).rejects.toThrow("not valid JSON");
  });
});
