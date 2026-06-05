import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler } from "../../utils/http.js";
import {
  apiKeySchema,
  connectProvider,
  disconnectProvider,
  getProviderStatus,
  syncProviderUsage
} from "./provider.service.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/status",
  requirePermission("provider.view_usage"),
  asyncHandler(async (request, response) => {
    response.json(await getProviderStatus(request.auth!.workspaceId));
  })
);

router.get(
  "/usage",
  requirePermission("provider.view_usage"),
  asyncHandler(async (request, response) => {
    response.json((await getProviderStatus(request.auth!.workspaceId)).usage);
  })
);

router.post(
  "/connect",
  requirePermission("provider.connect"),
  asyncHandler(async (request, response) => {
    const body = z.object({ apiKey: apiKeySchema }).strict().parse(request.body);
    response.status(201).json(await connectProvider(request.auth!.workspaceId, request.auth!.memberId, body.apiKey));
  })
);

router.post(
  "/usage/sync",
  requirePermission("provider.view_usage"),
  asyncHandler(async (request, response) => {
    response.json(await syncProviderUsage(request.auth!.workspaceId, request.auth!.memberId));
  })
);

router.put(
  "/key",
  requirePermission("provider.replace_key"),
  asyncHandler(async (request, response) => {
    const body = z.object({ apiKey: apiKeySchema }).strict().parse(request.body);
    response.json(await connectProvider(request.auth!.workspaceId, request.auth!.memberId, body.apiKey));
  })
);

router.delete(
  "/disconnect",
  requirePermission("provider.disconnect"),
  asyncHandler(async (request, response) => {
    response.json(await disconnectProvider(request.auth!.workspaceId, request.auth!.memberId));
  })
);

export const providerRouter = router;
