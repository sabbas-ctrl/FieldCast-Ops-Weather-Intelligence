import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler, routeParam } from "../../utils/http.js";
import { createSite, deleteSite, getSite, listSites, siteInputSchema, updateSite } from "./sites.service.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  requirePermission("sites.view"),
  asyncHandler(async (request, response) => {
    response.json(listSites(request.auth!.workspaceId));
  })
);

router.post(
  "/",
  requirePermission("sites.create"),
  asyncHandler(async (request, response) => {
    const body = siteInputSchema.parse(request.body);
    response.status(201).json(createSite(request.auth!.workspaceId, request.auth!.memberId, body));
  })
);

router.get(
  "/:siteId",
  requirePermission("sites.view"),
  asyncHandler(async (request, response) => {
    response.json(getSite(request.auth!.workspaceId, routeParam(request.params.siteId, "siteId")));
  })
);

router.patch(
  "/:siteId",
  requirePermission("sites.update"),
  asyncHandler(async (request, response) => {
    const body = siteInputSchema.partial().parse(request.body);
    response.json(updateSite(request.auth!.workspaceId, request.auth!.memberId, routeParam(request.params.siteId, "siteId"), body));
  })
);

router.delete(
  "/:siteId",
  requirePermission("sites.delete"),
  asyncHandler(async (request, response) => {
    deleteSite(request.auth!.workspaceId, request.auth!.memberId, routeParam(request.params.siteId, "siteId"));
    response.status(204).send();
  })
);

export const siteRouter = router;
