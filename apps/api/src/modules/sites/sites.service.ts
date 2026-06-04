import { z } from "zod";
import { HttpError } from "../../utils/http.js";
import { createId } from "../../utils/id.js";
import { createAuditLog, createDefaultRulesForSite, store } from "../demo/store.js";
import type { Site } from "../demo/store.js";

export const siteInputSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  siteType: z
    .enum([
      "FIELD_WORK_SITE",
      "FARM_PLANTATION",
      "CONSTRUCTION_SITE",
      "DELIVERY_HUB",
      "EVENT_VENUE",
      "CAMPUS_OUTDOOR_FACILITY",
      "OTHER"
    ])
    .default("FIELD_WORK_SITE"),
  country: z.string().min(2),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: z.string().default("UTC"),
  units: z.enum(["METRIC", "IMPERIAL"]).default("METRIC"),
  monitoringEnabled: z.boolean().default(false)
});

export function listSites(workspaceId: string) {
  return store.sites
    .filter((site) => site.workspaceId === workspaceId)
    .map((site) => ({
      ...site,
      ruleCount: store.riskRules.filter((rule) => rule.siteId === site.id && rule.enabled).length,
      openIncidentCount: store.incidents.filter(
        (incident) => incident.siteId === site.id && ["OPEN", "ACKNOWLEDGED"].includes(incident.status)
      ).length
    }));
}

export function getSite(workspaceId: string, siteId: string) {
  const site = store.sites.find((candidate) => candidate.workspaceId === workspaceId && candidate.id === siteId);
  if (!site) {
    throw new HttpError(404, "Site not found");
  }
  return site;
}

export function createSite(workspaceId: string, actorMemberId: string, input: z.infer<typeof siteInputSchema>) {
  const site: Site = {
    id: createId("site"),
    workspaceId,
    name: input.name,
    description: input.description,
    siteType: input.siteType,
    country: input.country,
    latitude: input.latitude,
    longitude: input.longitude,
    timezone: input.timezone,
    units: input.units,
    monitoringEnabled: input.monitoringEnabled,
    createdBy: actorMemberId,
    createdAt: new Date().toISOString()
  };
  store.sites.unshift(site);
  createDefaultRulesForSite(workspaceId, site.id, actorMemberId);
  createAuditLog({
    workspaceId,
    actorMemberId,
    action: "site.created",
    targetType: "Site",
    targetId: site.id,
    metadataJson: { name: site.name, siteType: site.siteType }
  });
  return site;
}

export function updateSite(
  workspaceId: string,
  actorMemberId: string,
  siteId: string,
  input: Partial<z.infer<typeof siteInputSchema>>
) {
  const site = getSite(workspaceId, siteId);
  Object.assign(site, input);
  createAuditLog({
    workspaceId,
    actorMemberId,
    action: "site.updated",
    targetType: "Site",
    targetId: site.id,
    metadataJson: input
  });
  return site;
}

export function deleteSite(workspaceId: string, actorMemberId: string, siteId: string) {
  const site = getSite(workspaceId, siteId);
  store.sites = store.sites.filter((candidate) => candidate.id !== site.id);
  store.riskRules = store.riskRules.filter((rule) => rule.siteId !== site.id);
  store.incidents = store.incidents.filter((incident) => incident.siteId !== site.id);
  createAuditLog({
    workspaceId,
    actorMemberId,
    action: "site.deleted",
    targetType: "Site",
    targetId: site.id,
    metadataJson: { name: site.name }
  });
}
