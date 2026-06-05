import type { NextFunction, Request, Response } from "express";
import type { MemberRole } from "@prisma/client";
import { HttpError } from "../utils/http.js";

export type Permission =
  | "workspace.manage"
  | "members.invite"
  | "members.view"
  | "members.revoke"
  | "provider.connect"
  | "provider.replace_key"
  | "provider.disconnect"
  | "provider.view_usage"
  | "sites.create"
  | "sites.update"
  | "sites.delete"
  | "sites.view"
  | "rules.create"
  | "rules.update"
  | "rules.delete"
  | "rules.view"
  | "incidents.view"
  | "incidents.acknowledge"
  | "incidents.resolve"
  | "monitoring.run"
  | "monitoring.configure"
  | "audit.view"
  | "sessions.revoke_self"
  | "sessions.revoke_member"
  | "sessions.revoke_workspace";

const rolePermissions: Record<MemberRole, Permission[]> = {
  PERSONAL_OWNER: [
    "provider.view_usage",
    "sites.create",
    "sites.update",
    "sites.delete",
    "sites.view",
    "rules.create",
    "rules.update",
    "rules.delete",
    "rules.view",
    "incidents.view",
    "incidents.acknowledge",
    "incidents.resolve",
    "monitoring.run",
    "sessions.revoke_self"
  ],
  ORG_OWNER: [
    "workspace.manage",
    "members.invite",
    "members.view",
    "members.revoke",
    "provider.connect",
    "provider.replace_key",
    "provider.disconnect",
    "provider.view_usage",
    "sites.create",
    "sites.update",
    "sites.delete",
    "sites.view",
    "rules.create",
    "rules.update",
    "rules.delete",
    "rules.view",
    "incidents.view",
    "incidents.acknowledge",
    "incidents.resolve",
    "monitoring.run",
    "monitoring.configure",
    "audit.view",
    "sessions.revoke_self",
    "sessions.revoke_member",
    "sessions.revoke_workspace"
  ],
  IT_ADMIN: [
    "members.view",
    "members.revoke",
    "provider.connect",
    "provider.replace_key",
    "provider.disconnect",
    "provider.view_usage",
    "sites.view",
    "rules.view",
    "incidents.view",
    "audit.view",
    "sessions.revoke_self",
    "sessions.revoke_member",
    "sessions.revoke_workspace"
  ],
  OPS_ADMIN: [
    "members.view",
    "provider.view_usage",
    "sites.create",
    "sites.update",
    "sites.delete",
    "sites.view",
    "rules.create",
    "rules.update",
    "rules.delete",
    "rules.view",
    "incidents.view",
    "incidents.acknowledge",
    "incidents.resolve",
    "monitoring.run",
    "monitoring.configure",
    "audit.view",
    "sessions.revoke_self"
  ],
  TEAM_MEMBER: [
    "sites.view",
    "rules.view",
    "incidents.view",
    "incidents.acknowledge",
    "monitoring.run",
    "sessions.revoke_self"
  ],
  VIEWER: ["sites.view", "rules.view", "incidents.view", "provider.view_usage", "sessions.revoke_self"]
};

export function hasPermission(role: MemberRole, permission: Permission) {
  return rolePermissions[role].includes(permission);
}

export function requirePermission(permission: Permission) {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!request.auth) {
      return next(new HttpError(401, "Authentication required"));
    }

    if (!hasPermission(request.auth.role, permission)) {
      return next(new HttpError(403, `Missing permission: ${permission}`));
    }

    return next();
  };
}
