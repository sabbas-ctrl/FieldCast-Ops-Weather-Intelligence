import { Prisma } from "@prisma/client";
import type { AuditLog, HazardType, MemberRole, WorkspaceMember } from "@prisma/client";
import { prisma } from "../../infrastructure/prisma/client.js";
import { createId } from "../../utils/id.js";

export const defaultRiskRules: Array<{
  hazardType: HazardType;
  mediumThreshold: number;
  highThreshold: number;
  recommendation: string;
}> = [
  {
    hazardType: "RAIN",
    mediumThreshold: 40,
    highThreshold: 65,
    recommendation: "Postpone exposed outdoor work and equipment handling until rain probability drops."
  },
  {
    hazardType: "HIGH_TEMPERATURE",
    mediumThreshold: 33,
    highThreshold: 38,
    recommendation: "Move strenuous activity outside the hottest part of the day and increase hydration checks."
  },
  {
    hazardType: "HIGH_WIND",
    mediumThreshold: 25,
    highThreshold: 35,
    recommendation: "Restrict elevated work, temporary structures and equipment-heavy activity."
  },
  {
    hazardType: "FROST",
    mediumThreshold: 5,
    highThreshold: 2,
    recommendation: "Delay frost-sensitive activity until surface temperatures recover."
  }
];

export async function createDefaultRulesForSite(workspaceId: string, siteId: string, createdBy?: string) {
  await prisma.riskRule.createMany({
    data: defaultRiskRules.map((rule) => ({
      id: createId("rule"),
      workspaceId,
      siteId,
      createdBy,
      enabled: true,
      ...rule
    }))
  });
}

export async function createAuditLog(input: {
  workspaceId: string;
  actorMemberId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadataJson?: Prisma.InputJsonValue;
}) {
  return prisma.auditLog.create({
    data: {
      id: createId("aud"),
      workspaceId: input.workspaceId,
      actorMemberId: input.actorMemberId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadataJson: input.metadataJson ?? Prisma.JsonNull
    }
  });
}

export async function createUsageEvent(input: {
  workspaceId: string;
  memberId?: string;
  siteId?: string;
  endpoint: string;
  feature: string;
  aiEnabled: boolean;
  servedFromCache: boolean;
  providerCalled: boolean;
  responseStatus: number;
  durationMs: number;
}) {
  return prisma.usageEvent.create({
    data: {
      id: createId("use"),
      workspaceId: input.workspaceId,
      memberId: input.memberId,
      siteId: input.siteId,
      endpoint: input.endpoint,
      feature: input.feature,
      aiEnabled: input.aiEnabled,
      servedFromCache: input.servedFromCache,
      providerCalled: input.providerCalled,
      responseStatus: input.responseStatus,
      durationMs: input.durationMs
    }
  });
}

export async function publicMember(member: WorkspaceMember) {
  const user = await prisma.user.findUnique({
    where: { id: member.userId },
    select: { id: true, fullName: true, email: true }
  });

  return {
    ...member,
    user
  };
}

export async function publicMembers(members: WorkspaceMember[]) {
  const users = await prisma.user.findMany({
    where: { id: { in: members.map((member) => member.userId) } },
    select: { id: true, fullName: true, email: true }
  });
  const userById = new Map(users.map((user) => [user.id, user]));

  return members.map((member) => ({
    ...member,
    user: userById.get(member.userId) ?? null
  }));
}

export type AuthRole = MemberRole;
export type AuditLogWithActor = AuditLog & { actor?: WorkspaceMember | null };
