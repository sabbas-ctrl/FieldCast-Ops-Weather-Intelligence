import bcrypt from "bcryptjs";
import { z } from "zod";
import type { MemberRole } from "@prisma/client";
import { env } from "../../config/env.js";
import { invitationEmail, sendEmail } from "../../infrastructure/email/resend.js";
import { prisma } from "../../infrastructure/prisma/client.js";
import { HttpError } from "../../utils/http.js";
import { createId, hashToken } from "../../utils/id.js";
import { createAuditLog, publicMember, publicMembers } from "../db/helpers.js";

export const memberRoleSchema = z.enum(["ORG_OWNER", "IT_ADMIN", "OPS_ADMIN", "TEAM_MEMBER", "VIEWER"]);

function assertWorkspaceAccess(authWorkspaceId: string, requestedWorkspaceId: string) {
  if (authWorkspaceId !== requestedWorkspaceId) {
    throw new HttpError(403, "Cannot access another workspace");
  }
}

export async function currentWorkspace(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) {
    throw new HttpError(404, "Workspace not found");
  }

  const [siteCount, openIncidentCount, highRiskIncidentCount, memberCount, providerConnection] = await Promise.all([
    prisma.site.count({ where: { workspaceId } }),
    prisma.incident.count({ where: { workspaceId, status: { in: ["OPEN", "ACKNOWLEDGED"] } } }),
    prisma.incident.count({
      where: {
        workspaceId,
        severity: "HIGH",
        status: { not: "RESOLVED" }
      }
    }),
    prisma.workspaceMember.count({ where: { workspaceId } }),
    prisma.providerConnection.findFirst({ where: { workspaceId } })
  ]);

  return {
    workspace,
    stats: {
      siteCount,
      openIncidentCount,
      highRiskIncidentCount,
      memberCount
    },
    providerConnection: providerConnection
      ? {
          id: providerConnection.id,
          maskedKey: providerConnection.maskedKey,
          status: providerConnection.connectionStatus,
          capabilityTier: providerConnection.capabilityTier,
          forecastDays: providerConnection.forecastDays,
          webhooksEnabled: providerConnection.webhooksEnabled,
          smsEligible: providerConnection.smsEligible,
          smsApproved: providerConnection.smsApproved,
          lastVerifiedAt: providerConnection.lastVerifiedAt
        }
      : null
  };
}

export async function listMembers(authWorkspaceId: string, workspaceId: string) {
  assertWorkspaceAccess(authWorkspaceId, workspaceId);
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    orderBy: { joinedAt: "asc" }
  });
  return publicMembers(members);
}

export async function setWeatherUsageAccess(
  authWorkspaceId: string,
  actorMemberId: string,
  workspaceId: string,
  memberId: string,
  enabled: boolean
) {
  assertWorkspaceAccess(authWorkspaceId, workspaceId);
  const existing = await prisma.workspaceMember.findFirst({ where: { workspaceId, id: memberId } });
  if (!existing) {
    throw new HttpError(404, "Member not found");
  }
  const member = await prisma.workspaceMember.update({
    where: { id: memberId },
    data: { weatherUsageEnabled: enabled }
  });

  await createAuditLog({
    workspaceId,
    actorMemberId,
    action: enabled ? "member.weather_usage_enabled" : "member.weather_usage_disabled",
    targetType: "WorkspaceMember",
    targetId: memberId
  });
  return publicMember(member);
}

export async function suspendMember(authWorkspaceId: string, actorMemberId: string, workspaceId: string, memberId: string) {
  assertWorkspaceAccess(authWorkspaceId, workspaceId);
  const existing = await prisma.workspaceMember.findFirst({ where: { workspaceId, id: memberId } });
  if (!existing) {
    throw new HttpError(404, "Member not found");
  }
  if (existing.id === actorMemberId) {
    throw new HttpError(409, "You cannot suspend your own active membership");
  }

  const member = await prisma.workspaceMember.update({
    where: { id: memberId },
    data: { status: "SUSPENDED" }
  });
  await prisma.session.updateMany({
    where: { memberId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
  await createAuditLog({
    workspaceId,
    actorMemberId,
    action: "member.suspended",
    targetType: "WorkspaceMember",
    targetId: memberId
  });
  return publicMember(member);
}

export async function inviteMember(
  authWorkspaceId: string,
  actorMemberId: string,
  workspaceId: string,
  input: { email: string; role: MemberRole }
) {
  assertWorkspaceAccess(authWorkspaceId, workspaceId);
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace || workspace.type !== "ORGANISATION") {
    throw new HttpError(400, "Invitations are only available for organisation workspaces");
  }
  const actor = await prisma.workspaceMember.findUnique({
    where: { id: actorMemberId },
    include: { user: { select: { fullName: true } } }
  });
  const token = createId("inv");
  const inviteLink = `${env.WEB_APP_URL.replace(/\/$/, "")}/invite/${token}`;
  const invitation = await prisma.invitation.create({
    data: {
      id: createId("ivt"),
      workspaceId,
      email: input.email,
      role: input.role,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      createdBy: actorMemberId
    }
  });

  await createAuditLog({
    workspaceId,
    actorMemberId,
    action: "member.invited",
    targetType: "Invitation",
    targetId: invitation.id,
    metadataJson: { email: input.email, role: input.role }
  });

  const message = invitationEmail({
    workspaceName: workspace.name,
    role: invitation.role,
    inviteLink,
    inviterName: actor?.user.fullName
  });
  const emailDelivery = await sendEmail({
    to: invitation.email,
    subject: message.subject,
    html: message.html,
    text: message.text,
    idempotencyKey: `invitation:${invitation.id}`
  });

  return {
    invitation: {
      id: invitation.id,
      workspaceId: invitation.workspaceId,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      createdAt: invitation.createdAt
    },
    inviteLink,
    emailDelivery
  };
}

export async function acceptInvitation(input: {
  token: string;
  fullName: string;
  password: string;
}) {
  const tokenHash = hashToken(input.token);
  const invitation = await prisma.invitation.findFirst({ where: { tokenHash } });
  if (!invitation) {
    throw new HttpError(404, "Invitation not found");
  }
  if (invitation.acceptedAt) {
    throw new HttpError(409, "Invitation has already been accepted");
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    throw new HttpError(410, "Invitation has expired");
  }

  const user =
    (await prisma.user.findUnique({ where: { email: invitation.email } })) ??
    (await prisma.user.create({
      data: {
        id: createId("usr"),
        fullName: input.fullName,
        email: invitation.email,
        passwordHash: await bcrypt.hash(input.password, 10),
        status: "ACTIVE"
      }
    }));

  const existingMember = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id } }
  });
  const member =
    existingMember ??
    (await prisma.workspaceMember.create({
      data: {
        id: createId("mem"),
        workspaceId: invitation.workspaceId,
        userId: user.id,
        role: invitation.role,
        weatherUsageEnabled: true,
        status: "ACTIVE"
      }
    }));

  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { acceptedAt: new Date() }
  });

  await createAuditLog({
    workspaceId: invitation.workspaceId,
    actorMemberId: member.id,
    action: "member.invitation_accepted",
    targetType: "Invitation",
    targetId: invitation.id
  });

  return {
    member: await publicMember(member),
    workspace: await prisma.workspace.findUnique({ where: { id: invitation.workspaceId } })
  };
}
