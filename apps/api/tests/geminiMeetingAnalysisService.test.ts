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

type GenerateRequestForTest = {
  contents: string;
  config: {
    httpOptions: { timeout: number };
    maxOutputTokens?: number;
    responseSchema?: unknown;
    thinkingConfig?: {
      includeThoughts?: boolean;
      thinkingBudget?: number;
    };
  };
};

async function loadService(geminiKey = "test-gemini-key") {
  vi.resetModules();
  vi.stubEnv("GEMINI_API_KEY", geminiKey);
  vi.stubEnv("GEMINI_MODEL", "gemini-2.5-flash");
  vi.stubEnv("GEMINI_REQUEST_TIMEOUT_MS", "60000");
  vi.stubEnv("LOG_LEVEL", "silent");

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

  it("compacts long transcript prompts before sending them to Gemini", async () => {
    const { prepareGeminiAnalysisPrompt } = await loadService();
    const prompt = prepareGeminiAnalysisPrompt({
      meetingTitle: "Long AMI Meeting",
      knownParticipants: ["A", "B"],
      speakers: [],
      transcriptSegments: Array.from({ length: 80 }, (_, index) => ({
        id: `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`,
        speakerName: `Speaker ${(index % 4) + 1}`,
        startMs: index * 1000,
        endMs: index * 1000 + 900,
        text: `Segment ${index} ${"discussion ".repeat(420)}`,
      })),
    });

    expect(prompt.truncated).toBe(true);
    expect(prompt.includedSegmentCount).toBeLessThan(prompt.totalSegmentCount);
    expect(prompt.contents).toContain("transcriptWasTruncated");
    expect(prompt.contents).toContain("includedTranscriptSegmentCount");
    expect(prompt.contents.length).toBeLessThan(190_000);
  });

  it("uses a longer provider timeout for many-segment meeting analysis", async () => {
    const { GeminiMeetingAnalysisService } = await loadService();
    const generateContent = vi.fn(async () => ({
      text: JSON.stringify(validAnalysis),
    }));
    const service = new GeminiMeetingAnalysisService(() => ({
      models: { generateContent },
    }));

    await service.analyseTranscript({
      meetingTitle: "Long AMI Meeting",
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
        {
          id: secondSegmentId,
          speakerName: "Arjun",
          startMs: 1000,
          endMs: 2000,
          text: "Someone should send the final readiness note.",
        },
        ...Array.from({ length: 220 }, (_, index) => ({
          id: `${String(index).padStart(8, "0")}-2222-4222-8222-222222222222`,
          speakerName: `Speaker ${(index % 4) + 1}`,
          startMs: (index + 2) * 1000,
          endMs: (index + 2) * 1000 + 900,
          text: `Short segment ${index}`,
        })),
      ],
    });

    const calls = generateContent.mock.calls as unknown as Array<
      [GenerateRequestForTest]
    >;
    const request = calls[0]?.[0];
    expect(request).toBeDefined();
    if (!request) {
      throw new Error("Gemini request was not captured.");
    }
    expect(request.config.httpOptions.timeout).toBe(240_000);
    expect(request.config.maxOutputTokens).toBe(8192);
    expect(request.config.thinkingConfig).toEqual({
      includeThoughts: false,
      thinkingBudget: 0,
    });
  });

  it("starts long meeting analysis without response schema overhead", async () => {
    const { GeminiMeetingAnalysisService } = await loadService();
    const generateContent = vi.fn(async () => ({
      text: JSON.stringify(validAnalysis),
      responseId: "json-mode-response",
    }));
    const service = new GeminiMeetingAnalysisService(() => ({
      models: { generateContent },
    }));

    const result = await service.analyseTranscript({
      meetingTitle: "Long AMI Meeting",
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
        {
          id: secondSegmentId,
          speakerName: "Arjun",
          startMs: 1000,
          endMs: 2000,
          text: "Someone should send the final readiness note.",
        },
        ...Array.from({ length: 220 }, (_, index) => ({
          id: `${String(index).padStart(8, "0")}-3333-4333-8333-333333333333`,
          speakerName: `Speaker ${(index % 4) + 1}`,
          startMs: (index + 2) * 1000,
          endMs: (index + 2) * 1000 + 900,
          text: `Short segment ${index}`,
        })),
      ],
    });

    expect(result.responseId).toBe("json-mode-response");
    expect(generateContent).toHaveBeenCalledTimes(1);

    const calls = generateContent.mock.calls as unknown as Array<
      [GenerateRequestForTest]
    >;
    const request = calls[0]?.[0];
    expect(request).toBeDefined();
    if (!request) {
      throw new Error("Gemini request was not captured.");
    }
    expect(request.config.responseSchema).toBeUndefined();
    expect(String(request.contents)).toContain(
      "For long transcripts, prioritize the strongest evidence-backed items",
    );
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

  it("normalizes common Gemini JSON drift before validating analysis output", async () => {
    const { parseAndValidateGeminiAnalysis } = await loadService();

    const parsed = parseAndValidateGeminiAnalysis(
      [
        "```json",
        JSON.stringify({
          attendees: [" Priya "],
          executiveOverview: " The team reviewed launch readiness. ",
          keyDecisions: [
            {
              decision: "The launch date stays unchanged.",
              evidenceSegmentIds: [segmentId, "1000"],
            },
          ],
          discussionPoints: [{ point: "Support handoff was discussed." }],
          openQuestions: [{ question: "Does support need a checklist?" }],
          nextSteps: [{ step: "Send the readiness note." }],
          topics: [{ label: "launch readiness" }],
          actionItems: [
            {
              action: "Send the readiness note.",
              ownerName: "",
              deadlineText: "",
              confidence: "0.7",
              evidenceSegmentIds: [secondSegmentId, "not-a-segment"],
            },
          ],
        }),
        "```",
      ].join("\n"),
      [segmentId, secondSegmentId],
    );

    expect(parsed.keyDecisions[0]).toEqual({
      text: "The launch date stays unchanged.",
      evidenceSegmentIds: [segmentId],
    });
    expect(parsed.actionItems[0]).toEqual({
      task: "Send the readiness note.",
      ownerName: null,
      deadlineText: null,
      confidence: 0.7,
      evidenceSegmentIds: [secondSegmentId],
    });
    expect(parsed.topics).toEqual(["launch readiness"]);
  });

  it("normalizes close but invalid Gemini output without a repair retry", async () => {
    const { GeminiMeetingAnalysisService } = await loadService();
    const generateContent = vi.fn().mockResolvedValueOnce({
      text: JSON.stringify({
        ...validAnalysis,
        actionItems: [{ ...validActionItem, ownerName: "" }],
      }),
      responseId: "initial-response",
    });
    const service = new GeminiMeetingAnalysisService(() => ({
      models: {
        generateContent,
      },
    }));

    const result = await service.analyseTranscript({
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
        {
          id: secondSegmentId,
          speakerName: "Arjun",
          startMs: 1000,
          endMs: 2000,
          text: "Someone should send the final readiness note.",
        },
      ],
    });

    expect(result.responseId).toBe("initial-response");
    expect(result.analysis.actionItems[0]?.ownerName).toBeNull();
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid Gemini output after repair instead of returning a fallback", async () => {
    const { GeminiMeetingAnalysisService } = await loadService();
    const generateContent = vi
      .fn()
      .mockResolvedValueOnce({
        text: "```json\n{}\n```",
      })
      .mockResolvedValueOnce({
        text: "{}",
      });
    const service = new GeminiMeetingAnalysisService(() => ({
      models: {
        generateContent,
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
    ).rejects.toThrow("remained invalid after schema repair retry");
    expect(generateContent).toHaveBeenCalledTimes(2);
  });
});
