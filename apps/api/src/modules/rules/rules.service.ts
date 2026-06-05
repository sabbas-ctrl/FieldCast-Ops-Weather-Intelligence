import { z } from "zod";
import { prisma } from "../../infrastructure/prisma/client.js";
import { HttpError } from "../../utils/http.js";
import { createId } from "../../utils/id.js";
import { createAuditLog } from "../db/helpers.js";

export const ruleInputSchema = z
  .object({
    hazardType: z.enum(["RAIN", "HIGH_TEMPERATURE", "HIGH_WIND", "FROST"]),
    mediumThreshold: z.number(),
    highThreshold: z.number(),
    enabled: z.boolean().default(true),
    recommendation: z.string().trim().min(8)
  })
  .strict();

async function assertSite(workspaceId: string, siteId: string) {
  const site = await prisma.site.findFirst({ where: { workspaceId, id: siteId } });
  if (!site) {
    throw new HttpError(404, "Site not found");
  }
  return site;
}

export async function listRules(workspaceId: string, siteId: string) {
  await assertSite(workspaceId, siteId);
  return prisma.riskRule.findMany({
    where: { workspaceId, siteId },
    orderBy: { createdAt: "asc" }
  });
}

export async function createRule(workspaceId: string, actorMemberId: string, siteId: string, input: z.infer<typeof ruleInputSchema>) {
  await assertSite(workspaceId, siteId);
  const rule = await prisma.riskRule.create({
    data: {
      id: createId("rule"),
      workspaceId,
      siteId,
      hazardType: input.hazardType,
      mediumThreshold: input.mediumThreshold,
      highThreshold: input.highThreshold,
      enabled: input.enabled,
      recommendation: input.recommendation,
      createdBy: actorMemberId
    }
  });
  await createAuditLog({
    workspaceId,
    actorMemberId,
    action: "rule.created",
    targetType: "RiskRule",
    targetId: rule.id,
    metadataJson: { siteId, hazardType: rule.hazardType }
  });
  return rule;
}

export async function getRule(workspaceId: string, ruleId: string) {
  const rule = await prisma.riskRule.findFirst({ where: { workspaceId, id: ruleId } });
  if (!rule) {
    throw new HttpError(404, "Risk rule not found");
  }
  return rule;
}

export async function updateRule(
  workspaceId: string,
  actorMemberId: string,
  ruleId: string,
  input: Partial<z.infer<typeof ruleInputSchema>>
) {
  await getRule(workspaceId, ruleId);
  const rule = await prisma.riskRule.update({ where: { id: ruleId }, data: input });
  await createAuditLog({
    workspaceId,
    actorMemberId,
    action: "rule.updated",
    targetType: "RiskRule",
    targetId: rule.id,
    metadataJson: input
  });
  return rule;
}

export async function deleteRule(workspaceId: string, actorMemberId: string, ruleId: string) {
  const rule = await getRule(workspaceId, ruleId);
  await prisma.riskRule.delete({ where: { id: rule.id } });
  await createAuditLog({
    workspaceId,
    actorMemberId,
    action: "rule.deleted",
    targetType: "RiskRule",
    targetId: rule.id,
    metadataJson: { hazardType: rule.hazardType }
  });
}
