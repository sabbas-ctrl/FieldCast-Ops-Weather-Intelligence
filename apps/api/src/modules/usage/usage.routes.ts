import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler } from "../../utils/http.js";
import { listUsageEvents, usageSummary } from "./usage.service.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/events",
  requirePermission("provider.view_usage"),
  asyncHandler(async (request, response) => {
    response.json(listUsageEvents(request.auth!.workspaceId));
  })
);

router.get(
  "/summary",
  requirePermission("provider.view_usage"),
  asyncHandler(async (request, response) => {
    response.json(usageSummary(request.auth!.workspaceId));
  })
);

export const usageRouter = router;
