import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env, isProduction } from "../../config/env.js";
import { signAccessToken, signRefreshToken } from "../../middleware/auth.js";
import { createAuditLog, createDefaultRulesForSite, publicMember, store } from "../demo/store.js";
import type { MemberRole, Session, Site, Units } from "../demo/store.js";
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

function serializeAuth(userId: string, memberId: string) {
  const user = store.users.find((candidate) => candidate.id === userId);
  const member = store.members.find((candidate) => candidate.id === memberId);
  if (!user || !member) {
    throw new HttpError(401, "Invalid auth session");
  }

  const workspace = store.workspaces.find((candidate) => candidate.id === member.workspaceId);
  if (!workspace) {
    throw new HttpError(401, "Workspace not found");
  }

  const memberships = store.members
    .filter((candidate) => candidate.userId === user.id)
    .map((candidate) => {
      const candidateWorkspace = store.workspaces.find((workspaceItem) => workspaceItem.id === candidate.workspaceId);
      return {
        ...publicMember(candidate),
        workspace: candidateWorkspace ?? null
      };
    });

  return {
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      status: user.status
    },
    workspace,
    member: publicMember(member),
    memberships
  };
}

function createSession(input: CreateSessionInput) {
  const sessionId = createId("ses");
  const refreshToken = signRefreshToken({
    userId: input.userId,
    memberId: input.memberId,
    sessionId
  });

  const session: Session = {
    id: sessionId,
    userId: input.userId,
    memberId: input.memberId,
    refreshHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
    createdAt: new Date().toISOString()
  };
  store.sessions.push(session);

  const accessToken = signAccessToken(input);
  return { accessToken, refreshToken };
}

export async function registerIndividual(input: {
  fullName: string;
  email: string;
  password: string;
  preferredUnits: Units;
  defaultLocation?: {
    name: string;
    country: string;
    latitude: number;
    longitude: number;
    timezone: string;
  };
}) {
  const email = normalizeEmail(input.email);
  if (store.users.some((user) => user.email === email)) {
    throw new HttpError(409, "Email is already registered");
  }

  const userId = createId("usr");
  const workspaceId = createId("wks");
  const memberId = createId("mem");
  const createdAt = new Date().toISOString();
  const passwordHash = await bcrypt.hash(input.password, 10);

  store.users.push({
    id: userId,
    fullName: input.fullName,
    email,
    passwordHash,
    status: "ACTIVE",
    createdAt
  });

  store.workspaces.push({
    id: workspaceId,
    name: `${input.fullName}'s Workspace`,
    type: "PERSONAL",
    providerMode: "PLATFORM_MANAGED",
    timezone: input.defaultLocation?.timezone ?? "UTC",
    country: input.defaultLocation?.country,
    createdAt
  });

  store.members.push({
    id: memberId,
    workspaceId,
    userId,
    role: "PERSONAL_OWNER",
    weatherUsageEnabled: true,
    status: "ACTIVE",
    joinedAt: createdAt
  });

  if (input.defaultLocation) {
    const site: Site = {
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
      createdBy: memberId,
      createdAt
    };
    store.sites.push(site);
    createDefaultRulesForSite(workspaceId, site.id, memberId);
  }

  createAuditLog({
    workspaceId,
    actorMemberId: memberId,
    action: "auth.register_individual",
    targetType: "Workspace",
    targetId: workspaceId
  });

  const tokens = createSession({ userId, memberId, workspaceId, role: "PERSONAL_OWNER" });
  return {
    ...tokens,
    ...serializeAuth(userId, memberId)
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
  if (store.users.some((user) => user.email === email)) {
    throw new HttpError(409, "Email is already registered");
  }

  const userId = createId("usr");
  const workspaceId = createId("wks");
  const memberId = createId("mem");
  const createdAt = new Date().toISOString();
  const passwordHash = await bcrypt.hash(input.password, 10);

  store.users.push({
    id: userId,
    fullName: input.adminFullName,
    email,
    passwordHash,
    status: "ACTIVE",
    createdAt
  });

  store.workspaces.push({
    id: workspaceId,
    name: input.organisationName,
    type: "ORGANISATION",
    providerMode: "ORGANISATION_CONNECTED",
    country: input.country,
    timezone: input.timezone,
    createdAt
  });

  store.members.push({
    id: memberId,
    workspaceId,
    userId,
    role: "ORG_OWNER",
    weatherUsageEnabled: true,
    status: "ACTIVE",
    joinedAt: createdAt
  });

  createAuditLog({
    workspaceId,
    actorMemberId: memberId,
    action: "auth.register_organisation",
    targetType: "Workspace",
    targetId: workspaceId,
    metadataJson: { industry: input.industry ?? "unspecified" }
  });

  const tokens = createSession({ userId, memberId, workspaceId, role: "ORG_OWNER" });
  return {
    ...tokens,
    ...serializeAuth(userId, memberId)
  };
}

export async function login(input: { email: string; password: string; workspaceId?: string }) {
  const email = normalizeEmail(input.email);
  const user = store.users.find((candidate) => candidate.email === email);
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new HttpError(401, "Invalid email or password");
  }

  const memberships = store.members.filter(
    (member) => member.userId === user.id && member.status === "ACTIVE"
  );
  const selectedMember =
    (input.workspaceId
      ? memberships.find((member) => member.workspaceId === input.workspaceId)
      : memberships.find((member) => {
          const workspace = store.workspaces.find((candidate) => candidate.id === member.workspaceId);
          return workspace?.type === "ORGANISATION";
        })) ?? memberships[0];

  if (!selectedMember) {
    throw new HttpError(403, "No active workspace membership found");
  }

  const tokens = createSession({
    userId: user.id,
    memberId: selectedMember.id,
    workspaceId: selectedMember.workspaceId,
    role: selectedMember.role
  });

  createAuditLog({
    workspaceId: selectedMember.workspaceId,
    actorMemberId: selectedMember.id,
    action: "auth.login",
    targetType: "User",
    targetId: user.id
  });

  return {
    ...tokens,
    ...serializeAuth(user.id, selectedMember.id)
  };
}

export function refresh(refreshToken?: string) {
  if (!refreshToken) {
    throw new HttpError(401, "Refresh cookie missing");
  }

  try {
    const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as {
      userId: string;
      memberId: string;
      sessionId: string;
    };
    const session = store.sessions.find((candidate) => candidate.id === decoded.sessionId);
    if (!session || session.revokedAt || session.refreshHash !== hashToken(refreshToken)) {
      throw new HttpError(401, "Refresh session is no longer valid");
    }

    const member = store.members.find((candidate) => candidate.id === decoded.memberId);
    if (!member || member.status !== "ACTIVE") {
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
      ...serializeAuth(decoded.userId, decoded.memberId)
    };
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(401, "Invalid refresh token");
  }
}

export function me(userId: string, memberId: string) {
  return serializeAuth(userId, memberId);
}

export function logout(refreshToken?: string) {
  if (refreshToken) {
    const session = store.sessions.find((candidate) => candidate.refreshHash === hashToken(refreshToken));
    if (session) {
      session.revokedAt = new Date().toISOString();
    }
  }
}
