import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import { decryptApiKey } from "../../infrastructure/encryption/apiKeyCrypto.js";
import { prisma } from "../../infrastructure/prisma/client.js";
import { createUsageEvent } from "../db/helpers.js";
import { fetchProviderUsage, resolveCapabilities } from "../provider/weatherai.adapter.js";
import { HttpError } from "../../utils/http.js";
import type { CapabilityTier, Site, Workspace, WorkspaceMember } from "@prisma/client";

type ServiceKey =
  | "weather"
  | "forecast"
  | "weatherGeo"
  | "ipLookup"
  | "usage"
  | "webhooks"
  | "sms"
  | "trees";

type WeatherAiAccess = {
  apiKey: string;
  workspace: Workspace;
  member: WorkspaceMember;
  capabilityTier: CapabilityTier;
  requestLimit: number;
  aiRequestLimit: number;
  forecastDays: number;
  webhooksEnabled: boolean;
  smsEligible: boolean;
  smsApproved: boolean;
  source: "platform" | "organisation";
};

const planRank: Record<CapabilityTier, number> = {
  UNKNOWN: 0,
  FREE: 1,
  PRO: 2,
  SCALE: 3
};

const serviceCatalog: Record<
  ServiceKey,
  {
    label: string;
    path: string;
    minimumPlan: CapabilityTier;
    requiresSmsApproval?: boolean;
  }
> = {
  weather: {
    label: "Current Weather + Forecast",
    path: "/v1/weather",
    minimumPlan: "PRO"
  },
  forecast: {
    label: "Forecast",
    path: "/v1/forecast",
    minimumPlan: "FREE"
  },
  weatherGeo: {
    label: "Weather Geo Detection",
    path: "/v1/weather-geo",
    minimumPlan: "FREE"
  },
  ipLookup: {
    label: "IP Geo Lookup",
    path: "/v1/ip-lookup",
    minimumPlan: "FREE"
  },
  usage: {
    label: "Usage",
    path: "/v1/usage",
    minimumPlan: "FREE"
  },
  webhooks: {
    label: "Webhooks",
    path: "/v1/webhooks",
    minimumPlan: "PRO"
  },
  sms: {
    label: "SMS / USSD",
    path: "/v1/sms",
    minimumPlan: "SCALE",
    requiresSmsApproval: true
  },
  trees: {
    label: "Trees / Forestry",
    path: "/v1/trees",
    minimumPlan: "FREE"
  }
};

const treeAnalysisLimitByPlan: Record<CapabilityTier, number | null> = {
  UNKNOWN: 0,
  FREE: 5,
  PRO: 100,
  SCALE: null
};

function isConfiguredApiKey(apiKey: string | undefined): apiKey is string {
  if (!apiKey) {
    return false;
  }

  const lower = apiKey.trim().toLowerCase();
  return lower.startsWith("wai_") && !lower.startsWith("wai_demo") && !lower.includes("replace") && !lower.includes("example");
}

function entitlementFor(access: Pick<WeatherAiAccess, "capabilityTier" | "forecastDays" | "webhooksEnabled" | "smsEligible" | "smsApproved" | "requestLimit" | "aiRequestLimit">) {
  const webhookLimit = access.webhooksEnabled ? (access.capabilityTier === "SCALE" ? 50 : 10) : 0;
  return {
    plan: access.capabilityTier,
    requestLimit: access.requestLimit,
    aiRequestLimit: access.aiRequestLimit,
    forecastDays: access.forecastDays,
    webhooksEnabled: access.webhooksEnabled,
    webhookLimit,
    smsEligible: access.smsEligible,
    smsApproved: access.smsApproved,
    treeAnalysisLimit: treeAnalysisLimitByPlan[access.capabilityTier],
    teamSeats: access.capabilityTier === "SCALE" ? 20 : access.capabilityTier === "PRO" ? 5 : 1
  };
}

function serviceAvailability(access: WeatherAiAccess) {
  const entitlement = entitlementFor(access);
  return Object.entries(serviceCatalog).map(([key, service]) => {
    const planAllowed = planRank[access.capabilityTier] >= planRank[service.minimumPlan];
    const smsAllowed = !service.requiresSmsApproval || (access.smsEligible && access.smsApproved);
    return {
      key,
      label: service.label,
      providerPath: service.path,
      minimumPlan: service.minimumPlan,
      enabled: planAllowed && smsAllowed,
      reason: !planAllowed
        ? `Requires ${service.minimumPlan} plan`
        : !smsAllowed
          ? access.smsEligible
            ? "SMS access is awaiting approval"
            : "Requires Scale plan with SMS approval"
          : null,
      entitlement
    };
  });
}

