import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { MemberRole, Units } from "@prisma/client";
import { env, isProduction } from "../../config/env.js";
import { prisma } from "../../infrastructure/prisma/client.js";
import { signAccessToken, signRefreshToken } from "../../middleware/auth.js";
import { createAuditLog, createDefaultRulesForSite, publicMember, publicMembers } from "../db/helpers.js";
import { HttpError } from "../../utils/http.js";
import { createId, hashToken } from "../../utils/id.js";

type CreateSessionInput = {
  userId: string;
  memberId: string;
  workspaceId: string;
  role: MemberRole;
};

export const refreshCookieName = "fieldcast_refresh";

export const refreshCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? ("none" as const) : ("lax" as const),
  path: "/api/auth",
  maxAge: 1000 * 60 * 60 * 24 * 14
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function serializeAuth(userId: string, memberId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const member = await prisma.workspaceMember.findUnique({ where: { id: memberId } });
  if (!user || !member) {
    throw new HttpError(401, "Invalid auth session");
  }

  const workspace = await prisma.workspace.findUnique({ where: { id: member.workspaceId } });
  if (!workspace) {
    throw new HttpError(401, "Workspace not found");
  }

  const membershipRows = await prisma.workspaceMember.findMany({
    where: { userId: user.id },
    orderBy: { joinedAt: "asc" }
  });
  const publicMemberships = await publicMembers(membershipRows);
  const workspaces = await prisma.workspace.findMany({
    where: { id: { in: membershipRows.map((candidate) => candidate.workspaceId) } }
  });
  const workspaceById = new Map(workspaces.map((candidate) => [candidate.id, candidate]));

  return {
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      status: user.status
    },
    workspace,
    member: await publicMember(member),
    memberships: publicMemberships.map((candidate) => ({
      ...candidate,
      workspace: workspaceById.get(candidate.workspaceId) ?? null
    }))
  };
}

async function createSession(input: CreateSessionInput) {
  const sessionId = createId("ses");
  const refreshToken = signRefreshToken({
    userId: input.userId,
    memberId: input.memberId,
    sessionId
  });

  await prisma.session.create({
    data: {
      id: sessionId,
      userId: input.userId,
      memberId: input.memberId,
      refreshHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    }
  });

  const accessToken = signAccessToken(input);
  return { accessToken, refreshToken };
}

export async function registerIndividual(input: {
  fullName: string;
  email: string;
  password: string;
  preferredUnits: Units;
  country?: string;
  timezone?: string;
  defaultLocation?: {
    name: string;
    country: string;
    latitude: number;
    longitude: number;
    timezone: string;
  };
}) {
  const email = normalizeEmail(input.email);
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new HttpError(409, "Email is already registered");
  }

  const userId = createId("usr");
  const workspaceId = createId("wks");
  const memberId = createId("mem");
  const passwordHash = await bcrypt.hash(input.password, 10);

  await prisma.user.create({
    data: {
      id: userId,
      fullName: input.fullName,
      email,
      passwordHash,
      memberships: {
        create: {
          id: memberId,
          workspace: {
            create: {
              id: workspaceId,
              name: `${input.fullName}'s Workspace`,
              type: "PERSONAL",
              providerMode: "PLATFORM_MANAGED",
              timezone: input.timezone ?? input.defaultLocation?.timezone ?? "UTC",
              country: input.country ?? input.defaultLocation?.country
            }
          },
          role: "PERSONAL_OWNER",
          weatherUsageEnabled: true,
          status: "ACTIVE"
        }
      }
    }
  });

  if (input.defaultLocation) {
    const site = await prisma.site.create({
      data: {
        id: createId("site"),
        workspaceId,
        name: input.defaultLocation.name,
        siteType: "FIELD_WORK_SITE",
        country: input.defaultLocation.country,
        latitude: input.defaultLocation.latitude,
        longitude: input.defaultLocation.longitude,
        timezone: input.defaultLocation.timezone,
        units: input.preferredUnits,
        monitoringEnabled: false,
        createdBy: memberId
      }
    });
    await createDefaultRulesForSite(workspaceId, site.id, memberId);
  }

  await createAuditLog({
    workspaceId,
    actorMemberId: memberId,
    action: "auth.register_individual",
    targetType: "Workspace",
    targetId: workspaceId
  });

  const tokens = await createSession({ userId, memberId, workspaceId, role: "PERSONAL_OWNER" });
  return {
    ...tokens,
    ...(await serializeAuth(userId, memberId))
  };
}

