import { cache } from "../../infrastructure/cache/cache.js";
import { env } from "../../config/env.js";
import { decryptApiKey } from "../../infrastructure/encryption/apiKeyCrypto.js";
import { prisma } from "../../infrastructure/prisma/client.js";
import { HttpError } from "../../utils/http.js";
import { createId } from "../../utils/id.js";
import { createAuditLog, createUsageEvent } from "../db/helpers.js";
import type { HazardType, Incident, RiskRule, Severity, Site } from "@prisma/client";

export type HourlyForecast = {
  timestamp: string;
  temperatureC: number;
  precipitationProbability: number;
  windSpeedKph: number;
  condition: string;
};

export type RiskTrigger = {
  ruleId: string;
  hazardType: HazardType;
  severity: Exclude<Severity, "CRITICAL">;
  observedValue: number;
  thresholdValue: number;
  recommendation: string;
  reason: string;
};

export type EvaluatedHour = HourlyForecast & {
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  triggers: RiskTrigger[];
};

export type WindowGroup = {
  start: string;
  end: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  hours: EvaluatedHour[];
  summary: string;
  recommendation?: string;
};

type WeatherProviderContext = {
  source: "weatherai" | "demo";
  apiKey?: string;
  cacheScope: string;
  maxDays: number;
};

async function getSite(workspaceId: string, siteId: string) {
  const site = await prisma.site.findFirst({ where: { workspaceId, id: siteId } });
  if (!site) {
    throw new HttpError(404, "Site not found");
  }
  return site;
}

function isPlaceholderKey(apiKey: string | undefined) {
  if (!apiKey) {
    return true;
  }
  const lower = apiKey.trim().toLowerCase();
  return lower.length === 0 || lower.includes("replace") || lower.includes("example");
}

function isDemoKey(apiKey: string | undefined) {
  return Boolean(apiKey?.startsWith("wai_demo"));
}

function isLiveWeatherAiBaseUrl() {
  return !env.WEATHERAI_BASE_URL.toLowerCase().includes("example");
}

function assertLiveWeatherAiConfig(apiKey: string | undefined, owner: "platform" | "organisation") {
  if (isPlaceholderKey(apiKey)) {
    throw new HttpError(
      503,
      owner === "platform"
        ? "WeatherAI platform key is not configured. Set WEATHERAI_PLATFORM_API_KEY in .env for personal workspaces."
        : "WeatherAI organisation key is not configured. Connect a valid provider key in Provider Centre."
    );
  }

  if (!isLiveWeatherAiBaseUrl()) {
    throw new HttpError(503, "WeatherAI base URL is not configured. Set WEATHERAI_BASE_URL to the live WeatherAI API.");
  }
}

async function resolveWeatherProvider(workspaceId: string, memberId: string): Promise<WeatherProviderContext> {
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
    const platformKey = env.WEATHERAI_PLATFORM_API_KEY?.trim();
    if (isDemoKey(platformKey)) {
      return {
        source: "demo",
        apiKey: platformKey,
        cacheScope: `demo:platform:${workspaceId}`,
        maxDays: 7
      };
    }

    assertLiveWeatherAiConfig(platformKey, "platform");
    return {
      source: "weatherai",
      apiKey: platformKey,
      cacheScope: `platform:${workspaceId}`,
      maxDays: 7
    };
  }

  const connection = await prisma.providerConnection.findFirst({
    where: {
      workspaceId,
      connectionStatus: "ACTIVE"
    }
  });

  if (!connection) {
    const canConnectProvider = member.role === "ORG_OWNER" || member.role === "IT_ADMIN";
    throw new HttpError(
      409,
      canConnectProvider
        ? "Connect your organisation WeatherAI API key in Provider Centre before running weather analysis."
        : "WeatherAI is not connected for this organisation. Contact your IT administrator to enable weather analysis."
    );
  }

  const organisationKey =
    connection.encryptedApiKey === "demo-encrypted-key"
      ? "wai_demo_free_34bf"
      : decryptApiKey(connection.encryptedApiKey);

  if (isDemoKey(organisationKey)) {
    return {
      source: "demo",
      apiKey: organisationKey,
      cacheScope: `demo:provider:${connection.id}`,
      maxDays: connection.forecastDays ?? 7
    };
  }

  assertLiveWeatherAiConfig(organisationKey, "organisation");
  return {
    source: "weatherai",
    apiKey: organisationKey,
    cacheScope: `provider:${connection.id}`,
    maxDays: connection.forecastDays ?? 7
  };
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function conditionFor(precipitationProbability: number, windSpeedKph: number, temperatureC: number) {
  if (precipitationProbability >= 70) {
    return "heavy-rain";
  }
  if (precipitationProbability >= 45) {
    return "showers";
  }
  if (windSpeedKph >= 35) {
    return "windy";
  }
  if (temperatureC >= 38) {
    return "hot";
  }
  return "clear";
}

