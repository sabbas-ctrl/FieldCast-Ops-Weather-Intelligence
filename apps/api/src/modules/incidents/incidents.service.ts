import { HttpError } from "../../utils/http.js";
import { createAuditLog, store } from "../demo/store.js";
import type { IncidentStatus } from "../demo/store.js";

export function listIncidents(
  workspaceId: string,
  filters: { siteId?: string; status?: IncidentStatus; severity?: string }
) {
  return store.incidents
    .filter((incident) => incident.workspaceId === workspaceId)
    .filter((incident) => (filters.siteId ? incident.siteId === filters.siteId : true))
    .filter((incident) => (filters.status ? incident.status === filters.status : true))
    .filter((incident) => (filters.severity ? incident.severity === filters.severity : true))
    .map((incident) => ({
      ...incident,
      site: store.sites.find((site) => site.id === incident.siteId) ?? null,
      rule: store.riskRules.find((rule) => rule.id === incident.ruleId) ?? null
    }));
}

export function getIncident(workspaceId: string, incidentId: string) {
  const incident = store.incidents.find(
    (candidate) => candidate.workspaceId === workspaceId && candidate.id === incidentId
  );
  if (!incident) {
    throw new HttpError(404, "Incident not found");
  }
  return {
    ...incident,
    site: store.sites.find((site) => site.id === incident.siteId) ?? null,
    rule: store.riskRules.find((rule) => rule.id === incident.ruleId) ?? null
  };
}

export function acknowledgeIncident(workspaceId: string, actorMemberId: string, incidentId: string) {
  const incident = store.incidents.find(
    (candidate) => candidate.workspaceId === workspaceId && candidate.id === incidentId
  );
  if (!incident) {
    throw new HttpError(404, "Incident not found");
  }
  if (incident.status === "RESOLVED" || incident.status === "DISMISSED") {
    throw new HttpError(409, "Incident is already closed");
  }

  incident.status = "ACKNOWLEDGED";
  incident.acknowledgedBy = actorMemberId;
  incident.acknowledgedAt = new Date().toISOString();
  createAuditLog({
    workspaceId,
    actorMemberId,
    action: "incident.acknowledged",
    targetType: "Incident",
    targetId: incident.id
  });
  return incident;
}

export function resolveIncident(workspaceId: string, actorMemberId: string, incidentId: string) {
  const incident = store.incidents.find(
    (candidate) => candidate.workspaceId === workspaceId && candidate.id === incidentId
  );
  if (!incident) {
    throw new HttpError(404, "Incident not found");
  }

  incident.status = "RESOLVED";
  incident.resolvedBy = actorMemberId;
  incident.resolvedAt = new Date().toISOString();
  createAuditLog({
    workspaceId,
    actorMemberId,
    action: "incident.resolved",
    targetType: "Incident",
    targetId: incident.id
  });
  return incident;
}
