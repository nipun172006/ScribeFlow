import { afterEach, describe, expect, it, vi } from "vitest";

async function loadService() {
  vi.resetModules();
  vi.stubEnv("DEEPGRAM_API_KEY", "dg_test_key");
  vi.stubEnv("DEEPGRAM_MODEL", "nova-3");
  vi.stubEnv("DEEPGRAM_DIARIZE_MODEL", "latest");
  vi.stubEnv("DEEPGRAM_DEFAULT_LANGUAGE", "en");
  vi.stubEnv("DEEPGRAM_REQUEST_TIMEOUT_MS", "120000");
  vi.stubEnv("DEEPGRAM_MAX_RETRIES", "1");

  return import("../src/services/deepgramTranscriptionService.js");
}

const deepgramFixture = {
  metadata: {
    request_id: "dg-request-123",
    duration: 2,
    models: ["nova-3"],
  },
  results: {
    channels: [
      {
        detected_language: "en",
        alternatives: [
          {
            transcript: "Hello there. Hi back.",
            confidence: 0.95,
            words: [],
          },
        ],
      },
    ],
    utterances: [
      {
        start: 0,
        end: 1,
        speaker: 0,
        confidence: 0.98,
        transcript: "Hello there.",
        words: [
          {
            word: "hello",
            punctuated_word: "Hello",
            start: 0,
            end: 0.5,
            confidence: 0.99,
            speaker: 0,
            speaker_confidence: 0.96,
          },
          {
            word: "there",
            punctuated_word: "there.",
            start: 0.5,
            end: 1,
            confidence: 0.97,
            speaker: 0,
            speaker_confidence: 0.95,
          },
        ],
      },
      {
        start: 1,
        end: 2,
        speaker: 1,
        confidence: 0.94,
        transcript: "Hi back.",
        words: [
          {
            word: "hi",
            punctuated_word: "Hi",
            start: 1,
            end: 1.5,
            confidence: 0.94,
            speaker: 1,
            speaker_confidence: 0.93,
          },
          {
            word: "back",
            punctuated_word: "back.",
            start: 1.5,
            end: 2,
            confidence: 0.93,
            speaker: 1,
            speaker_confidence: 0.92,
          },
        ],
      },
    ],
  },
};

describe("DeepgramTranscriptionService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the current batch diarisation parameter without deprecated diarize", async () => {
    const { DeepgramTranscriptionService } = await loadService();
    const transcribeUrl = vi.fn(async () => deepgramFixture);
    const service = new DeepgramTranscriptionService(() => ({
      listen: {
        v1: {
          media: {
            transcribeUrl,
          },
        },
      },
    }));

    await service.transcribeRecording({
      audioUrl: "https://storage.example/signed-audio",
      language: "en",
      knownParticipants: ["Priya", "priya", "Line\nBreak"],
      technicalTerms: ["ScribeFlow", "Line Break"],
    });

    const [request, requestOptions] = transcribeUrl.mock.calls[0] as unknown as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(request).toMatchObject({
      url: "https://storage.example/signed-audio",
      model: "nova-3",
      diarize_model: "latest",
      punctuate: true,
      smart_format: true,
      utterances: true,
    });
    expect(request).not.toHaveProperty("diarize");
    expect(request["keyterm"]).toEqual(["Priya", "Line Break", "ScribeFlow"]);
    expect(requestOptions).toMatchObject({
      timeoutInSeconds: 120,
      maxRetries: 1,
    });
  });

  it("normalizes utterances into speakers, segments and word metadata", async () => {
    const { normalizeDeepgramResponse } = await loadService();

    const normalized = normalizeDeepgramResponse(deepgramFixture, "en");

    expect(normalized).toMatchObject({
      language: "en",
      durationSeconds: 2,
      modelName: "nova-3",
      providerRequestId: "dg-request-123",
      diarizeModel: "latest",
      wordCount: 4,
    });
    expect(normalized.confidence).toBeCloseTo(0.96, 2);
    expect(normalized.speakers).toEqual([
      {
        rawSpeakerIndex: 0,
        displayName: "Speaker 1",
        totalSpeakingSeconds: 1,
        speakingPercentage: 50,
      },
      {
        rawSpeakerIndex: 1,
        displayName: "Speaker 2",
        totalSpeakingSeconds: 1,
        speakingPercentage: 50,
      },
    ]);
    expect(normalized.segments).toHaveLength(2);
    expect(normalized.segments[0]).toMatchObject({
      segmentIndex: 0,
      rawSpeakerIndex: 0,
      startMs: 0,
      endMs: 1000,
      text: "Hello there.",
    });
    expect(normalized.segments[0]?.words[0]).toMatchObject({
      text: "hello",
      punctuatedText: "Hello",
      rawSpeakerIndex: 0,
      speakerConfidence: 0.96,
    });
  });

  it("rejects provider output without usable transcript segments", async () => {
    const { normalizeDeepgramResponse } = await loadService();

    expect(() =>
      normalizeDeepgramResponse(
        {
          metadata: { duration: 0 },
          results: { channels: [] },
        },
        "en",
      ),
    ).toThrow("no usable speech segments");
  });
});
