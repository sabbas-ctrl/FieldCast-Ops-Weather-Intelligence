import { cache } from "../../infrastructure/cache/cache.js";
import { HttpError } from "../../utils/http.js";
import { createId } from "../../utils/id.js";
import { createAuditLog, createUsageEvent, store } from "../demo/store.js";
import type { HazardType, Incident, RiskRule, Severity, Site } from "../demo/store.js";

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

function getSite(workspaceId: string, siteId: string) {
  const site = store.sites.find((candidate) => candidate.workspaceId === workspaceId && candidate.id === siteId);
  if (!site) {
    throw new HttpError(404, "Site not found");
  }
  return site;
}

function assertWeatherUsageEnabled(memberId: string) {
  const member = store.members.find((candidate) => candidate.id === memberId);
  if (!member?.weatherUsageEnabled) {
    throw new HttpError(403, "Weather usage is disabled for this member");
  }
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

export async function getHourlyForecast(site: Site, days = 2) {
  const hours = Math.max(24, Math.min(days * 24, 16 * 24));
  const cacheKey = `weather:hourly:demo:${site.id}:${days}:${site.units}`;
  const cached = await cache.get<HourlyForecast[]>(cacheKey);
  if (cached) {
    return { hourly: cached, servedFromCache: true };
  }

  const hourly = generateDemoHourly(site, hours);
  await cache.set(cacheKey, hourly, 60 * 30);
  return { hourly, servedFromCache: false };
}

export async function getCurrentConditions(workspaceId: string, memberId: string, siteId: string) {
  assertWeatherUsageEnabled(memberId);
  const started = Date.now();
  const site = getSite(workspaceId, siteId);
  const { hourly, servedFromCache } = await getHourlyForecast(site, 1);
  const current = hourly[0];
  if (!current) {
    throw new HttpError(502, "Forecast provider returned no current condition");
  }

  createUsageEvent({
    workspaceId,
    memberId,
    siteId,
    endpoint: `/api/sites/${siteId}/current`,
    feature: "current_weather",
    aiEnabled: false,
    servedFromCache,
    providerCalled: !servedFromCache,
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

function createIncidentsForHazards(
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
    const existing = store.incidents.find(
      (incident) =>
        incident.workspaceId === workspaceId &&
        incident.deduplicationKey === deduplicationKey &&
        ["OPEN", "ACKNOWLEDGED"].includes(incident.status)
    );
    if (existing) {
      continue;
    }

    const incident: Incident = {
      id: createId("inc"),
      workspaceId,
      siteId,
      ruleId: trigger.ruleId,
      severity: "HIGH",
      title: incidentTitle(trigger.hazardType),
      reason: trigger.reason,
      recommendation: trigger.recommendation,
      forecastStart: window.start,
      forecastEnd: window.end,
      observedValue: trigger.observedValue,
      thresholdValue: trigger.thresholdValue,
      deduplicationKey,
      status: "OPEN",
      createdAt: new Date().toISOString()
    };
    store.incidents.unshift(incident);
    incidents.push(incident);
  }

  if (incidents.length > 0) {
    createAuditLog({
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
  assertWeatherUsageEnabled(memberId);
  const started = Date.now();
  const site = getSite(workspaceId, siteId);
  const { hourly, servedFromCache } = await getHourlyForecast(site, days);

  createUsageEvent({
    workspaceId,
    memberId,
    siteId,
    endpoint: `/api/sites/${siteId}/forecast`,
    feature: "hourly_forecast",
    aiEnabled: false,
    servedFromCache,
    providerCalled: !servedFromCache,
    responseStatus: 200,
    durationMs: Date.now() - started
  });

  return { site, hourly, servedFromCache };
}

export async function analyseWorkingWindows(workspaceId: string, memberId: string, siteId: string, days = 2) {
  assertWeatherUsageEnabled(memberId);
  const started = Date.now();
  const site = getSite(workspaceId, siteId);
  const rules = store.riskRules.filter((rule) => rule.workspaceId === workspaceId && rule.siteId === siteId);
  const { hourly, servedFromCache } = await getHourlyForecast(site, days);
  const evaluatedHours = evaluateHourlyForecast(hourly, rules);
  const workingWindows = groupWindows(evaluatedHours, "LOW").filter((window) => window.hours.length >= 2);
  const hazardWindows = groupWindows(evaluatedHours, "HIGH");
  const incidentsCreated = createIncidentsForHazards(workspaceId, siteId, memberId, hazardWindows);

  createUsageEvent({
    workspaceId,
    memberId,
    siteId,
    endpoint: `/api/sites/${siteId}/analyse-working-windows`,
    feature: "working_window_analysis",
    aiEnabled: false,
    servedFromCache,
    providerCalled: !servedFromCache,
    responseStatus: 200,
    durationMs: Date.now() - started
  });

  createAuditLog({
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
