import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler } from "../../utils/http.js";
import { prisma } from "../../infrastructure/prisma/client.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  requirePermission("audit.view"),
  asyncHandler(async (request, response) => {
    response.json(
      await prisma.auditLog.findMany({
        where: { workspaceId: request.auth!.workspaceId },
        include: { actor: true },
        orderBy: { createdAt: "desc" },
        take: 100
      })
    );
  })
);

export const auditRouter = router;
