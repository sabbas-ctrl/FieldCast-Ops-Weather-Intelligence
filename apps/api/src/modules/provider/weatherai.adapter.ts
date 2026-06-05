import { env } from "../../config/env.js";
import { cache } from "../../infrastructure/cache/cache.js";
import type { CapabilityTier } from "@prisma/client";

export type WeatherAiPlan = "FREE" | "PRO" | "SCALE" | "UNKNOWN";

export type ProviderUsage = {
  requestsUsed: number;
  requestLimit: number;
  aiRequestsUsed: number;
  aiRequestLimit: number;
  periodStart: string;
  periodEnd: string;
  plan?: WeatherAiPlan;
  raw: unknown;
};

export type ResolvedCapabilities = {
  capabilityTier: CapabilityTier;
  requestLimit: number;
  aiRequestLimit: number;
  forecastDays: number;
  webhooksEnabled: boolean;
  smsEligible: boolean;
  smsApproved: boolean;
};

function numberFrom(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function stringFrom(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function getPath(payload: unknown, path: string[]) {
  let current = payload;
  for (const part of path) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function planFrom(value: unknown): WeatherAiPlan {
  const normalized = stringFrom(value, "").toUpperCase();
  if (normalized.includes("SCALE")) {
    return "SCALE";
  }
  if (normalized.includes("PRO")) {
    return "PRO";
  }
  if (normalized.includes("FREE")) {
    return "FREE";
  }
  return "UNKNOWN";
}

function usedFromLimitAndRemaining(limit: number, remaining: number, fallback = 0) {
  if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(remaining)) {
    return fallback;
  }

  return Math.max(0, limit - Math.max(0, remaining));
}

function demoUsage(apiKey: string): ProviderUsage {
  const lower = apiKey.toLowerCase();
  const isScale = lower.includes("scale");
  const isPro = lower.includes("pro");
  const requestLimit = isScale ? 500000 : isPro ? 50000 : 1000;
  const aiRequestLimit = isScale ? 100000 : isPro ? 10000 : 200;
  const periodStart = new Date(Date.now() - 1000 * 60 * 60 * 24 * 12).toISOString();
  const periodEnd = new Date(Date.now() + 1000 * 60 * 60 * 24 * 18).toISOString();

  return {
    requestsUsed: isScale ? 9240 : isPro ? 1280 : 186,
    requestLimit,
    aiRequestsUsed: isScale ? 410 : isPro ? 73 : 12,
    aiRequestLimit,
    periodStart,
    periodEnd,
    plan: isScale ? "SCALE" : isPro ? "PRO" : "FREE",
    raw: {
      source: "demo",
      plan: isScale ? "scale" : isPro ? "pro" : "free",
      requestLimit,
      aiRequestLimit,
      smsEnabled: isScale && lower.includes("sms")
    }
  };
}

export function resolveCapabilities(usage: ProviderUsage): ResolvedCapabilities {
  const smsApproved = Boolean(getPath(usage.raw, ["smsEnabled"]) ?? getPath(usage.raw, ["sms", "enabled"]));
  const plan = usage.plan ?? planFrom(getPath(usage.raw, ["plan"]));
  if (plan === "SCALE" || usage.requestLimit >= 500000 || usage.aiRequestLimit >= 100000) {
    return {
      capabilityTier: "SCALE",
      requestLimit: usage.requestLimit || 500000,
      aiRequestLimit: usage.aiRequestLimit || 100000,
      forecastDays: 16,
      webhooksEnabled: true,
      smsEligible: true,
      smsApproved
    };
  }

  if (plan === "PRO" || usage.requestLimit >= 50000 || usage.aiRequestLimit >= 10000) {
    return {
      capabilityTier: "PRO",
      requestLimit: usage.requestLimit || 50000,
      aiRequestLimit: usage.aiRequestLimit || 10000,
      forecastDays: 14,
      webhooksEnabled: true,
      smsEligible: false,
      smsApproved: false
    };
  }

  if (plan === "FREE" || usage.requestLimit > 0 || usage.aiRequestLimit > 0) {
    return {
      capabilityTier: "FREE",
      requestLimit: usage.requestLimit || 1000,
      aiRequestLimit: usage.aiRequestLimit || 200,
      forecastDays: 7,
      webhooksEnabled: false,
      smsEligible: false,
      smsApproved: false
    };
  }

  return {
    capabilityTier: "UNKNOWN",
    requestLimit: usage.requestLimit,
    aiRequestLimit: usage.aiRequestLimit,
    forecastDays: 7,
    webhooksEnabled: false,
    smsEligible: false,
    smsApproved: false
  };
}

export async function fetchProviderUsage(apiKey: string): Promise<ProviderUsage> {
  const cacheKey = `usage:verify:${apiKey.slice(0, 8)}:${apiKey.slice(-6)}`;
  const cached = await cache.get<ProviderUsage>(cacheKey);
  if (cached) {
    return cached;
  }

  if (env.WEATHERAI_BASE_URL.includes("example") || apiKey.startsWith("wai_demo")) {
    const usage = demoUsage(apiKey);
    await cache.set(cacheKey, usage, 300);
    return usage;
  }

  const response = await fetch(`${env.WEATHERAI_BASE_URL.replace(/\/$/, "")}/v1/usage`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey
    }
  });

  if (!response.ok) {
    throw new Error(`WeatherAI usage verification failed with ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  const requestLimit = numberFrom(
    getPath(payload, ["requestLimit"]) ??
      getPath(payload, ["limits", "requests"]) ??
      getPath(payload, ["limits", "monthlyRequests"]) ??
      getPath(payload, ["planLimits", "requests"])
  );
  const aiRequestLimit = numberFrom(
    getPath(payload, ["aiRequestLimit"]) ??
      getPath(payload, ["limits", "aiRequests"]) ??
      getPath(payload, ["limits", "ai_requests"]) ??
      getPath(payload, ["limits", "ai"]) ??
      getPath(payload, ["planLimits", "aiRequests"])
  );
  const requestsRemaining = numberFrom(
    getPath(payload, ["requestsRemaining"]) ??
      getPath(payload, ["remaining", "requests"]) ??
      getPath(payload, ["remaining", "monthlyRequests"]),
    Number.NaN
  );
  const aiRequestsRemaining = numberFrom(
    getPath(payload, ["aiRequestsRemaining"]) ??
      getPath(payload, ["remaining", "aiRequests"]) ??
      getPath(payload, ["remaining", "ai_requests"]) ??
      getPath(payload, ["remaining", "ai"]),
    Number.NaN
  );
  const explicitRequestsUsed = numberFrom(
    getPath(payload, ["requestsUsed"]) ??
      getPath(payload, ["requests", "used"]) ??
      getPath(payload, ["usage", "requests"]),
    Number.NaN
  );
  const explicitAiRequestsUsed = numberFrom(
    getPath(payload, ["aiRequestsUsed"]) ??
      getPath(payload, ["ai", "used"]) ??
      getPath(payload, ["usage", "aiRequests"]),
    Number.NaN
  );
  const usage: ProviderUsage = {
    requestsUsed: Number.isFinite(explicitRequestsUsed)
      ? explicitRequestsUsed
      : usedFromLimitAndRemaining(requestLimit, requestsRemaining),
    requestLimit,
    aiRequestsUsed: Number.isFinite(explicitAiRequestsUsed)
      ? explicitAiRequestsUsed
      : usedFromLimitAndRemaining(aiRequestLimit, aiRequestsRemaining),
    aiRequestLimit,
    periodStart: stringFrom(
      getPath(payload, ["periodStart"]) ?? getPath(payload, ["period", "start"]) ?? getPath(payload, ["billingPeriod", "start"]),
      new Date().toISOString()
    ),
    periodEnd: stringFrom(
      getPath(payload, ["periodEnd"]) ?? getPath(payload, ["period", "end"]) ?? getPath(payload, ["billingPeriod", "end"]),
      new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString()
    ),
    plan: planFrom(getPath(payload, ["plan"])),
    raw: payload
  };

  await cache.set(cacheKey, usage, 300);
  return usage;
}
