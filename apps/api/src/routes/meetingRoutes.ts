import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import {
  meetingListQuerySchema,
  renameSpeakerInputSchema,
  startLiveMeetingInputSchema,
  uploadFailureInputSchema,
  uploadMeetingInputSchema,
  uuidSchema,
} from "@scribeflow/shared";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import type { ApiDependencies } from "../dependencies.js";
import { ApiError } from "../errors/apiError.js";
import { validateRequest } from "../middleware/validateRequest.js";
import {
  assertAllowedFileSize,
  assertAllowedMimeType,
  createStorageObjectPath,
  isAllowedMimeType,
  normalizeList,
} from "../services/audioValidation.js";
import { buildTranscribeMeetingResponse } from "../services/transcriptionResponse.js";

const meetingIdParamsSchema = z.object({
  meetingId: uuidSchema,
});

const speakerParamsSchema = meetingIdParamsSchema.extend({
  speakerId: uuidSchema,
});

const safeUploadFailureCode = (code: string) =>
  code.replace(/[^A-Z0-9_]/g, "_").slice(0, 80) || "UPLOAD_FAILED";

const analysisFailureCodes = new Set([
  "GEMINI_AUTH_FAILED",
  "GEMINI_RATE_LIMITED",
  "GEMINI_REQUEST_TIMEOUT",
  "GEMINI_REQUEST_FAILED",
  "GEMINI_INVALID_RESPONSE",
  "MEETING_ANALYSIS_OUTPUT_INVALID",
  "ANALYSIS_PERSISTENCE_FAILED",
]);

async function tryRemoveObject(
  dependencies: ApiDependencies,
  bucket: string | null,
  objectPath: string | null,
) {
  if (!bucket || !objectPath) {
    return;
  }

  try {
    await dependencies.getStorageService().removeObject({ bucket, objectPath });
  } catch (error) {
    logger.warn({ err: error }, "could not remove invalid storage object");
  }
}

