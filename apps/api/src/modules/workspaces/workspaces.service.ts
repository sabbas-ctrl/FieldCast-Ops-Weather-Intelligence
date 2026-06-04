import bcrypt from "bcryptjs";
import { z } from "zod";
import { env } from "../../config/env.js";
import { HttpError } from "../../utils/http.js";
import { createId, hashToken } from "../../utils/id.js";
import { createAuditLog, createInvitation, publicMember, store } from "../demo/store.js";
import type { MemberRole } from "../demo/store.js";

export const memberRoleSchema = z.enum(["ORG_OWNER", "IT_ADMIN", "OPS_ADMIN", "TEAM_MEMBER", "VIEWER"]);

function assertWorkspaceAccess(authWorkspaceId: string, requestedWorkspaceId: string) {
  if (authWorkspaceId !== requestedWorkspaceId) {
    throw new HttpError(403, "Cannot access another workspace");
  }
}

export function currentWorkspace(workspaceId: string) {
  const workspace = store.workspaces.find((candidate) => candidate.id === workspaceId);
  if (!workspace) {
    throw new HttpError(404, "Workspace not found");
  }

  const sites = store.sites.filter((site) => site.workspaceId === workspaceId);
  const incidents = store.incidents.filter((incident) => incident.workspaceId === workspaceId);
  const providerConnection = store.providerConnections.find((connection) => connection.workspaceId === workspaceId);

  return {
    workspace,
    stats: {
      siteCount: sites.length,
      openIncidentCount: incidents.filter((incident) => ["OPEN", "ACKNOWLEDGED"].includes(incident.status)).length,
      highRiskIncidentCount: incidents.filter((incident) => incident.severity === "HIGH" && incident.status !== "RESOLVED").length,
      memberCount: store.members.filter((member) => member.workspaceId === workspaceId).length
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

export function listMembers(authWorkspaceId: string, workspaceId: string) {
  assertWorkspaceAccess(authWorkspaceId, workspaceId);
  return store.members.filter((member) => member.workspaceId === workspaceId).map(publicMember);
}

export function setWeatherUsageAccess(
  authWorkspaceId: string,
  actorMemberId: string,
  workspaceId: string,
  memberId: string,
  enabled: boolean
) {
  assertWorkspaceAccess(authWorkspaceId, workspaceId);
  const member = store.members.find((candidate) => candidate.workspaceId === workspaceId && candidate.id === memberId);
  if (!member) {
    throw new HttpError(404, "Member not found");
  }
  member.weatherUsageEnabled = enabled;
  createAuditLog({
    workspaceId,
    actorMemberId,
    action: enabled ? "member.weather_usage_enabled" : "member.weather_usage_disabled",
    targetType: "WorkspaceMember",
    targetId: memberId
  });
  return publicMember(member);
}

export function suspendMember(authWorkspaceId: string, actorMemberId: string, workspaceId: string, memberId: string) {
  assertWorkspaceAccess(authWorkspaceId, workspaceId);
  const member = store.members.find((candidate) => candidate.workspaceId === workspaceId && candidate.id === memberId);
  if (!member) {
    throw new HttpError(404, "Member not found");
  }
  if (member.id === actorMemberId) {
    throw new HttpError(409, "You cannot suspend your own active membership");
  }

  member.status = "SUSPENDED";
  for (const session of store.sessions.filter((candidate) => candidate.memberId === memberId)) {
    session.revokedAt = new Date().toISOString();
  }
  createAuditLog({
    workspaceId,
    actorMemberId,
    action: "member.suspended",
    targetType: "WorkspaceMember",
    targetId: memberId
  });
  return publicMember(member);
}

export function inviteMember(
  authWorkspaceId: string,
  actorMemberId: string,
  workspaceId: string,
  input: { email: string; role: MemberRole }
) {
  assertWorkspaceAccess(authWorkspaceId, workspaceId);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  const { invitation, token } = createInvitation({
    workspaceId,
    email: input.email.toLowerCase(),
    role: input.role,
    expiresAt,
    createdBy: actorMemberId
  });

  createAuditLog({
    workspaceId,
    actorMemberId,
    action: "member.invited",
    targetType: "Invitation",
    targetId: invitation.id,
    metadataJson: { email: input.email, role: input.role }
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
    inviteLink: `${env.WEB_APP_URL.replace(/\/$/, "")}/invite/${token}`
  };
}

export async function acceptInvitation(input: {
  token: string;
  fullName: string;
  password: string;
}) {
  const tokenHash = hashToken(input.token);
  const invitation = store.invitations.find((candidate) => candidate.tokenHash === tokenHash);
  if (!invitation) {
    throw new HttpError(404, "Invitation not found");
  }
  if (invitation.acceptedAt) {
    throw new HttpError(409, "Invitation has already been accepted");
  }
  if (new Date(invitation.expiresAt).getTime() < Date.now()) {
    throw new HttpError(410, "Invitation has expired");
  }

  const existingUser = store.users.find((candidate) => candidate.email === invitation.email);
  const user =
    existingUser ??
    {
      id: createId("usr"),
      fullName: input.fullName,
      email: invitation.email,
      passwordHash: await bcrypt.hash(input.password, 10),
      status: "ACTIVE" as const,
      createdAt: new Date().toISOString()
    };

  if (!existingUser) {
    store.users.push(user);
  }

  const existingMember = store.members.find(
    (member) => member.workspaceId === invitation.workspaceId && member.userId === user.id
  );
  const member =
    existingMember ??
    {
      id: createId("mem"),
      workspaceId: invitation.workspaceId,
      userId: user.id,
      role: invitation.role,
      weatherUsageEnabled: true,
      status: "ACTIVE" as const,
      joinedAt: new Date().toISOString()
    };

  if (!existingMember) {
    store.members.push(member);
  }

  invitation.acceptedAt = new Date().toISOString();
  createAuditLog({
    workspaceId: invitation.workspaceId,
    actorMemberId: member.id,
    action: "member.invitation_accepted",
    targetType: "Invitation",
    targetId: invitation.id
  });

  return {
    member: publicMember(member),
    workspace: store.workspaces.find((workspace) => workspace.id === invitation.workspaceId) ?? null
  };
}
