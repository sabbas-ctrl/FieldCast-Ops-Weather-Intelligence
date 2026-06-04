import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler, routeParam } from "../../utils/http.js";
import {
  currentWorkspace,
  inviteMember,
  listMembers,
  memberRoleSchema,
  setWeatherUsageAccess,
  suspendMember
} from "./workspaces.service.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/current",
  asyncHandler(async (request, response) => {
    response.json(currentWorkspace(request.auth!.workspaceId));
  })
);

router.get(
  "/:workspaceId/members",
  requirePermission("members.view"),
  asyncHandler(async (request, response) => {
    response.json(listMembers(request.auth!.workspaceId, routeParam(request.params.workspaceId, "workspaceId")));
  })
);

router.post(
  "/:workspaceId/invitations",
  requirePermission("members.invite"),
  asyncHandler(async (request, response) => {
    const body = z
      .object({
        email: z.string().email(),
        role: memberRoleSchema
      })
      .parse(request.body);
    response.status(201).json(inviteMember(request.auth!.workspaceId, request.auth!.memberId, routeParam(request.params.workspaceId, "workspaceId"), body));
  })
);

router.patch(
  "/:workspaceId/members/:memberId/usage-access",
  requirePermission("members.revoke"),
  asyncHandler(async (request, response) => {
    const body = z.object({ enabled: z.boolean() }).parse(request.body);
    response.json(
      setWeatherUsageAccess(
        request.auth!.workspaceId,
        request.auth!.memberId,
        routeParam(request.params.workspaceId, "workspaceId"),
        routeParam(request.params.memberId, "memberId"),
        body.enabled
      )
    );
  })
);

router.patch(
  "/:workspaceId/members/:memberId/suspend",
  requirePermission("members.revoke"),
  asyncHandler(async (request, response) => {
    response.json(
      suspendMember(
        request.auth!.workspaceId,
        request.auth!.memberId,
        routeParam(request.params.workspaceId, "workspaceId"),
        routeParam(request.params.memberId, "memberId")
      )
    );
  })
);

export const workspaceRouter = router;
