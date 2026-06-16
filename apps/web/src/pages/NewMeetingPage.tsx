import { useEffect, useMemo, useRef, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  AlertCircle,
  CheckCircle2,
  FileAudio,
  HardDriveUpload,
  Mic2,
  RefreshCcw,
  Trash2,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Upload } from "tus-js-client";
import { audioUploadPolicy } from "@scribeflow/shared";
import { ErrorState } from "../components/ErrorState";
import { PageHeader } from "../components/PageHeader";
import {
  ApiClientError,
  completeMeetingUpload,
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

  const [recordingStatus, setRecordingStatus] = useState<
    "idle" | "starting" | "recording" | "error" | "recorded"
  >("idle");
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  const chunksRef = useRef<BlobPart[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const clearRecordingTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    recordingStartedAtRef.current = null;
  };

  const beginRecordingTimer = () => {
    if (timerRef.current !== null) {
      return;
    }

    recordingStartedAtRef.current = Date.now();
    setRecordingDuration(0);
    setRecordingStatus("recording");
    timerRef.current = window.setInterval(() => {
      const startedAt = recordingStartedAtRef.current;
      if (startedAt === null) {
        return;
      }

      setRecordingDuration(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
  };

  useEffect(() => {
    audioUrlRef.current = audioUrl;
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      recordingStartedAtRef.current = null;
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }

      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stream.getTracks().forEach((track) => track.stop());
        recorder.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    let stream: MediaStream | null = null;

    try {
      setRecordingError(null);
      setFile(null);
      setRecordingDuration(0);
      clearRecordingTimer();
      setRecordingStatus("starting");
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);

      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recordingStream = stream;
      const preferredTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/mpeg",
      ];

      let mimeType = "";
      if (typeof MediaRecorder !== "undefined") {
        for (const t of preferredTypes) {
          if (MediaRecorder.isTypeSupported(t)) {
            mimeType = t;
            break;
          }
        }
      }

      const recorder = new MediaRecorder(
        recordingStream,
        mimeType ? { mimeType } : undefined,
      );
      chunksRef.current = [];

      recorder.onstart = beginRecordingTimer;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        clearRecordingTimer();
        const recorderType = recorder.mimeType || "audio/webm";
        const uploadMimeType = recorderType.startsWith("audio/webm")
          ? "audio/webm"
          : recorderType;

        const blob = new Blob(chunksRef.current, { type: uploadMimeType });
        if (blob.size === 0) {
          setRecordingStatus("error");
          setRecordingError(
            "No microphone audio was captured. Please check your input device and record again.",
          );
          recordingStream.getTracks().forEach((track) => track.stop());
          mediaRecorderRef.current = null;
          setMediaRecorder(null);
          return;
        }

        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setRecordingStatus("recorded");

        const ext = uploadMimeType.includes("mp4") ? "mp4" : "webm";
        const dateStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
        const liveFile = new File([blob], `live-meeting-${dateStr}.${ext}`, {
          type: uploadMimeType,
        });
        setFile(liveFile);

        recordingStream.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current = null;
        setMediaRecorder(null);
      };

      recorder.onerror = () => {
        clearRecordingTimer();
        setRecordingStatus("error");
        setRecordingError("Recording failed. Please check microphone permissions.");
        recordingStream.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current = null;
        setMediaRecorder(null);
      };

      mediaRecorderRef.current = recorder;
      setMediaRecorder(recorder);
      recorder.start();
      beginRecordingTimer();
    } catch (err) {
      clearRecordingTimer();
      stream?.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
      setMediaRecorder(null);
      setRecordingStatus("error");
      setRecordingError(
        err instanceof Error ? err.message : "Failed to access microphone.",
      );
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current ?? mediaRecorder;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  };

  const discardRecording = () => {
    clearRecordingTimer();
    chunksRef.current = [];
    mediaRecorderRef.current = null;
    setMediaRecorder(null);
    setFile(null);
    setRecordingDuration(0);
    setRecordingError(null);
    setRecordingStatus("idle");
    setUploadedBytes(0);
    setPhase("idle");
    setUploadError(null);

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      audioUrlRef.current = null;
      setAudioUrl(null);
    }
  };

  const visibleError =
    uploadError instanceof ApiClientError || uploadError instanceof Error
      ? uploadError
      : null;

  return (
    <div className="space-y-9">
      <PageHeader
        eyebrow="Capture"
        title="Create a meeting"
        description="Upload a recording or capture audio live from your browser. ScribeFlow stores audio privately, then runs transcription, diarisation, analysis and search indexing."
      />

      <Tabs.Root
        defaultValue="upload"
        className="space-y-6"
        onValueChange={() => {
          setPhase("idle");
          setFile(null);
          if (recordingStatus === "recording") stopRecording();
        }}
      >
        <Tabs.List
          className="inline-flex rounded-full bg-white/[0.035] p-1 ring-1 ring-white/[0.08] backdrop-blur-xl"
          aria-label="Meeting creation modes"
        >
          <Tabs.Trigger
            value="upload"
            className="inline-flex items-center gap-2 rounded-control px-4 py-2 text-sm font-medium text-muted transition duration-fast data-[state=active]:bg-white/[0.09] data-[state=active]:text-primary"
          >
            <HardDriveUpload size={16} aria-hidden="true" />
            Upload Recording
          </Tabs.Trigger>
          <Tabs.Trigger
            value="live"
            className="inline-flex items-center gap-2 rounded-control px-4 py-2 text-sm font-medium text-muted transition duration-fast data-[state=active]:bg-white/[0.09] data-[state=active]:text-primary"
          >
            <Mic2 size={16} aria-hidden="true" />
            Record Live
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
            <section className="sf-glass-card space-y-5 p-5 md:p-6">
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

            <section className="sf-glass-card space-y-5 p-5 md:p-6">
              <div
                className={cx(
                  "flex min-h-64 flex-col items-center justify-center rounded-card border border-dashed px-5 py-8 text-center transition duration-fast",
                  dragActive
                    ? "border-accent bg-accent/10"
                    : "border-white/10 bg-surface-raised/55",
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
                <label className="sf-secondary-button mt-5 cursor-pointer">
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
                  className="sf-primary-button flex-1"
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
                    className="sf-secondary-button hover:border-error/60"
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
          <form
            className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]"
            onSubmit={(event) => {
              event.preventDefault();
              void runUpload();
            }}
          >
            <section className="sf-glass-card space-y-5 p-5 md:p-6">
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

            <section className="sf-glass-card space-y-5 p-5 md:p-6">
              <div className="relative flex min-h-80 flex-col items-center justify-center overflow-hidden rounded-panel border border-white/10 bg-surface-raised/55 px-5 py-8 text-center transition duration-fast">
                <div
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(129,140,248,0.16),transparent_32rem)]"
                  aria-hidden="true"
                />
                <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.055] text-accent shadow-[0_0_32px_rgba(129,140,248,0.18)]">
                  <Mic2 size={28} aria-hidden="true" />
                </div>
                <h2 className="relative z-10 mt-4 font-display text-2xl font-semibold">
                  Record live meeting
                </h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted">
                  Record a live meeting from your microphone. Processing starts after
                  recording stops and you choose Use recording. If the take is messy,
                  discard it and record again before anything is saved.
                </p>

                {typeof MediaRecorder === "undefined" ||
                !navigator.mediaDevices?.getUserMedia ? (
                  <div className="mt-6 rounded-card border border-error/40 bg-error/10 p-4">
                    <p className="text-sm font-semibold text-error">
                      Browser not supported
                    </p>
                    <p className="mt-1 text-sm text-error/80">
                      Your browser does not support audio recording. Please use a modern
                      browser.
                    </p>
                  </div>
                ) : recordingStatus === "idle" || recordingStatus === "error" ? (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={isUploading}
                    className="sf-primary-button mt-6"
                  >
                    <Mic2 size={17} aria-hidden="true" />
                    Start recording
                  </button>
                ) : recordingStatus === "recorded" ? (
                  <div
                    className="relative z-10 mt-6 flex flex-wrap justify-center gap-3"
                    aria-label="Recorded audio actions"
                  >
                    <button
                      type="button"
                      onClick={startRecording}
                      disabled={isUploading}
                      className="sf-secondary-button"
                    >
                      <RefreshCcw size={17} aria-hidden="true" />
                      Record again
                    </button>
                    <button
                      type="button"
                      onClick={discardRecording}
                      disabled={isUploading}
                      className="inline-flex items-center justify-center gap-2 rounded-control border border-danger/50 bg-danger/10 px-5 py-3 font-ui text-sm font-semibold text-danger transition duration-fast hover:border-danger hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 size={17} aria-hidden="true" />
                      Discard recording
                    </button>
                  </div>
                ) : recordingStatus === "starting" ? (
                  <div
                    className="relative z-10 mt-6 flex flex-col items-center gap-3"
                    role="status"
                    aria-live="polite"
                  >
                    <span className="font-metric text-4xl font-bold text-primary tabular-nums">
                      {formatDuration(recordingDuration)}
                    </span>
                    <p className="text-sm text-muted">
                      Requesting microphone access...
                    </p>
                  </div>
                ) : (
                  <div
                    className="relative z-10 mt-6 flex flex-col items-center gap-5"
                    role="status"
                    aria-live="polite"
                  >
                    <div className="flex items-center gap-3 rounded-full border border-danger/30 bg-danger/10 px-3 py-1 font-ui text-xs font-bold uppercase tracking-[0.16em] text-danger">
                      <span className="relative flex h-3 w-3">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-error opacity-75"></span>
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-error"></span>
                      </span>
                      Recording now
                    </div>
                    <span className="font-metric text-6xl font-bold leading-none text-primary tabular-nums">
                      {formatDuration(recordingDuration)}
                    </span>
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="inline-flex items-center gap-2 rounded-control bg-error px-5 py-3 font-ui text-sm font-bold text-error-contrast shadow-[0_0_32px_rgba(248,113,113,0.2)] transition duration-fast hover:bg-error/90"
                    >
                      <X size={17} aria-hidden="true" />
                      Stop recording
                    </button>
                  </div>
                )}

                {recordingStatus === "error" ? (
                  <div className="mt-4 text-sm text-error text-center">
                    {recordingError}
                  </div>
                ) : null}

                {recordingStatus === "recorded" && audioUrl ? (
                  <div className="relative z-10 mt-6 flex w-full max-w-sm flex-col items-center gap-3 rounded-card border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-sm font-semibold text-primary">
                      Preview ready. This is still local.
                    </p>
                    <audio src={audioUrl} controls className="w-full" />
                    {file ? (
                      <p className="text-sm text-primary">
                        {file.name} · {formatBytes(file.size)}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {validationMessages.length > 0 ? (
                <ValidationPanel messages={validationMessages} />
              ) : null}

              {phase !== "idle" ? (
                <UploadProgressPanel
                  phase={phase}
                  fileName={file?.name ?? "Live Recording"}
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
                  disabled={
                    !isUploadValid || isUploading || recordingStatus !== "recorded"
                  }
                  className="sf-primary-button flex-1"
                >
                  <HardDriveUpload size={18} aria-hidden="true" />
                  {phase === "creating"
                    ? "Creating meeting"
                    : phase === "uploading"
                      ? "Uploading"
                      : phase === "verifying"
                        ? "Verifying upload"
                        : "Use recording"}
                </button>
                {isUploading ? (
                  <button
                    type="button"
                    className="sf-secondary-button hover:border-error/60"
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
    <div className="rounded-card border border-warning/40 bg-warning/10 p-4 shadow-soft backdrop-blur-xl">
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
    <div className="rounded-card border border-white/10 bg-surface-raised/70 p-4 shadow-soft backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">{phaseLabel}</p>
          <p className="mt-1 text-sm text-muted">{props.fileName}</p>
        </div>
        {props.phase === "uploaded" ? (
          <CheckCircle2 className="text-success" size={20} aria-hidden="true" />
        ) : null}
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
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
