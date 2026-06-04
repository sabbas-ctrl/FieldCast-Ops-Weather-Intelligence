import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler, routeParam } from "../../utils/http.js";
import { acknowledgeIncident, getIncident, listIncidents, resolveIncident } from "./incidents.service.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  requirePermission("incidents.view"),
  asyncHandler(async (request, response) => {
    const query = z
      .object({
        siteId: z.string().optional(),
        status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"]).optional(),
        severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional()
      })
      .parse(request.query);
    response.json(listIncidents(request.auth!.workspaceId, query));
  })
);

router.get(
  "/:incidentId",
  requirePermission("incidents.view"),
  asyncHandler(async (request, response) => {
    response.json(getIncident(request.auth!.workspaceId, routeParam(request.params.incidentId, "incidentId")));
  })
);

router.patch(
  "/:incidentId/acknowledge",
  requirePermission("incidents.acknowledge"),
  asyncHandler(async (request, response) => {
    response.json(acknowledgeIncident(request.auth!.workspaceId, request.auth!.memberId, routeParam(request.params.incidentId, "incidentId")));
  })
);

router.patch(
  "/:incidentId/resolve",
  requirePermission("incidents.resolve"),
  asyncHandler(async (request, response) => {
    response.json(resolveIncident(request.auth!.workspaceId, request.auth!.memberId, routeParam(request.params.incidentId, "incidentId")));
  })
);

export const incidentRouter = router;
