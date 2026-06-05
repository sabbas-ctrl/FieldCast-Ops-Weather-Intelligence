import { z } from "zod";
import { prisma } from "../../infrastructure/prisma/client.js";
import { HttpError } from "../../utils/http.js";
import { createId } from "../../utils/id.js";
import { createAuditLog, createDefaultRulesForSite } from "../db/helpers.js";

export const siteInputSchema = z
  .object({
    name: z.string().trim().min(2),
    description: z.string().trim().optional(),
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
    country: z.string().trim().min(2),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    timezone: z.string().trim().min(1).default("UTC"),
    units: z.enum(["METRIC", "IMPERIAL"]).default("METRIC"),
    monitoringEnabled: z.boolean().default(false)
  })
  .strict();

export async function listSites(workspaceId: string) {
  const sites = await prisma.site.findMany({
    where: { workspaceId },
    include: {
      _count: {
        select: {
          rules: { where: { enabled: true } },
          incidents: { where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } } }
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  return sites.map(({ _count, ...site }) => ({
    ...site,
    ruleCount: _count.rules,
    openIncidentCount: _count.incidents
  }));
}

export async function getSite(workspaceId: string, siteId: string) {
  const site = await prisma.site.findFirst({ where: { workspaceId, id: siteId } });
  if (!site) {
    throw new HttpError(404, "Site not found");
  }
  return site;
}

export async function createSite(workspaceId: string, actorMemberId: string, input: z.infer<typeof siteInputSchema>) {
  const site = await prisma.site.create({
    data: {
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
      createdBy: actorMemberId
    }
  });

  await createDefaultRulesForSite(workspaceId, site.id, actorMemberId);
  await createAuditLog({
    workspaceId,
    actorMemberId,
    action: "site.created",
    targetType: "Site",
    targetId: site.id,
    metadataJson: { name: site.name, siteType: site.siteType }
  });
  return site;
}

export async function updateSite(
  workspaceId: string,
  actorMemberId: string,
  siteId: string,
  input: Partial<z.infer<typeof siteInputSchema>>
) {
  await getSite(workspaceId, siteId);
  const site = await prisma.site.update({ where: { id: siteId }, data: input });
  await createAuditLog({
    workspaceId,
    actorMemberId,
    action: "site.updated",
    targetType: "Site",
    targetId: site.id,
    metadataJson: input
  });
  return site;
}

export async function deleteSite(workspaceId: string, actorMemberId: string, siteId: string) {
  const site = await getSite(workspaceId, siteId);
  await prisma.site.delete({ where: { id: site.id } });
  await createAuditLog({
    workspaceId,
    actorMemberId,
    action: "site.deleted",
    targetType: "Site",
    targetId: site.id,
    metadataJson: { name: site.name }
  });
}