async function resolveWeatherAiAccess(workspaceId: string, memberId: string): Promise<WeatherAiAccess> {
  const member = await prisma.workspaceMember.findUnique({
    where: { id: memberId },
    include: { workspace: true }
  });
  if (!member || member.workspaceId !== workspaceId) {
    throw new HttpError(403, "Workspace access denied");
  }
  if (!member.weatherUsageEnabled) {
    throw new HttpError(403, "Weather usage is disabled for this member");
  }

  if (member.workspace.type === "PERSONAL" || member.workspace.providerMode === "PLATFORM_MANAGED") {
    const apiKey = env.WEATHERAI_PLATFORM_API_KEY?.trim();
    if (!isConfiguredApiKey(apiKey)) {
      throw new HttpError(503, "WeatherAI platform key is not configured for personal workspaces.");
    }

    return {
      apiKey,
      workspace: member.workspace,
      member,
      capabilityTier: "FREE",
      requestLimit: 1000,
      aiRequestLimit: 200,
      forecastDays: 7,
      webhooksEnabled: false,
      smsEligible: false,
      smsApproved: false,
      source: "platform"
    };
  }

  const connection = await prisma.providerConnection.findFirst({
    where: { workspaceId, connectionStatus: "ACTIVE" }
  });
  if (!connection) {
    throw new HttpError(409, "WeatherAI is not connected for this organisation. Contact your IT administrator.");
  }

  const apiKey =
    connection.encryptedApiKey === "demo-encrypted-key"
      ? undefined
      : decryptApiKey(connection.encryptedApiKey);
  if (!isConfiguredApiKey(apiKey)) {
    throw new HttpError(503, "A valid organisation WeatherAI key is required.");
  }

  return {
    apiKey,
    workspace: member.workspace,
    member,
    capabilityTier: connection.capabilityTier,
    requestLimit: connection.requestLimit ?? 0,
    aiRequestLimit: connection.aiRequestLimit ?? 0,
    forecastDays: connection.forecastDays ?? 7,
    webhooksEnabled: connection.webhooksEnabled,
    smsEligible: connection.smsEligible,
    smsApproved: connection.smsApproved,
    source: "organisation"
  };
}

function assertService(access: WeatherAiAccess, service: ServiceKey) {
  const serviceMeta = serviceCatalog[service];
  if (planRank[access.capabilityTier] < planRank[serviceMeta.minimumPlan]) {
    throw new HttpError(403, `${serviceMeta.label} requires the ${serviceMeta.minimumPlan} plan.`);
  }

  if (serviceMeta.requiresSmsApproval && (!access.smsEligible || !access.smsApproved)) {
    throw new HttpError(403, "SMS/USSD requires Scale plan and WeatherAI SMS approval.");
  }
}

async function getSiteForWeather(workspaceId: string, siteId: string | undefined) {
  if (!siteId) {
    return null;
  }

  const site = await prisma.site.findFirst({ where: { workspaceId, id: siteId } });
  if (!site) {
    throw new HttpError(404, "Site not found");
  }
  return site;
}

function setCoordinateParams(url: URL, site: Site | null, lat: number | undefined, lon: number | undefined) {
  const latitude = site?.latitude ?? lat;
  const longitude = site?.longitude ?? lon;
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    throw new HttpError(400, "Provide a siteId or lat/lon coordinates.");
  }

  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
}

async function providerJson(access: WeatherAiAccess, path: string, init: RequestInit = {}) {
  const response = await fetch(`${env.WEATHERAI_BASE_URL.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${access.apiKey}`,
      "x-api-key": access.apiKey,
      ...init.headers
    }
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `WeatherAI request failed with provider status ${response.status}`;
    throw new HttpError(response.status === 401 ? 502 : response.status, message, payload);
  }

  return payload;
}

async function recordWeatherAiUsage(input: {
  workspaceId: string;
  memberId: string;
  siteId?: string;
  endpoint: string;
  feature: string;
  aiEnabled?: boolean;
  responseStatus: number;
  started: number;
}) {
  await createUsageEvent({
    workspaceId: input.workspaceId,
    memberId: input.memberId,
    siteId: input.siteId,
    endpoint: input.endpoint,
    feature: input.feature,
    aiEnabled: Boolean(input.aiEnabled),
    servedFromCache: false,
    providerCalled: true,
    responseStatus: input.responseStatus,
    durationMs: Date.now() - input.started
  });
}

