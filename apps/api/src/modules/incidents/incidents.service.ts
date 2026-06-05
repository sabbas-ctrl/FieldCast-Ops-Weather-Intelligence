import type { IncidentStatus, Severity } from "@prisma/client";
import { prisma } from "../../infrastructure/prisma/client.js";
import { HttpError } from "../../utils/http.js";
import { createAuditLog } from "../db/helpers.js";

export async function listIncidents(
  workspaceId: string,
  filters: { siteId?: string; status?: IncidentStatus; severity?: Severity }
) {
  return prisma.incident.findMany({
    where: {
      workspaceId,
      siteId: filters.siteId,
      status: filters.status,
      severity: filters.severity
    },
    include: {
      site: true,
      rule: true
    },
    orderBy: { createdAt: "desc" }
  });
}

export async function getIncident(workspaceId: string, incidentId: string) {
  const incident = await prisma.incident.findFirst({
    where: { workspaceId, id: incidentId },
    include: { site: true, rule: true }
  });
  if (!incident) {
    throw new HttpError(404, "Incident not found");
  }
  return incident;
}

export async function acknowledgeIncident(workspaceId: string, actorMemberId: string, incidentId: string) {
  const existing = await prisma.incident.findFirst({ where: { workspaceId, id: incidentId } });
  if (!existing) {
    throw new HttpError(404, "Incident not found");
  }
  if (existing.status === "RESOLVED" || existing.status === "DISMISSED") {
    throw new HttpError(409, "Incident is already closed");
  }

  const incident = await prisma.incident.update({
    where: { id: incidentId },
    data: {
      status: "ACKNOWLEDGED",
      acknowledgedBy: actorMemberId,
      acknowledgedAt: new Date()
    }
  });

  await prisma.incidentAction.create({
    data: {
      incidentId,
      memberId: actorMemberId,
      action: "ACKNOWLEDGED"
    }
  });

  await createAuditLog({
    workspaceId,
    actorMemberId,
    action: "incident.acknowledged",
    targetType: "Incident",
    targetId: incident.id
  });
  return incident;
}

export async function resolveIncident(workspaceId: string, actorMemberId: string, incidentId: string) {
  const existing = await prisma.incident.findFirst({ where: { workspaceId, id: incidentId } });
  if (!existing) {
    throw new HttpError(404, "Incident not found");
  }

  const incident = await prisma.incident.update({
    where: { id: incidentId },
    data: {
      status: "RESOLVED",
      resolvedBy: actorMemberId,
      resolvedAt: new Date()
    }
  });

  await prisma.incidentAction.create({
    data: {
      incidentId,
      memberId: actorMemberId,
      action: "RESOLVED"
    }
  });

  await createAuditLog({
    workspaceId,
    actorMemberId,
    action: "incident.resolved",
    targetType: "Incident",
    targetId: incident.id
  });
  return incident;
}