export async function registerOrganisation(input: {
  organisationName: string;
  industry?: string;
  adminFullName: string;
  adminEmail: string;
  password: string;
  country: string;
  timezone: string;
}) {
  const email = normalizeEmail(input.adminEmail);
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new HttpError(409, "Email is already registered");
  }

  const userId = createId("usr");
  const workspaceId = createId("wks");
  const memberId = createId("mem");
  const passwordHash = await bcrypt.hash(input.password, 10);

  await prisma.user.create({
    data: {
      id: userId,
      fullName: input.adminFullName,
      email,
      passwordHash,
      memberships: {
        create: {
          id: memberId,
          workspace: {
            create: {
              id: workspaceId,
              name: input.organisationName,
              type: "ORGANISATION",
              providerMode: "ORGANISATION_CONNECTED",
              country: input.country,
              timezone: input.timezone
            }
          },
          role: "ORG_OWNER",
          weatherUsageEnabled: true,
          status: "ACTIVE"
        }
      }
    }
  });

  await createAuditLog({
    workspaceId,
    actorMemberId: memberId,
    action: "auth.register_organisation",
    targetType: "Workspace",
    targetId: workspaceId,
    metadataJson: { industry: input.industry ?? "unspecified" }
  });

  const tokens = await createSession({ userId, memberId, workspaceId, role: "ORG_OWNER" });
  return {
    ...tokens,
    ...(await serializeAuth(userId, memberId))
  };
}

export async function login(input: { email: string; password: string; workspaceId?: string }) {
  const email = normalizeEmail(input.email);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new HttpError(401, "Invalid email or password");
  }

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    include: { workspace: true },
    orderBy: { joinedAt: "asc" }
  });

  const selectedMember =
    (input.workspaceId
      ? memberships.find((member) => member.workspaceId === input.workspaceId)
      : memberships.find((member) => member.workspace.type === "ORGANISATION")) ?? memberships[0];

  if (!selectedMember) {
    throw new HttpError(403, "No active workspace membership found");
  }

  const tokens = await createSession({
    userId: user.id,
    memberId: selectedMember.id,
    workspaceId: selectedMember.workspaceId,
    role: selectedMember.role
  });

  await createAuditLog({
    workspaceId: selectedMember.workspaceId,
    actorMemberId: selectedMember.id,
    action: "auth.login",
    targetType: "User",
    targetId: user.id
  });

  return {
    ...tokens,
    ...(await serializeAuth(user.id, selectedMember.id))
  };
}

export async function refresh(refreshToken?: string) {
  if (!refreshToken) {
    throw new HttpError(401, "Refresh cookie missing");
  }

  try {
    const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as {
      userId: string;
      memberId: string;
      sessionId: string;
    };
    const session = await prisma.session.findUnique({ where: { id: decoded.sessionId } });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() < Date.now() ||
      session.refreshHash !== hashToken(refreshToken)
    ) {
      throw new HttpError(401, "Refresh session is no longer valid");
    }

    const member = await prisma.workspaceMember.findUnique({ where: { id: decoded.memberId } });
    if (!member || member.status !== "ACTIVE" || member.userId !== decoded.userId) {
      throw new HttpError(401, "Workspace membership is not active");
    }

    const accessToken = signAccessToken({
      userId: decoded.userId,
      memberId: decoded.memberId,
      workspaceId: member.workspaceId,
      role: member.role
    });

    return {
      accessToken,
      ...(await serializeAuth(decoded.userId, decoded.memberId))
    };
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(401, "Invalid refresh token");
  }
}

export async function me(userId: string, memberId: string) {
  return serializeAuth(userId, memberId);
}

export async function logout(refreshToken?: string) {
  if (refreshToken) {
    await prisma.session.updateMany({
      where: { refreshHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }
}