export async function getWeatherAiCapabilities(workspaceId: string, memberId: string) {
  const access = await resolveWeatherAiAccess(workspaceId, memberId);
  let usage = null;

  if (access.source === "organisation") {
    usage = await prisma.providerUsageSnapshot.findFirst({
      where: { workspaceId },
      orderBy: { capturedAt: "desc" }
    });
  } else {
    const providerUsage = await fetchProviderUsage(access.apiKey);
    usage = {
      requestsUsed: providerUsage.requestsUsed,
      requestLimit: access.requestLimit,
      aiRequestsUsed: providerUsage.aiRequestsUsed,
      aiRequestLimit: access.aiRequestLimit,
      periodStart: providerUsage.periodStart,
      periodEnd: providerUsage.periodEnd,
      capturedAt: new Date().toISOString()
    };
  }

  return {
    mode: access.workspace.providerMode,
    source: access.source,
    capabilities: entitlementFor(access),
    services: serviceAvailability(access),
    usage
  };
}

export async function syncWeatherAiCapabilities(workspaceId: string, memberId: string) {
  const access = await resolveWeatherAiAccess(workspaceId, memberId);
  const providerUsage = await fetchProviderUsage(access.apiKey);
  const capabilities = access.source === "platform" ? entitlementFor(access) : resolveCapabilities(providerUsage);

  return {
    source: access.source,
    providerUsage,
    capabilities
  };
}

export async function callWeatherEndpoint(
  workspaceId: string,
  memberId: string,
  input: {
    service: "weather" | "forecast" | "weatherGeo";
    siteId?: string;
    lat?: number;
    lon?: number;
    ip?: string;
    days?: number;
    ai?: boolean;
    units?: "metric" | "imperial";
    lang?: string;
  }
) {
  const started = Date.now();
  const access = await resolveWeatherAiAccess(workspaceId, memberId);
  assertService(access, input.service);
  const site = await getSiteForWeather(workspaceId, input.siteId);
  const days = Math.max(1, Math.min(input.days ?? access.forecastDays, access.forecastDays));
  const path = serviceCatalog[input.service].path;
  const url = new URL(path, env.WEATHERAI_BASE_URL);

  if (input.service === "weatherGeo") {
    if (input.ip) {
      url.searchParams.set("ip", input.ip);
    }
    if (site || (typeof input.lat === "number" && typeof input.lon === "number")) {
      setCoordinateParams(url, site, input.lat, input.lon);
    }
  } else {
    setCoordinateParams(url, site, input.lat, input.lon);
  }

  url.searchParams.set("days", String(days));
  url.searchParams.set("ai", String(Boolean(input.ai)));
  url.searchParams.set("units", input.units ?? "metric");
  if (input.lang) {
    url.searchParams.set("lang", input.lang);
  }

  const payload = await providerJson(access, `${url.pathname}${url.search}`);
  await recordWeatherAiUsage({
    workspaceId,
    memberId,
    siteId: site?.id,
    endpoint: `/api/weatherai/${input.service}`,
    feature: `weatherai_${input.service}`,
    aiEnabled: input.ai,
    responseStatus: 200,
    started
  });

  return payload;
}

export async function lookupIp(workspaceId: string, memberId: string, ip = "auto") {
  const started = Date.now();
  const access = await resolveWeatherAiAccess(workspaceId, memberId);
  assertService(access, "ipLookup");
  const url = new URL(serviceCatalog.ipLookup.path, env.WEATHERAI_BASE_URL);
  url.searchParams.set("ip", ip);

  const payload = await providerJson(access, `${url.pathname}${url.search}`);
  await recordWeatherAiUsage({
    workspaceId,
    memberId,
    endpoint: "/api/weatherai/ip-lookup",
    feature: "weatherai_ip_lookup",
    responseStatus: 200,
    started
  });
  return payload;
}

export async function listWebhooks(workspaceId: string, memberId: string) {
  const started = Date.now();
  const access = await resolveWeatherAiAccess(workspaceId, memberId);
  assertService(access, "webhooks");
  const payload = await providerJson(access, serviceCatalog.webhooks.path);
  await recordWeatherAiUsage({
    workspaceId,
    memberId,
    endpoint: "/api/weatherai/webhooks",
    feature: "weatherai_webhooks_list",
    responseStatus: 200,
    started
  });
  return payload;
}

