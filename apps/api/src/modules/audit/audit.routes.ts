import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler } from "../../utils/http.js";
import { store } from "../demo/store.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  requirePermission("audit.view"),
  asyncHandler(async (request, response) => {
    response.json(
      store.auditLogs
        .filter((log) => log.workspaceId === request.auth!.workspaceId)
        .slice(0, 100)
        .map((log) => ({
          ...log,
          actor: log.actorMemberId ? store.members.find((member) => member.id === log.actorMemberId) ?? null : null
        }))
    );
  })
);

export const auditRouter = router;
