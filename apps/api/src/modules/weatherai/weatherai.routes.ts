import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler, routeParam } from "../../utils/http.js";
import {
  callSmsEndpoint,
  callWeatherEndpoint,
  createWebhook,
  deleteWebhook,
  getSmsEndpoint,
  getTreeHistory,
  getTreeQuota,
  getWeatherAiCapabilities,
  listWebhooks,
  lookupIp,
  proxyTreeAnalysis
} from "./weatherai.service.js";

const router = Router();

const coordinateQuery = z.object({
  siteId: z.string().optional(),
  lat: z.coerce.number().optional(),
  lon: z.coerce.number().optional(),
  days: z.coerce.number().min(1).max(16).optional(),
  ai: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  units: z.enum(["metric", "imperial"]).optional(),
  lang: z.string().min(2).max(8).optional()
});

router.use(requireAuth);

router.get(
  "/capabilities",
  asyncHandler(async (request, response) => {
    response.json(await getWeatherAiCapabilities(request.auth!.workspaceId, request.auth!.memberId));
  })
);

router.get(
  "/weather",
  requirePermission("monitoring.run"),
  asyncHandler(async (request, response) => {
    const query = coordinateQuery.parse(request.query);
    response.json(
      await callWeatherEndpoint(request.auth!.workspaceId, request.auth!.memberId, {
        service: "weather",
        ...query
      })
    );
  })
);

router.get(
  "/forecast",
  requirePermission("monitoring.run"),
  asyncHandler(async (request, response) => {
    const query = coordinateQuery.parse(request.query);
    response.json(
      await callWeatherEndpoint(request.auth!.workspaceId, request.auth!.memberId, {
        service: "forecast",
        ...query
      })
    );
  })
);

router.get(
  "/weather-geo",
  requirePermission("monitoring.run"),
  asyncHandler(async (request, response) => {
    const query = coordinateQuery.extend({ ip: z.string().optional() }).parse(request.query);
    response.json(
      await callWeatherEndpoint(request.auth!.workspaceId, request.auth!.memberId, {
        service: "weatherGeo",
        ...query
      })
    );
  })
);

router.get(
  "/ip-lookup",
  requirePermission("monitoring.run"),
  asyncHandler(async (request, response) => {
    const query = z.object({ ip: z.string().default("auto") }).parse(request.query);
    response.json(await lookupIp(request.auth!.workspaceId, request.auth!.memberId, query.ip));
  })
);

router.get(
  "/webhooks",
  requirePermission("provider.connect"),
  asyncHandler(async (request, response) => {
    response.json(await listWebhooks(request.auth!.workspaceId, request.auth!.memberId));
  })
);

router.post(
  "/webhooks",
  requirePermission("provider.connect"),
  asyncHandler(async (request, response) => {
    const body = z
      .object({
        url: z.string().url(),
        siteId: z.string().optional(),
        lat: z.number().optional(),
        lon: z.number().optional(),
        triggers: z.array(z.enum(["rain", "extreme_wind", "frost", "drought"])).min(1),
        timezone: z.string().optional()
      })
      .parse(request.body);
    response.status(201).json(await createWebhook(request.auth!.workspaceId, request.auth!.memberId, body));
  })
);

router.delete(
  "/webhooks/:webhookId",
  requirePermission("provider.connect"),
  asyncHandler(async (request, response) => {
    response.json(
      await deleteWebhook(request.auth!.workspaceId, request.auth!.memberId, routeParam(request.params.webhookId, "webhookId"))
    );
  })
);

router.post(
  "/sms/send",
  requirePermission("provider.connect"),
  asyncHandler(async (request, response) => {
    const body = z
      .object({
        to: z.string().min(6),
        message: z.string().min(1).max(480),
        type: z.string().optional(),
        pilotTag: z.string().optional()
      })
      .parse(request.body);
    response.json(
      await callSmsEndpoint(request.auth!.workspaceId, request.auth!.memberId, {
        path: "/v1/sms/send",
        body,
        feature: "weatherai_sms_send"
      })
    );
  })
);

router.post(
  "/sms/alert",
  requirePermission("provider.connect"),
  asyncHandler(async (request, response) => {
    const body = z
      .object({
        to: z.string().min(6),
        alertType: z.enum(["rain", "frost", "extreme_wind", "drought"]),
        data: z.record(z.unknown()).optional()
      })
      .parse(request.body);
    response.json(
      await callSmsEndpoint(request.auth!.workspaceId, request.auth!.memberId, {
        path: "/v1/sms/alert",
        body,
        feature: "weatherai_sms_alert"
      })
    );
  })
);

router.post(
  "/sms/bomet/register",
  requirePermission("provider.connect"),
  asyncHandler(async (request, response) => {
    const body = z
      .object({
        phone: z.string().min(6),
        name: z.string().min(1),
        location: z.string().optional(),
        cropType: z.string().optional()
      })
      .parse(request.body);
    response.json(
      await callSmsEndpoint(request.auth!.workspaceId, request.auth!.memberId, {
        path: "/v1/sms/bomet/register",
        body,
        feature: "weatherai_sms_bomet_register"
      })
    );
  })
);

router.get(
  "/sms/stats",
  requirePermission("provider.connect"),
  asyncHandler(async (request, response) => {
    response.json(await getSmsEndpoint(request.auth!.workspaceId, request.auth!.memberId, "/v1/sms/stats"));
  })
);

router.get(
  "/sms/health",
  requirePermission("provider.connect"),
  asyncHandler(async (request, response) => {
    response.json(await getSmsEndpoint(request.auth!.workspaceId, request.auth!.memberId, "/v1/sms/health"));
  })
);

router.get(
  "/trees/history",
  requirePermission("monitoring.run"),
  asyncHandler(async (request, response) => {
    const query = z.object({ limit: z.coerce.number().min(1).max(100).optional(), cursor: z.string().optional() }).parse(request.query);
    response.json(await getTreeHistory(request.auth!.workspaceId, request.auth!.memberId, query.limit, query.cursor));
  })
);

router.get(
  "/trees/quota",
  requirePermission("monitoring.run"),
  asyncHandler(async (request, response) => {
    response.json(await getTreeQuota(request.auth!.workspaceId, request.auth!.memberId));
  })
);

router.post(
  "/trees/analyze",
  requirePermission("monitoring.run"),
  asyncHandler(async (request, response) => {
    await proxyTreeAnalysis(request.auth!.workspaceId, request.auth!.memberId, request, response, "/v1/trees/analyze");
  })
);

router.post(
  "/forestry/count-trees",
  requirePermission("monitoring.run"),
  asyncHandler(async (request, response) => {
    await proxyTreeAnalysis(request.auth!.workspaceId, request.auth!.memberId, request, response, "/v1/forestry/count-trees");
  })
);

export const weatherAiRouter = router;
