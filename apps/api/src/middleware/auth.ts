import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { store } from "../modules/demo/store.js";
import { HttpError } from "../utils/http.js";

type AccessTokenPayload = {
  userId: string;
  memberId: string;
  workspaceId: string;
  role: string;
};

export function signAccessToken(payload: AccessTokenPayload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: "20m" });
}

export function signRefreshToken(payload: Pick<AccessTokenPayload, "userId" | "memberId"> & { sessionId: string }) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: "14d" });
}

export function requireAuth(request: Request, _response: Response, next: NextFunction) {
  const header = request.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    return next(new HttpError(401, "Authentication required"));
  }

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    const member = store.members.find((candidate) => candidate.id === decoded.memberId);
    if (!member || member.status !== "ACTIVE") {
      return next(new HttpError(401, "Workspace membership is not active"));
    }

    request.auth = {
      userId: decoded.userId,
      memberId: decoded.memberId,
      workspaceId: decoded.workspaceId,
      role: member.role
    };
    return next();
  } catch {
    return next(new HttpError(401, "Invalid or expired access token"));
  }
}

export function optionalAuth(request: Request, _response: Response, next: NextFunction) {
  const header = request.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    const member = store.members.find((candidate) => candidate.id === decoded.memberId);
    if (member && member.status === "ACTIVE") {
      request.auth = {
        userId: decoded.userId,
        memberId: decoded.memberId,
        workspaceId: decoded.workspaceId,
        role: member.role
      };
    }
  } catch {
    // Anonymous access remains anonymous.
  }
  return next();
}
