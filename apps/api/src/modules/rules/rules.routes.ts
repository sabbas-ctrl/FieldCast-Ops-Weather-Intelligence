import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler, routeParam } from "../../utils/http.js";
import { createRule, deleteRule, listRules, ruleInputSchema, updateRule } from "./rules.service.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/sites/:siteId/rules",
  requirePermission("rules.view"),
  asyncHandler(async (request, response) => {
    response.json(await listRules(request.auth!.workspaceId, routeParam(request.params.siteId, "siteId")));
  })
);

router.post(
  "/sites/:siteId/rules",
  requirePermission("rules.create"),
  asyncHandler(async (request, response) => {
    const body = ruleInputSchema.parse(request.body);
    response.status(201).json(await createRule(request.auth!.workspaceId, request.auth!.memberId, routeParam(request.params.siteId, "siteId"), body));
  })
);

router.patch(
  "/rules/:ruleId",
  requirePermission("rules.update"),
  asyncHandler(async (request, response) => {
    const body = ruleInputSchema.partial().parse(request.body);
    response.json(await updateRule(request.auth!.workspaceId, request.auth!.memberId, routeParam(request.params.ruleId, "ruleId"), body));
  })
);

router.delete(
  "/rules/:ruleId",
  requirePermission("rules.delete"),
  asyncHandler(async (request, response) => {
    await deleteRule(request.auth!.workspaceId, request.auth!.memberId, routeParam(request.params.ruleId, "ruleId"));
    response.status(204).send();
  })
);

export const ruleRouter = router;
