import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler, routeParam } from "../../utils/http.js";
import { analyseWorkingWindows, getCurrentConditions, getForecast } from "./forecasts.service.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/:siteId/current",
  requirePermission("monitoring.run"),
  asyncHandler(async (request, response) => {
    response.json(await getCurrentConditions(request.auth!.workspaceId, request.auth!.memberId, routeParam(request.params.siteId, "siteId")));
  })
);

router.get(
  "/:siteId/forecast",
  requirePermission("monitoring.run"),
  asyncHandler(async (request, response) => {
    const query = z.object({ days: z.coerce.number().min(1).max(16).default(2) }).strict().parse(request.query);
    response.json(await getForecast(request.auth!.workspaceId, request.auth!.memberId, routeParam(request.params.siteId, "siteId"), query.days));
  })
);

router.post(
  "/:siteId/analyse-working-windows",
  requirePermission("monitoring.run"),
  asyncHandler(async (request, response) => {
    const body = z.object({ days: z.number().min(1).max(16).default(2) }).strict().parse(request.body ?? {});
    response.json(await analyseWorkingWindows(request.auth!.workspaceId, request.auth!.memberId, routeParam(request.params.siteId, "siteId"), body.days));
  })
);

router.post(
  "/:siteId/generate-ai-brief",
  requirePermission("monitoring.run"),
  asyncHandler(async (request, response) => {
    const result = await analyseWorkingWindows(request.auth!.workspaceId, request.auth!.memberId, routeParam(request.params.siteId, "siteId"), 2);
    response.json({
      site: result.site,
      aiEnabled: true,
      brief:
        result.hazardWindows.length > 0
          ? `High-risk weather windows were detected. Prioritize ${result.workingWindows[0]?.start ?? "the next low-risk slot"} and review open incidents before dispatch.`
          : "No high-risk weather windows were detected in the next two days. The earliest low-risk working window is suitable for routine operations.",
      generatedAt: new Date().toISOString()
    });
  })
);

export const forecastRouter = router;
