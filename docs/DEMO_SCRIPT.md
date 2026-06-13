# ScribeFlow Final Demo Script

**Estimated Duration:** 5–7 minutes

## 1. Problem Statement (0:00 - 0:30)

- **Goal:** "Meetings are full of valuable insights, but taking notes and extracting actionable items manually is tedious and error-prone. ScribeFlow automates meeting intelligence by transcribing audio, identifying speakers, extracting structured summaries, and indexing everything for semantic search."

## 2. Dashboard Walkthrough (0:30 - 1:00)

- **Navigate to:** `http://localhost:5173/` (Dashboard)
- **Action:** Highlight the real-time metrics dynamically extracted from the database.
- **Talk Track:** "Our dashboard provides immediate cross-meeting insights. We track total processed meetings, cumulative meeting hours, searchable chunks, and active open action items alongside trending topics across all records."

## 3. Uploading a Meeting (1:00 - 1:30)

- **Navigate to:** `/meetings/new`
- **Action:** Upload a short demo audio file. Show the processing indicators.
- **Talk Track:** "We support robust, chunked uploads directly to Supabase private storage via TUS. This ensures large files upload securely without overwhelming the backend."

## 4. Transcription & Diarisation (1:30 - 2:00)

- **Navigate to:** The `MeetingDetail` page for the uploaded meeting.
- **Action:** Show the "Transcript" tab.
- **Talk Track:** "Once uploaded, Deepgram processes the audio for high-accuracy transcription and speaker diarisation. Notice how the text is seamlessly segmented by distinct speakers."

## 5. Renaming Speakers (2:00 - 2:30)

- **Action:** Click a generic speaker badge (e.g., "Speaker 0") and rename them.
- **Talk Track:** "To make the transcript readable, we can easily rename speakers. This update propagates instantly across the transcript."

## 6. Gemini Summary & Action Items (2:30 - 3:30)

- **Action:** Switch to the "Overview" tab.
- **Talk Track:** "Next, we pass the transcript to Google Gemini using Structured Outputs to enforce a strict JSON schema. This guarantees we get an Executive Summary, Discussion Points, and a concrete list of Action Items."
- **Action:** Mark an action item as completed.
- **Talk Track:** "Action items are fully interactive and trackable."

## 7. Evidence Jump (3:30 - 4:00)

- **Action:** Click the target icon next to an Action Item or Summary point.
- **Talk Track:** "To prevent AI hallucinations, every insight is strictly tied to its source context. Clicking this evidence link deep-links you exactly to the original transcript segment where the decision was made."

## 8. Semantic Search & Deep-linking (4:00 - 5:00)

- **Navigate to:** `/search`
- **Action:** Search a conceptual phrase (e.g., "budget considerations").
- **Talk Track:** "We use Gemini Embeddings to index transcript chunks into pgvector. This allows us to perform semantic search—finding meaning rather than exact keyword matches. When we click 'Open' on a search result, it deep-links directly back to the specific transcript segment, automatically scrolling to and highlighting the exact moment."

## 9. Analytics Polish (5:00 - 5:30)

- **Navigate to:** `/analytics`
- **Action:** Show the chronological chart, speaker distribution, and topic chips.
- **Talk Track:** "Our analytics page pulls this structured data together, showing meeting frequency over time, dominance in speaking distribution, and aggregated recurring topics."

## 10. Conclusion & Metrics (5:30 - 6:00)

- **Action:** Conclude the demo by reiterating the technical robustness.
- **Talk Track:** "To wrap up, the platform achieves excellent Word Error Rates (WER) using Deepgram. We safely enforce schema validation on Gemini extraction and maintain efficient RAG querying via Supabase pgvector. ScribeFlow transforms raw audio into a fully searchable, structured intelligence graph."

---

## Fallback Plan

If live services fail due to internet instability or API quotas:

1. **Upload fails:** Skip the upload step and use a pre-existing meeting from the **Archive** or **Dashboard**.
2. **API Quota Exceeded:** Rely entirely on a retained, fully processed meeting record. The semantic search and structured data will still work locally.
3. **Search Quota Exceeded:** Perform search queries using exact matches known to be pre-indexed, or rely on command-line output from a previously run verifier.
4. **Verifiers Fail:** Display the static terminal outputs from the latest passing run.
