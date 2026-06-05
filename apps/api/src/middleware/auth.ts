import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { prisma } from "../infrastructure/prisma/client.js";
import { HttpError } from "../utils/http.js";
import type { MemberRole } from "@prisma/client";

type AccessTokenPayload = {
  userId: string;
  memberId: string;
  workspaceId: string;
  role: MemberRole;
};

export function signAccessToken(payload: AccessTokenPayload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: "20m" });
}

export function signRefreshToken(payload: Pick<AccessTokenPayload, "userId" | "memberId"> & { sessionId: string }) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: "14d" });
}

export async function requireAuth(request: Request, _response: Response, next: NextFunction) {
  const header = request.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    return next(new HttpError(401, "Authentication required"));
  }

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    const member = await prisma.workspaceMember.findUnique({ where: { id: decoded.memberId } });
    if (!member || member.status !== "ACTIVE" || member.userId !== decoded.userId) {
      return next(new HttpError(401, "Workspace membership is not active"));
    }

    request.auth = {
      userId: decoded.userId,
      memberId: decoded.memberId,
      workspaceId: member.workspaceId,
      role: member.role
    };
    return next();
  } catch {
    return next(new HttpError(401, "Invalid or expired access token"));
  }
}

export async function optionalAuth(request: Request, _response: Response, next: NextFunction) {
  const header = request.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    const member = await prisma.workspaceMember.findUnique({ where: { id: decoded.memberId } });
    if (member && member.status === "ACTIVE" && member.userId === decoded.userId) {
      request.auth = {
        userId: decoded.userId,
        memberId: decoded.memberId,
        workspaceId: member.workspaceId,
        role: member.role
      };
    }
  } catch {
    // Anonymous access remains anonymous.
  }
  return next();
}