export async function createWebhook(
  workspaceId: string,
  memberId: string,
  input: { url: string; siteId?: string; lat?: number; lon?: number; triggers: string[]; timezone?: string }
) {
  const started = Date.now();
  const access = await resolveWeatherAiAccess(workspaceId, memberId);
  assertService(access, "webhooks");
  const site = await getSiteForWeather(workspaceId, input.siteId);
  const body = {
    url: input.url,
    lat: site?.latitude ?? input.lat,
    lon: site?.longitude ?? input.lon,
    triggers: input.triggers,
    timezone: input.timezone ?? site?.timezone ?? access.workspace.timezone
  };
  if (typeof body.lat !== "number" || typeof body.lon !== "number") {
    throw new HttpError(400, "Provide a siteId or lat/lon coordinates for the webhook.");
  }

  const payload = await providerJson(access, serviceCatalog.webhooks.path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  await recordWeatherAiUsage({
    workspaceId,
    memberId,
    siteId: site?.id,
    endpoint: "/api/weatherai/webhooks",
    feature: "weatherai_webhook_create",
    responseStatus: 201,
    started
  });
  return payload;
}

export async function deleteWebhook(workspaceId: string, memberId: string, webhookId: string) {
  const started = Date.now();
  const access = await resolveWeatherAiAccess(workspaceId, memberId);
  assertService(access, "webhooks");
  const payload = await providerJson(access, `${serviceCatalog.webhooks.path}/${encodeURIComponent(webhookId)}`, {
    method: "DELETE"
  });
  await recordWeatherAiUsage({
    workspaceId,
    memberId,
    endpoint: `/api/weatherai/webhooks/${webhookId}`,
    feature: "weatherai_webhook_delete",
    responseStatus: 200,
    started
  });
  return payload;
}

export async function callSmsEndpoint(
  workspaceId: string,
  memberId: string,
  input: { path: "/v1/sms/send" | "/v1/sms/alert" | "/v1/sms/bomet/register"; body: unknown; feature: string }
) {
  const started = Date.now();
  const access = await resolveWeatherAiAccess(workspaceId, memberId);
  assertService(access, "sms");
  const payload = await providerJson(access, input.path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.body)
  });
  await recordWeatherAiUsage({
    workspaceId,
    memberId,
    endpoint: `/api/weatherai${input.path.replace("/v1", "")}`,
    feature: input.feature,
    responseStatus: 200,
    started
  });
  return payload;
}

export async function getSmsEndpoint(workspaceId: string, memberId: string, path: "/v1/sms/stats" | "/v1/sms/health") {
  const started = Date.now();
  const access = await resolveWeatherAiAccess(workspaceId, memberId);
  assertService(access, "sms");
  const payload = await providerJson(access, path);
  await recordWeatherAiUsage({
    workspaceId,
    memberId,
    endpoint: `/api/weatherai${path.replace("/v1", "")}`,
    feature: path.endsWith("stats") ? "weatherai_sms_stats" : "weatherai_sms_health",
    responseStatus: 200,
    started
  });
  return payload;
}

export async function getTreeHistory(workspaceId: string, memberId: string, limit?: number, cursor?: string) {
  const started = Date.now();
  const access = await resolveWeatherAiAccess(workspaceId, memberId);
  assertService(access, "trees");
  const url = new URL("/v1/trees/history", env.WEATHERAI_BASE_URL);
  if (limit) {
    url.searchParams.set("limit", String(limit));
  }
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  const payload = await providerJson(access, `${url.pathname}${url.search}`);
  await recordWeatherAiUsage({
    workspaceId,
    memberId,
    endpoint: "/api/weatherai/trees/history",
    feature: "weatherai_trees_history",
    responseStatus: 200,
    started
  });
  return payload;
}

export async function getTreeQuota(workspaceId: string, memberId: string) {
  const started = Date.now();
  const access = await resolveWeatherAiAccess(workspaceId, memberId);
  assertService(access, "trees");
  const payload = await providerJson(access, "/v1/trees/quota");
  await recordWeatherAiUsage({
    workspaceId,
    memberId,
    endpoint: "/api/weatherai/trees/quota",
    feature: "weatherai_trees_quota",
    responseStatus: 200,
    started
  });
  return payload;
}

export async function proxyTreeAnalysis(
  workspaceId: string,
  memberId: string,
  request: Request,
  response: Response,
  providerPath: "/v1/trees/analyze" | "/v1/forestry/count-trees"
) {
  const started = Date.now();
  const access = await resolveWeatherAiAccess(workspaceId, memberId);
  assertService(access, "trees");

  const uploadInit = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access.apiKey}`,
      "x-api-key": access.apiKey,
      ...(request.headers["content-type"] ? { "Content-Type": request.headers["content-type"] } : {})
    },
    body: request,
    duplex: "half"
  } as unknown as RequestInit & { duplex: "half" };
  const providerResponse = await fetch(`${env.WEATHERAI_BASE_URL.replace(/\/$/, "")}${providerPath}`, uploadInit);

  const contentType = providerResponse.headers.get("content-type") ?? "application/json";
  const body = Buffer.from(await providerResponse.arrayBuffer());

  await recordWeatherAiUsage({
    workspaceId,
    memberId,
    endpoint: providerPath.replace("/v1", "/api/weatherai"),
    feature: "weatherai_trees_analyze",
    aiEnabled: true,
    responseStatus: providerResponse.status,
    started
  });

  response.status(providerResponse.status).type(contentType).send(body);
}
