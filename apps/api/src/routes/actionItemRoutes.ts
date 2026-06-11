import { Router } from "express";
import { z } from "zod";
import { updateActionItemInputSchema, uuidSchema } from "@scribeflow/shared";
import type { ApiDependencies } from "../dependencies.js";
import { validateRequest } from "../middleware/validateRequest.js";

const actionItemParamsSchema = z.object({
  actionItemId: uuidSchema,
});

export function createActionItemRoutes(dependencies: ApiDependencies) {
  const router = Router();

  router.patch(
    "/action-items/:actionItemId",
    validateRequest({
      params: actionItemParamsSchema,
      body: updateActionItemInputSchema,
    }),
    async (_req, res, next) => {
      try {
        const params = res.locals.params as { actionItemId: string };
        const body = res.locals.body as { status: "open" | "completed" };
        const actionItem = await dependencies
          .getMeetingRepository()
          .updateActionItemStatus({
            actionItemId: params.actionItemId,
            status: body.status,
          });

        res.json({ actionItem });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