function generateDemoHourly(site: Site, hours: number): HourlyForecast[] {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const geoBias = Math.abs(site.latitude + site.longitude) % 11;
  const isPakistan = site.country.toLowerCase().includes("pakistan");
  const baseTemperature = isPakistan ? 29 + geoBias / 3 : 23 + geoBias / 4;

  return Array.from({ length: hours }, (_, index) => {
    const timestamp = new Date(start.getTime() + index * 60 * 60 * 1000);
    const hour = timestamp.getHours();
    const dailyHeat = Math.max(0, Math.sin(((hour - 7) / 24) * Math.PI * 2)) * 10;
    const rainPulse = index % 17 >= 10 && index % 17 <= 13 ? 48 : 10;
    const monsoonPulse = site.name.toLowerCase().includes("lahore") && index % 24 >= 14 && index % 24 <= 17 ? 28 : 0;
    const windPulse = site.name.toLowerCase().includes("islamabad") && index % 24 >= 13 && index % 24 <= 16 ? 16 : 0;
    const temperatureC = round(baseTemperature + dailyHeat - (rainPulse > 20 ? 3 : 0));
    const precipitationProbability = Math.min(92, Math.round(rainPulse + monsoonPulse + ((index * 13 + geoBias) % 18)));
    const windSpeedKph = round(12 + ((index * 7 + geoBias) % 16) + windPulse);

    return {
      timestamp: timestamp.toISOString(),
      temperatureC,
      precipitationProbability,
      windSpeedKph,
      condition: conditionFor(precipitationProbability, windSpeedKph, temperatureC)
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getPath(payload: unknown, path: string[]) {
  let current = payload;
  for (const part of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function getFirstPath(payload: unknown, paths: string[][]) {
  for (const path of paths) {
    const value = getPath(payload, path);
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

function numberFromProvider(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (isRecord(value)) {
    return numberFromProvider(
      value.value ?? value.amount ?? value.degrees ?? value.kph ?? value.kmh ?? value.speed ?? value.probability
    );
  }

  return null;
}

function stringFromProvider(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (isRecord(value)) {
    return stringFromProvider(value.description ?? value.text ?? value.label ?? value.main ?? value.value);
  }

  return null;
}

function timestampFromProvider(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
    return new Date(milliseconds).toISOString();
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const trimmed = value.trim();
    if (/^\d{10,13}$/u.test(trimmed)) {
      const numeric = Number(trimmed);
      const milliseconds = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
      return new Date(milliseconds).toISOString();
    }

    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return null;
}

function probabilityFromProvider(value: number) {
  const percent = value >= 0 && value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, round(percent)));
}

function expandParallelHourly(hourly: Record<string, unknown>) {
  const times = hourly.time ?? hourly.times ?? hourly.timestamp ?? hourly.timestamps ?? hourly.datetime ?? hourly.datetimes;
  if (!Array.isArray(times)) {
    return null;
  }

  const entries: Record<string, unknown>[] = [];
  for (let index = 0; index < times.length; index += 1) {
    const entry: Record<string, unknown> = { time: times[index] };
    for (const [key, value] of Object.entries(hourly)) {
      if (Array.isArray(value)) {
        entry[key] = value[index];
      }
    }
    entries.push(entry);
  }
  return entries;
}

function findHourlyEntries(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload;
  }

  const candidates = [
    getPath(payload, ["hourly"]),
    getPath(payload, ["data", "hourly"]),
    getPath(payload, ["forecast", "hourly"]),
    getPath(payload, ["forecast", "hours"]),
    getPath(payload, ["hours"]),
    getPath(payload, ["data", "hours"]),
    getPath(payload, ["data", "forecast"]),
    getPath(payload, ["data"])
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }

    if (isRecord(candidate)) {
      const parallel = expandParallelHourly(candidate);
      if (parallel) {
        return parallel;
      }
    }
  }

  return [];
}

function normalizeHourlyEntry(entry: unknown): HourlyForecast | null {
  if (!isRecord(entry)) {
    return null;
  }

  const timestamp = timestampFromProvider(
    getFirstPath(entry, [
      ["timestamp"],
      ["time"],
      ["datetime"],
      ["dateTime"],
      ["validTime"],
      ["forecastTime"],
      ["startTime"],
      ["date"]
    ])
  );
  const temperature = numberFromProvider(
    getFirstPath(entry, [
      ["temperatureC"],
      ["temperature_c"],
      ["tempC"],
      ["temp_c"],
      ["temperature_2m"],
      ["airTemperature"],
      ["air_temperature"],
      ["temperature"],
      ["temp"],
      ["temperature", "celsius"],
      ["temperature", "value"]
    ])
  );
  const precipitation = numberFromProvider(
    getFirstPath(entry, [
      ["precipitationProbability"],
      ["precipitation_probability"],
      ["precipProbability"],
      ["probabilityOfPrecipitation"],
      ["probability_of_precipitation"],
      ["rainProbability"],
      ["rain_probability"],
      ["rainChance"],
      ["rain_chance"],
      ["chanceOfRain"],
      ["pop"],
      ["precipitation", "probability"],
      ["rain", "probability"]
    ])
  );
  const wind = numberFromProvider(
    getFirstPath(entry, [
      ["windSpeedKph"],
      ["wind_speed_kph"],
      ["windSpeed10m"],
      ["wind_speed_10m"],
      ["wind_speed_10m_max"],
      ["windKph"],
      ["wind_kph"],
      ["windSpeed"],
      ["wind_speed"],
      ["wind", "speedKph"],
      ["wind", "speed_kph"],
      ["wind", "speed"]
    ])
  );

  if (!timestamp || temperature === null || precipitation === null || wind === null) {
    return null;
  }

  const precipitationProbability = probabilityFromProvider(precipitation);
  const windSpeedKph = round(wind);
  const temperatureC = round(temperature);
  const condition =
    stringFromProvider(
      getFirstPath(entry, [
        ["condition"],
        ["summary"],
        ["weather"],
        ["weatherCode"],
        ["weather_code"],
        ["weather", "description"],
        ["weather", "main"]
      ])
    ) ?? conditionFor(precipitationProbability, windSpeedKph, temperatureC);

  return {
    timestamp,
    temperatureC,
    precipitationProbability,
    windSpeedKph,
    condition
  };
}

function normalizeWeatherAiHourly(payload: unknown, hours: number) {
  const hourly = findHourlyEntries(payload)
    .map((entry) => normalizeHourlyEntry(entry))
    .filter((entry): entry is HourlyForecast => Boolean(entry));

  if (hourly.length === 0) {
    throw new HttpError(502, "WeatherAI returned a forecast shape the app could not read.");
  }

  return hourly.slice(0, hours);
}

async function fetchWeatherAiHourly(site: Site, provider: WeatherProviderContext, days: number, hours: number) {
  if (!provider.apiKey) {
    throw new HttpError(503, "WeatherAI API key is missing.");
  }

  const url = new URL("/v1/hourly", env.WEATHERAI_BASE_URL);
  url.searchParams.set("lat", String(site.latitude));
  url.searchParams.set("lon", String(site.longitude));
  url.searchParams.set("days", String(days));
  url.searchParams.set("ai", "false");
  url.searchParams.set("units", "metric");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
      "x-api-key": provider.apiKey
    }
  });

  if (!response.ok) {
    const status = response.status === 401 || response.status === 403 ? 502 : response.status;
    throw new HttpError(status, `WeatherAI hourly forecast failed with provider status ${response.status}`);
  }

  return normalizeWeatherAiHourly((await response.json()) as unknown, hours);
}

export async function getHourlyForecast(site: Site, provider: WeatherProviderContext, days = 2) {
  const boundedDays = Math.max(1, Math.min(days, provider.maxDays, 16));
  const hours = Math.max(24, Math.min(boundedDays * 24, 16 * 24));
  const cacheKey = `weather:hourly:${provider.cacheScope}:${site.id}:${site.latitude}:${site.longitude}:${boundedDays}:${site.units}`;
  const cached = await cache.get<HourlyForecast[]>(cacheKey);
  if (cached) {
    return { hourly: cached, servedFromCache: true, providerCalled: false };
  }

  const hourly =
    provider.source === "demo" ? generateDemoHourly(site, hours) : await fetchWeatherAiHourly(site, provider, boundedDays, hours);
  await cache.set(cacheKey, hourly, 60 * 30);
  return { hourly, servedFromCache: false, providerCalled: provider.source === "weatherai" };
}

export async function getCurrentConditions(workspaceId: string, memberId: string, siteId: string) {
  const provider = await resolveWeatherProvider(workspaceId, memberId);
  const started = Date.now();
  const site = await getSite(workspaceId, siteId);
  const { hourly, servedFromCache, providerCalled } = await getHourlyForecast(site, provider, 1);
  const current = hourly[0];
  if (!current) {
    throw new HttpError(502, "Forecast provider returned no current condition");
  }

  await createUsageEvent({
    workspaceId,
    memberId,
    siteId,
    endpoint: `/api/sites/${siteId}/current`,
    feature: "current_weather",
    aiEnabled: false,
    servedFromCache,
    providerCalled,
    responseStatus: 200,
    durationMs: Date.now() - started
  });

  return {
    site,
    current,
    servedFromCache
  };
}

function compareSeverity(left: "LOW" | "MEDIUM" | "HIGH", right: "LOW" | "MEDIUM" | "HIGH") {
  const score = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  return score[left] - score[right];
}

function evaluateRule(rule: RiskRule, hour: HourlyForecast): RiskTrigger | null {
  const rules: Record<HazardType, { value: number; label: string; highWhen: "above" | "below" }> = {
    RAIN: {
      value: hour.precipitationProbability,
      label: "rain probability",
      highWhen: "above"
    },
    HIGH_TEMPERATURE: {
      value: hour.temperatureC,
      label: "temperature",
      highWhen: "above"
    },
    HIGH_WIND: {
      value: hour.windSpeedKph,
      label: "wind speed",
      highWhen: "above"
    },
    FROST: {
      value: hour.temperatureC,
      label: "temperature",
      highWhen: "below"
    }
  };

  const hazard = rules[rule.hazardType];
  const isHigh =
    hazard.highWhen === "above" ? hazard.value >= rule.highThreshold : hazard.value <= rule.highThreshold;
  const isMedium =
    hazard.highWhen === "above" ? hazard.value >= rule.mediumThreshold : hazard.value <= rule.mediumThreshold;

  if (!isMedium) {
    return null;
  }

  const severity = isHigh ? "HIGH" : "MEDIUM";
  const thresholdValue = isHigh ? rule.highThreshold : rule.mediumThreshold;
  const direction = hazard.highWhen === "above" ? "exceeds" : "is below";
  return {
    ruleId: rule.id,
    hazardType: rule.hazardType,
    severity,
    observedValue: hazard.value,
    thresholdValue,
    recommendation: rule.recommendation,
    reason: `${hazard.label} ${direction} ${thresholdValue}`
  };
}

export function evaluateHourlyForecast(hourly: HourlyForecast[], rules: RiskRule[]): EvaluatedHour[] {
  const activeRules = rules.filter((rule) => rule.enabled);
  return hourly.map((hour) => {
    const triggers = activeRules
      .map((rule) => evaluateRule(rule, hour))
      .filter((trigger): trigger is RiskTrigger => Boolean(trigger));

    const riskLevel = triggers.reduce<"LOW" | "MEDIUM" | "HIGH">((current, trigger) => {
      return compareSeverity(trigger.severity, current) > 0 ? trigger.severity : current;
    }, "LOW");

    return {
      ...hour,
      riskLevel,
      triggers
    };
  });
}

function groupWindows(hours: EvaluatedHour[], riskLevel: "LOW" | "HIGH") {
  const groups: WindowGroup[] = [];
  let current: EvaluatedHour[] = [];

  const flush = () => {
    if (current.length === 0) {
      return;
    }
    const first = current[0]!;
    const last = current[current.length - 1]!;
    const end = new Date(new Date(last.timestamp).getTime() + 60 * 60 * 1000).toISOString();
    const maxRain = Math.max(...current.map((hour) => hour.precipitationProbability));
    const maxWind = Math.max(...current.map((hour) => hour.windSpeedKph));
    const minTemp = Math.min(...current.map((hour) => hour.temperatureC));
    const maxTemp = Math.max(...current.map((hour) => hour.temperatureC));
    const firstTrigger = current.flatMap((hour) => hour.triggers).find((trigger) => trigger.severity === "HIGH");

    groups.push({
      start: first.timestamp,
      end,
      riskLevel,
      hours: current,
      summary:
        riskLevel === "LOW"
          ? `Temperature ${round(minTemp)}-${round(maxTemp)}C, rain below ${maxRain}%, wind up to ${round(maxWind)} km/h`
          : firstTrigger?.reason ?? "High-risk rule threshold exceeded",
      recommendation: firstTrigger?.recommendation
    });
    current = [];
  };

  for (const hour of hours) {
    if (hour.riskLevel === riskLevel) {
      current.push(hour);
    } else {
      flush();
    }
  }
  flush();

  return groups;
}

function incidentTitle(hazardType: HazardType) {
  const titles: Record<HazardType, string> = {
    RAIN: "High Rain Risk Detected",
    HIGH_TEMPERATURE: "High Heat Risk Detected",
    HIGH_WIND: "High Wind Risk Detected",
    FROST: "Frost Risk Detected"
  };
  return titles[hazardType];
}

async function createIncidentsForHazards(
  workspaceId: string,
  siteId: string,
  actorMemberId: string,
  hazardWindows: WindowGroup[]
) {
  const incidents: Incident[] = [];

  for (const window of hazardWindows) {
    const trigger = window.hours.flatMap((hour) => hour.triggers).find((candidate) => candidate.severity === "HIGH");
    if (!trigger) {
      continue;
    }

    const deduplicationKey = `${workspaceId}:${siteId}:${trigger.ruleId}:${window.start}:${window.end}`;
    const existing = await prisma.incident.findFirst({
      where: {
        workspaceId,
        deduplicationKey,
        status: { in: ["OPEN", "ACKNOWLEDGED"] }
      }
    });
    if (existing) {
      continue;
    }

    const incident = await prisma.incident.create({
      data: {
        id: createId("inc"),
        workspaceId,
        siteId,
        ruleId: trigger.ruleId,
        severity: "HIGH",
        title: incidentTitle(trigger.hazardType),
        reason: trigger.reason,
        recommendation: trigger.recommendation,
        forecastStart: new Date(window.start),
        forecastEnd: new Date(window.end),
        observedValue: trigger.observedValue,
        thresholdValue: trigger.thresholdValue,
        deduplicationKey,
        status: "OPEN"
      }
    });
    incidents.push(incident);
  }

  if (incidents.length > 0) {
    await createAuditLog({
      workspaceId,
      actorMemberId,
      action: "incident.generated",
      targetType: "Incident",
      metadataJson: { count: incidents.length, siteId }
    });
  }

  return incidents;
}

export async function getForecast(workspaceId: string, memberId: string, siteId: string, days = 2) {
  const provider = await resolveWeatherProvider(workspaceId, memberId);
  const started = Date.now();
  const site = await getSite(workspaceId, siteId);
  const { hourly, servedFromCache, providerCalled } = await getHourlyForecast(site, provider, days);

  await createUsageEvent({
    workspaceId,
    memberId,
    siteId,
    endpoint: `/api/sites/${siteId}/forecast`,
    feature: "hourly_forecast",
    aiEnabled: false,
    servedFromCache,
    providerCalled,
    responseStatus: 200,
    durationMs: Date.now() - started
  });

  return { site, hourly, servedFromCache };
}

export async function analyseWorkingWindows(workspaceId: string, memberId: string, siteId: string, days = 2) {
  const provider = await resolveWeatherProvider(workspaceId, memberId);
  const started = Date.now();
  const site = await getSite(workspaceId, siteId);
  const rules = await prisma.riskRule.findMany({ where: { workspaceId, siteId } });
  const { hourly, servedFromCache, providerCalled } = await getHourlyForecast(site, provider, days);
  const evaluatedHours = evaluateHourlyForecast(hourly, rules);
  const workingWindows = groupWindows(evaluatedHours, "LOW").filter((window) => window.hours.length >= 2);
  const hazardWindows = groupWindows(evaluatedHours, "HIGH");
  const incidentsCreated = await createIncidentsForHazards(workspaceId, siteId, memberId, hazardWindows);

  await createUsageEvent({
    workspaceId,
    memberId,
    siteId,
    endpoint: `/api/sites/${siteId}/analyse-working-windows`,
    feature: "working_window_analysis",
    aiEnabled: false,
    servedFromCache,
    providerCalled,
    responseStatus: 200,
    durationMs: Date.now() - started
  });

  await createAuditLog({
    workspaceId,
    actorMemberId: memberId,
    action: "monitoring.analysis_run",
    targetType: "Site",
    targetId: siteId,
    metadataJson: {
      days,
      workingWindows: workingWindows.length,
      hazardWindows: hazardWindows.length,
      incidentsCreated: incidentsCreated.length
    }
  });

  return {
    site,
    evaluatedHours,
    workingWindows,
    hazardWindows,
    incidentsCreated,
    servedFromCache
  };
}
