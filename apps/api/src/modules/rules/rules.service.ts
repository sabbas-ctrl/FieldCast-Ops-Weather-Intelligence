import { z } from "zod";
import { HttpError } from "../../utils/http.js";
import { createId } from "../../utils/id.js";
import { createAuditLog, store } from "../demo/store.js";
import type { RiskRule } from "../demo/store.js";

export const ruleInputSchema = z.object({
  hazardType: z.enum(["RAIN", "HIGH_TEMPERATURE", "HIGH_WIND", "FROST"]),
  mediumThreshold: z.number(),
  highThreshold: z.number(),
  enabled: z.boolean().default(true),
  recommendation: z.string().min(8)
});

function assertSite(workspaceId: string, siteId: string) {
  const site = store.sites.find((candidate) => candidate.workspaceId === workspaceId && candidate.id === siteId);
  if (!site) {
    throw new HttpError(404, "Site not found");
  }
  return site;
}

export function listRules(workspaceId: string, siteId: string) {
  assertSite(workspaceId, siteId);
  return store.riskRules.filter((rule) => rule.workspaceId === workspaceId && rule.siteId === siteId);
}

export function createRule(workspaceId: string, actorMemberId: string, siteId: string, input: z.infer<typeof ruleInputSchema>) {
  assertSite(workspaceId, siteId);
  const rule: RiskRule = {
    id: createId("rule"),
    workspaceId,
    siteId,
    hazardType: input.hazardType,
    mediumThreshold: input.mediumThreshold,
    highThreshold: input.highThreshold,
    enabled: input.enabled,
    recommendation: input.recommendation,
    createdBy: actorMemberId,
    createdAt: new Date().toISOString()
  };
  store.riskRules.unshift(rule);
  createAuditLog({
    workspaceId,
    actorMemberId,
    action: "rule.created",
    targetType: "RiskRule",
    targetId: rule.id,
    metadataJson: { siteId, hazardType: rule.hazardType }
  });
  return rule;
}

export function getRule(workspaceId: string, ruleId: string) {
  const rule = store.riskRules.find((candidate) => candidate.workspaceId === workspaceId && candidate.id === ruleId);
  if (!rule) {
    throw new HttpError(404, "Risk rule not found");
  }
  return rule;
}

export function updateRule(
  workspaceId: string,
  actorMemberId: string,
  ruleId: string,
  input: Partial<z.infer<typeof ruleInputSchema>>
) {
  const rule = getRule(workspaceId, ruleId);
  Object.assign(rule, input);
  createAuditLog({
    workspaceId,
    actorMemberId,
    action: "rule.updated",
    targetType: "RiskRule",
    targetId: rule.id,
    metadataJson: input
  });
  return rule;
}

export function deleteRule(workspaceId: string, actorMemberId: string, ruleId: string) {
  const rule = getRule(workspaceId, ruleId);
  store.riskRules = store.riskRules.filter((candidate) => candidate.id !== rule.id);
  createAuditLog({
    workspaceId,
    actorMemberId,
    action: "rule.deleted",
    targetType: "RiskRule",
    targetId: rule.id,
    metadataJson: { hazardType: rule.hazardType }
  });
}
