import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import * as Tabs from "@radix-ui/react-tabs";
import {
  AlertCircle,
  CheckCircle2,
  FileAudio,
  HardDriveUpload,
  Info,
  Mic2,
  ShieldCheck,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Upload } from "tus-js-client";
import { audioUploadPolicy } from "@scribeflow/shared";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { PageHeader } from "../components/PageHeader";
import {
  ApiClientError,
  completeMeetingUpload,
  createLiveMeeting,
  failMeetingUpload,
  initializeUploadMeeting,
} from "../lib/apiClient";
import { cx } from "../lib/classNames";
import { formatBytes } from "../lib/format";
import { createTusUpload, startTusUploadWithResume } from "../lib/tusUpload";

type UploadPhase =
  | "idle"
  | "creating"
  | "uploading"
  | "verifying"
  | "uploaded"
  | "failed";

const splitLines = (value: string) => {
  const seen = new Set<string>();
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => {
      if (!item) {
        return false;
      }

      const key = item.toLocaleLowerCase();
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
};

const toIsoDate = (value: string) => {
  if (!value) {
    return undefined;
  }

  return new Date(`${value}T00:00:00`).toISOString();
};

const getExtension = (fileName: string) =>
  fileName.split(".").pop()?.toLocaleLowerCase() ?? "";

const isAllowedFile = (file: File) =>
  audioUploadPolicy.allowedExtensions.includes(
    getExtension(file.name) as (typeof audioUploadPolicy.allowedExtensions)[number],
  ) &&
  audioUploadPolicy.allowedMimeTypes.includes(
    file.type as (typeof audioUploadPolicy.allowedMimeTypes)[number],
  );

const acceptTypes = [
  ...audioUploadPolicy.allowedMimeTypes,
  ...audioUploadPolicy.allowedExtensions.map((extension) => `.${extension}`),
].join(",");

export function NewMeetingPage() {
  const navigate = useNavigate();
  const uploadRef = useRef<Upload | null>(null);
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [language, setLanguage] = useState("en");
  const [participants, setParticipants] = useState("");
  const [vocabulary, setVocabulary] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [uploadError, setUploadError] = useState<ApiClientError | Error | null>(null);
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);

  const isUploading =
    phase === "creating" || phase === "uploading" || phase === "verifying";

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isUploading) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isUploading]);

  const validationMessages = useMemo(() => {
    const messages: string[] = [];
    const participantList = splitLines(participants);
    const termList = splitLines(vocabulary);

    if (!title.trim()) {
      messages.push("Meeting title is required.");
    }

    if (!file) {
      messages.push("Choose an audio or video recording file.");
    }

    if (file && file.size <= 0) {
      messages.push("The selected file is empty.");
    }

    if (file && file.size > audioUploadPolicy.maxFileSizeBytes) {
      messages.push(
        `The file must be ${formatBytes(audioUploadPolicy.maxFileSizeBytes)} or smaller.`,
      );
    }

    if (file && !isAllowedFile(file)) {
      messages.push("The selected file type is not supported.");
    }

    if (language.trim().length > 24) {
      messages.push("Language must be 24 characters or fewer.");
    }

    if (participantList.length > 30) {
      messages.push("Use 30 or fewer participant names.");
    }

    if (termList.length > 60) {
      messages.push("Use 60 or fewer technical terms.");
    }

    return messages;
  }, [file, language, participants, title, vocabulary]);

  const isUploadValid = validationMessages.length === 0;
  const uploadPercent = file?.size ? Math.round((uploadedBytes / file.size) * 100) : 0;

  const runUpload = async () => {
    if (!file || !isUploadValid) {
      return;
    }

    setUploadError(null);
    setUploadedBytes(0);
    setPhase("creating");

    let meetingId: string | null = null;

    try {
      const initialized = await initializeUploadMeeting({
        title: title.trim(),
        fileName: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
        recordedAt: toIsoDate(meetingDate),
        language: language.trim() || undefined,
        knownParticipants: splitLines(participants),
        technicalTerms: splitLines(vocabulary),
      });

      meetingId = initialized.meeting.id;
      setActiveMeetingId(meetingId);
      setPhase("uploading");

      await new Promise<void>((resolve, reject) => {
        const upload = createTusUpload(file, initialized.upload, {
          onProgress: (bytesUploaded) => setUploadedBytes(bytesUploaded),
          onSuccess: resolve,
          onError: reject,
        });
        uploadRef.current = upload;
        void startTusUploadWithResume(upload).catch(reject);
      });

      setPhase("verifying");
      await completeMeetingUpload(initialized.meeting.id);
      setPhase("uploaded");
      navigate(`/meetings/${initialized.meeting.id}/processing`);
    } catch (error) {
      setPhase("failed");
      const normalizedError =
        error instanceof Error ? error : new Error("The upload failed unexpectedly.");
      setUploadError(normalizedError);

      if (meetingId) {
        void failMeetingUpload(meetingId, {
          errorCode: "CLIENT_UPLOAD_FAILED",
          message: normalizedError.message.slice(0, 240),
        }).catch(() => undefined);
      }
    } finally {
      uploadRef.current = null;
    }
  };

  const liveMutation = useMutation({
    mutationFn: () =>
      createLiveMeeting({
        title: title.trim() || "Untitled live meeting",
        recordedAt: toIsoDate(meetingDate),
        language: language.trim() || undefined,
        knownParticipants: splitLines(participants),
        technicalTerms: splitLines(vocabulary),
      }),
    onSuccess: ({ meeting }) => navigate(`/meetings/${meeting.id}`),
  });

  const visibleError =
    uploadError instanceof ApiClientError || uploadError instanceof Error
      ? uploadError
      : null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Capture"
        title="Create a meeting"
        description="Create persisted meeting metadata, upload private audio directly to Supabase Storage, and keep AI processing clearly marked as a later phase."
      />

      <Tabs.Root defaultValue="upload" className="space-y-6">
        <Tabs.List
          className="inline-flex rounded-card border border-border bg-surface p-1"
          aria-label="Meeting creation modes"
        >
          <Tabs.Trigger
            value="upload"
            className="inline-flex items-center gap-2 rounded-control px-4 py-2 text-sm font-medium text-muted transition duration-fast data-[state=active]:bg-surface-raised data-[state=active]:text-primary"
          >
            <HardDriveUpload size={16} aria-hidden="true" />
            Upload Recording
          </Tabs.Trigger>
          <Tabs.Trigger
            value="live"
            className="inline-flex items-center gap-2 rounded-control px-4 py-2 text-sm font-medium text-muted transition duration-fast data-[state=active]:bg-surface-raised data-[state=active]:text-primary"
          >
            <Mic2 size={16} aria-hidden="true" />
            Start Live Meeting
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="upload">
          <form
            className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]"
            onSubmit={(event) => {
              event.preventDefault();
              void runUpload();
            }}
          >
            <section className="space-y-5 rounded-card border border-border bg-surface p-5">
              <MeetingMetadataFields
                title={title}
                setTitle={setTitle}
                meetingDate={meetingDate}
                setMeetingDate={setMeetingDate}
                language={language}
                setLanguage={setLanguage}
                participants={participants}
                setParticipants={setParticipants}
                vocabulary={vocabulary}
                setVocabulary={setVocabulary}
              />
            </section>

            <section className="space-y-5 rounded-card border border-border bg-surface p-5">
              <div
                className={cx(
                  "flex min-h-64 flex-col items-center justify-center rounded-card border border-dashed px-5 py-8 text-center transition duration-fast",
                  dragActive
                    ? "border-accent bg-accent/10"
                    : "border-border bg-background/50",
                )}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                  setFile(event.dataTransfer.files.item(0));
                }}
              >
                <FileAudio className="text-accent" size={36} aria-hidden="true" />
                <h2 className="mt-4 text-lg font-semibold">Upload recording</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted">
                  Drag a recording here or choose one from your device. Supported
                  formats include MP3, WAV, M4A, MP4, Ogg and WebM.
                </p>
                <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-control border border-border bg-surface-raised px-4 py-2.5 text-sm font-semibold text-primary hover:border-accent/70">
                  <HardDriveUpload size={17} aria-hidden="true" />
                  Choose file
                  <input
                    type="file"
                    accept={acceptTypes}
                    className="sr-only"
                    onChange={(event) => setFile(event.target.files?.item(0) ?? null)}
                  />
                </label>
                {file ? (
                  <p className="mt-4 text-sm text-primary">
                    {file.name} · {formatBytes(file.size)}
                  </p>
                ) : null}
              </div>

              {validationMessages.length > 0 ? (
                <ValidationPanel messages={validationMessages} />
              ) : null}

              {phase !== "idle" ? (
                <UploadProgressPanel
                  phase={phase}
                  fileName={file?.name ?? "Recording"}
                  uploadedBytes={uploadedBytes}
                  totalBytes={file?.size ?? 0}
                  percent={uploadPercent}
                />
              ) : null}

              {visibleError ? (
                <ErrorState
                  title="Upload failed"
                  message={visibleError.message}
                  requestId={
                    visibleError instanceof ApiClientError
                      ? visibleError.requestId
                      : null
                  }
                />
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  disabled={!isUploadValid || isUploading}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-control bg-accent px-4 py-3 text-sm font-semibold text-accent-contrast transition duration-fast hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <HardDriveUpload size={18} aria-hidden="true" />
                  {phase === "creating"
                    ? "Creating meeting"
                    : phase === "uploading"
                      ? "Uploading"
                      : phase === "verifying"
                        ? "Verifying upload"
                        : "Upload recording"}
                </button>
                {isUploading ? (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-control border border-border px-4 py-3 text-sm font-semibold text-primary hover:border-error/60"
                    onClick={() => {
                      uploadRef.current?.abort(true);
                      setPhase("failed");
                      setUploadError(new Error("Upload was canceled."));
                      if (activeMeetingId) {
                        void failMeetingUpload(activeMeetingId, {
                          errorCode: "CLIENT_UPLOAD_ABORTED",
                          message: "Upload was canceled by the user.",
                        }).catch(() => undefined);
                      }
                    }}
                  >
                    <X size={18} aria-hidden="true" />
                    Cancel
                  </button>
                ) : null}
              </div>
            </section>
          </form>
        </Tabs.Content>

        <Tabs.Content value="live">
          <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
            <div className="space-y-5 rounded-card border border-border bg-surface p-5">
              <h2 className="text-lg font-semibold text-primary">
                Live meeting metadata
              </h2>
              <p className="text-sm leading-6 text-muted">
                Phase 2 can create a live-meeting record for later WebSocket and
                microphone work. It does not start browser recording or live
                transcription.
              </p>
              <MeetingMetadataFields
                title={title}
                setTitle={setTitle}
                meetingDate={meetingDate}
                setMeetingDate={setMeetingDate}
                language={language}
                setLanguage={setLanguage}
                participants={participants}
                setParticipants={setParticipants}
                vocabulary={vocabulary}
                setVocabulary={setVocabulary}
              />
              <div className="rounded-card border border-border bg-background/60 p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-primary">
                  <ShieldCheck size={17} aria-hidden="true" />
                  Privacy note
                </p>
                <p className="mt-1 text-sm leading-6 text-muted">
                  Audio provider keys and Supabase server credentials remain on the API.
                  The browser only creates metadata in this phase.
                </p>
              </div>
              {liveMutation.error instanceof ApiClientError ? (
                <ErrorState
                  title="Live meeting record was not created"
                  message={liveMutation.error.message}
                  requestId={liveMutation.error.requestId}
                />
              ) : null}
              <button
                type="button"
                disabled={!title.trim() || liveMutation.isPending}
                onClick={() => liveMutation.mutate()}
                className="inline-flex items-center gap-2 rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Mic2 size={18} aria-hidden="true" />
                {liveMutation.isPending
                  ? "Creating record"
                  : "Create live meeting record"}
              </button>
            </div>
            <EmptyState
              icon={<Info size={20} aria-hidden="true" />}
              title="Live recording is not implemented yet"
              message="The API persists live-meeting metadata only. Microphone capture, live streaming and Deepgram sessions remain Phase 3+ work."
            />
          </section>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function MeetingMetadataFields(props: {
  title: string;
  setTitle: (value: string) => void;
  meetingDate: string;
  setMeetingDate: (value: string) => void;
  language: string;
  setLanguage: (value: string) => void;
  participants: string;
  setParticipants: (value: string) => void;
  vocabulary: string;
  setVocabulary: (value: string) => void;
}) {
  return (
    <>
      <div>
        <label htmlFor="meeting-title" className="sf-label">
          Meeting title
        </label>
        <input
          id="meeting-title"
          value={props.title}
          onChange={(event) => props.setTitle(event.target.value)}
          className="sf-field mt-2"
          placeholder="Design review, sprint planning, viva practice"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="meeting-date" className="sf-label">
            Meeting date
          </label>
          <input
            id="meeting-date"
            type="date"
            value={props.meetingDate}
            onChange={(event) => props.setMeetingDate(event.target.value)}
            className="sf-field mt-2"
          />
        </div>
        <div>
          <label htmlFor="language" className="sf-label">
            Language
          </label>
          <input
            id="language"
            value={props.language}
            onChange={(event) => props.setLanguage(event.target.value)}
            className="sf-field mt-2"
            placeholder="en"
            maxLength={24}
          />
        </div>
      </div>

      <div>
        <label htmlFor="participants" className="sf-label">
          Known participant names
        </label>
        <textarea
          id="participants"
          value={props.participants}
          onChange={(event) => props.setParticipants(event.target.value)}
          className="sf-field mt-2 min-h-28 resize-y"
          placeholder="One name per line or comma separated"
        />
      </div>

      <div>
        <label htmlFor="vocabulary" className="sf-label">
          Technical vocabulary or key terms
        </label>
        <textarea
          id="vocabulary"
          value={props.vocabulary}
          onChange={(event) => props.setVocabulary(event.target.value)}
          className="sf-field mt-2 min-h-28 resize-y"
          placeholder="Project names, acronyms, module names"
        />
      </div>
    </>
  );
}

function ValidationPanel({ messages }: { messages: string[] }) {
  return (
    <div className="rounded-card border border-warning/40 bg-warning/10 p-4">
      <div className="flex gap-3">
        <AlertCircle className="mt-0.5 text-warning" size={18} aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-primary">Before upload</p>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function UploadProgressPanel(props: {
  phase: UploadPhase;
  fileName: string;
  uploadedBytes: number;
  totalBytes: number;
  percent: number;
}) {
  const phaseLabel =
    props.phase === "creating"
      ? "Creating meeting"
      : props.phase === "uploading"
        ? "Uploading to private storage"
        : props.phase === "verifying"
          ? "Verifying uploaded object"
          : props.phase === "uploaded"
            ? "Upload verified"
            : "Upload failed";

  return (
    <div className="rounded-card border border-border bg-background/60 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">{phaseLabel}</p>
          <p className="mt-1 text-sm text-muted">{props.fileName}</p>
        </div>
        {props.phase === "uploaded" ? (
          <CheckCircle2 className="text-success" size={20} aria-hidden="true" />
        ) : null}
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-fast"
          style={{ width: `${Math.min(100, props.percent)}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted">
        {formatBytes(props.uploadedBytes)} of {formatBytes(props.totalBytes)} ·{" "}
        {Number.isFinite(props.percent) ? props.percent : 0}%
      </p>
    </div>
  );
}