export function createMeetingRoutes(dependencies: ApiDependencies) {
  const router = Router();

  router.post(
    "/meetings/upload",
    validateRequest({ body: uploadMeetingInputSchema }),
    async (_req, res, next) => {
      try {
        const repository = dependencies.getMeetingRepository();
        const storage = dependencies.getStorageService();
        const body = res.locals.body as z.infer<typeof uploadMeetingInputSchema>;
        const mimeType = assertAllowedMimeType(body.mimeType);
        assertAllowedFileSize(body.fileSizeBytes);

        const meetingId = randomUUID();
        const storagePath = createStorageObjectPath(meetingId, body.fileName);
        const normalizedInput = {
          ...body,
          mimeType,
          knownParticipants: normalizeList(body.knownParticipants, 30, 120),
          technicalTerms: normalizeList(body.technicalTerms, 60, 120),
        };

        const meeting = await repository.createUploadMeeting({
          ...normalizedInput,
          id: meetingId,
          storageBucket: env.SUPABASE_AUDIO_BUCKET,
          storagePath,
        });

        try {
          const upload = await storage.createSignedResumableUpload({
            bucket: env.SUPABASE_AUDIO_BUCKET,
            objectPath: storagePath,
          });

          res.status(201).json({ meeting, upload });
        } catch (error) {
          await repository.markMeetingFailed({
            meetingId,
            errorCode: "UPLOAD_SIGNING_FAILED",
            errorMessage: "Could not create a signed upload token.",
          });
          next(error instanceof ApiError ? error : ApiError.uploadSigningFailed());
        }
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/meetings/:meetingId/upload/complete",
    validateRequest({ params: meetingIdParamsSchema }),
    async (_req, res, next) => {
      try {
        const params = res.locals.params as { meetingId: string };
        const repository = dependencies.getMeetingRepository();
        const storage = dependencies.getStorageService();
        const meeting = await repository.getMeetingById(params.meetingId);

        if (!meeting) {
          throw ApiError.meetingNotFound();
        }

        if (
          meeting.sourceType !== "upload" ||
          !meeting.storageBucket ||
          !meeting.storagePath
        ) {
          throw ApiError.conflict(
            "INVALID_MEETING_STATE",
            "Only upload meetings with private storage metadata can be completed.",
          );
        }

        if (!["uploading", "created"].includes(meeting.status)) {
          throw ApiError.conflict(
            "INVALID_MEETING_STATE",
            "This meeting is not waiting for upload completion.",
          );
        }

        let objectInfo: Awaited<ReturnType<typeof storage.getObjectInfo>>;
        try {
          objectInfo = await storage.getObjectInfo({
            bucket: meeting.storageBucket,
            objectPath: meeting.storagePath,
          });
        } catch (error) {
          if (error instanceof ApiError && error.code === "STORAGE_OBJECT_MISSING") {
            await repository.markMeetingFailed({
              meetingId: meeting.id,
              errorCode: "STORAGE_OBJECT_MISSING",
              errorMessage: "Uploaded audio object was not found in private storage.",
            });
          }

          throw error;
        }

        const metadataMatches =
          objectInfo.sizeBytes > 0 &&
          objectInfo.sizeBytes <= env.MAX_AUDIO_FILE_SIZE_BYTES &&
          objectInfo.sizeBytes === meeting.expectedFileSizeBytes &&
          isAllowedMimeType(objectInfo.mimeType ?? meeting.mimeType);

        if (!metadataMatches) {
          await tryRemoveObject(
            dependencies,
            meeting.storageBucket,
            meeting.storagePath,
          );
          await repository.markMeetingFailed({
            meetingId: meeting.id,
            errorCode: "STORAGE_METADATA_MISMATCH",
            errorMessage:
              "Uploaded audio metadata did not match the initialized meeting.",
          });
          throw new ApiError(
            502,
            "STORAGE_METADATA_MISMATCH",
            "Uploaded audio metadata did not match the initialized meeting.",
          );
        }

        if (
          meeting.status === "created" &&
          meeting.fileSizeBytes === objectInfo.sizeBytes
        ) {
          res.json({ meeting });
          return;
        }

        const updatedMeeting = await repository.markUploadCompleted({
          meetingId: meeting.id,
          fileSizeBytes: objectInfo.sizeBytes,
          mimeType: objectInfo.mimeType ?? meeting.mimeType,
        });

        res.json({ meeting: updatedMeeting });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/meetings/:meetingId/upload/fail",
    validateRequest({
      params: meetingIdParamsSchema,
      body: uploadFailureInputSchema,
    }),
    async (_req, res, next) => {
      try {
        const params = res.locals.params as { meetingId: string };
        const body = res.locals.body as z.infer<typeof uploadFailureInputSchema>;
        const repository = dependencies.getMeetingRepository();
        const meeting = await repository.getMeetingById(params.meetingId);

        if (!meeting) {
          throw ApiError.meetingNotFound();
        }

        await tryRemoveObject(dependencies, meeting.storageBucket, meeting.storagePath);
        const updatedMeeting = await repository.markMeetingFailed({
          meetingId: meeting.id,
          errorCode: safeUploadFailureCode(body.errorCode),
          errorMessage: body.message,
        });

        res.json({ meeting: updatedMeeting });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/meetings/live",
    validateRequest({ body: startLiveMeetingInputSchema }),
    async (_req, res, next) => {
      try {
        const body = res.locals.body as z.infer<typeof startLiveMeetingInputSchema>;
        const meeting = await dependencies.getMeetingRepository().createLiveMeeting({
          ...body,
          knownParticipants: normalizeList(body.knownParticipants, 30, 120),
          technicalTerms: normalizeList(body.technicalTerms, 60, 120),
        });

        res.status(201).json({ meeting });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/meetings",
    validateRequest({ query: meetingListQuerySchema }),
    async (_req, res, next) => {
      try {
        const query = res.locals.query as z.infer<typeof meetingListQuerySchema>;
        const meetings = await dependencies.getMeetingRepository().listMeetings(query);
        res.json(meetings);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/meetings/:meetingId/transcribe",
    validateRequest({ params: meetingIdParamsSchema }),
    async (_req, res, next) => {
      try {
        const params = res.locals.params as { meetingId: string };
        const repository = dependencies.getMeetingRepository();
        const storage = dependencies.getStorageService();
        const transcriptionService = dependencies.getTranscriptionService();
        const detail = await repository.getMeetingDetail(params.meetingId);

        if (!detail) {
          throw ApiError.meetingNotFound();
        }

        const { meeting } = detail;

        if (meeting.status === "transcribed" && detail.transcriptSegments.length > 0) {
          res.json(
            buildTranscribeMeetingResponse({
              detail,
              alreadyTranscribed: true,
            }),
          );
          return;
        }

        if (meeting.status === "transcribing") {
          throw ApiError.conflict(
            "TRANSCRIPTION_ALREADY_RUNNING",
            "This meeting is already being transcribed.",
          );
        }

        if (meeting.status === "uploading") {
          throw ApiError.conflict(
            "UPLOAD_NOT_COMPLETE",
            "The recording upload has not been verified yet.",
          );
        }

        if (
          meeting.sourceType !== "upload" ||
          !meeting.storageBucket ||
          !meeting.storagePath
        ) {
          throw ApiError.audioStorageMissing();
        }

        if (!["created", "failed"].includes(meeting.status)) {
          throw ApiError.conflict(
            "INVALID_MEETING_STATE",
            "This meeting is not ready for uploaded-audio transcription.",
          );
        }

        if (!transcriptionService.isConfigured()) {
          throw ApiError.deepgramNotConfigured();
        }

        const processingStartedAt = new Date().toISOString();
        const processingStartedMs = Date.now();
        await repository.markTranscriptionStarted(meeting.id);

        try {
          let audioUrl: string;
          try {
            audioUrl = await storage.createSignedDownloadUrl({
              bucket: meeting.storageBucket,
              objectPath: meeting.storagePath,
            });
          } catch {
            throw ApiError.signedAudioUrlFailed();
          }

          const transcription = await transcriptionService.transcribeRecording({
            audioUrl,
            language: meeting.language,
            knownParticipants: meeting.knownParticipants,
            technicalTerms: meeting.technicalTerms,
          });
          const response = await repository.replaceMeetingTranscription({
            meetingId: meeting.id,
            transcription,
            processingStartedAt,
            processingTimeMs: Date.now() - processingStartedMs,
          });

          res.json(response);
        } catch (error) {
          try {
            await repository.markMeetingFailed({
              meetingId: meeting.id,
              errorCode:
                error instanceof ApiError
                  ? error.code
                  : "TRANSCRIPTION_PROVIDER_FAILED",
              errorMessage:
                error instanceof ApiError
                  ? error.message
                  : "Uploaded-audio transcription failed.",
            });
          } catch (markFailedError) {
            logger.warn(
              { err: markFailedError, meetingId: meeting.id },
              "could not mark transcription failure",
            );
          }

          throw error instanceof ApiError
            ? error
            : ApiError.transcriptionProviderFailed();
        }
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/meetings/:meetingId/analyze",
    validateRequest({ params: meetingIdParamsSchema }),
    async (_req, res, next) => {
      try {
        const params = res.locals.params as { meetingId: string };
        const repository = dependencies.getMeetingRepository();
        const analysisService = dependencies.getMeetingAnalysisService();
        const detail = await repository.getMeetingDetail(params.meetingId);

        if (!detail) {
          throw ApiError.meetingNotFound();
        }

        const existingAnalysis = await repository.getPersistedMeetingAnalysis(
          params.meetingId,
          { alreadyAnalysed: true },
        );

        if (existingAnalysis) {
          res.json(existingAnalysis);
          return;
        }

        if (detail.transcriptSegments.length === 0) {
          throw ApiError.conflict(
            "INVALID_MEETING_STATE",
            "Gemini analysis requires persisted transcript segments.",
          );
        }

        const canRetryFailedAnalysis =
          detail.meeting.status === "failed" &&
          detail.meeting.errorCode != null &&
          analysisFailureCodes.has(detail.meeting.errorCode);

        if (
          !["transcribed", "analysing", "completed"].includes(detail.meeting.status) &&
          !canRetryFailedAnalysis
        ) {
          throw ApiError.conflict(
            "INVALID_MEETING_STATE",
            "This meeting is not ready for Gemini analysis.",
          );
        }

        if (!analysisService.isConfigured()) {
          throw ApiError.geminiNotConfigured();
        }

        await repository.markAnalysisStarted(detail.meeting.id);

        try {
          const analysisResult = await analysisService.analyseMeeting({
            meeting: detail.meeting,
            speakers: detail.speakers,
            segments: detail.transcriptSegments,
          });
          const response = await repository.persistMeetingAnalysis({
            meetingId: detail.meeting.id,
            result: analysisResult,
          });

          res.json(response);
        } catch (error) {
          try {
            await repository.markMeetingFailed({
              meetingId: detail.meeting.id,
              errorCode:
                error instanceof ApiError
                  ? error.code
                  : "MEETING_ANALYSIS_OUTPUT_INVALID",
              errorMessage:
                error instanceof ApiError
                  ? error.message
                  : "Gemini meeting analysis failed.",
            });
          } catch (markFailedError) {
            logger.warn(
              { err: markFailedError, meetingId: detail.meeting.id },
              "could not mark analysis failure",
            );
          }

          throw error instanceof ApiError ? error : ApiError.geminiRequestFailed();
        }
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/meetings/:meetingId",
    validateRequest({ params: meetingIdParamsSchema }),
    async (_req, res, next) => {
      try {
        const params = res.locals.params as { meetingId: string };
        const detail = await dependencies
          .getMeetingRepository()
          .getMeetingDetail(params.meetingId);

        if (!detail) {
          throw ApiError.meetingNotFound();
        }

        res.json(detail);
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/meetings/:meetingId/speakers/:speakerId",
    validateRequest({
      params: speakerParamsSchema,
      body: renameSpeakerInputSchema,
    }),
    async (_req, res, next) => {
      try {
        const params = res.locals.params as { meetingId: string; speakerId: string };
        const body = res.locals.body as z.infer<typeof renameSpeakerInputSchema>;
        const speaker = await dependencies.getMeetingRepository().updateSpeakerName({
          meetingId: params.meetingId,
          speakerId: params.speakerId,
          displayName: body.displayName,
        });

        res.json({ speaker });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
