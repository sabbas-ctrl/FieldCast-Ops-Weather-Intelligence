import { z } from "zod";
import { decryptApiKey, encryptApiKey, maskApiKey } from "../../infrastructure/encryption/apiKeyCrypto.js";
import { HttpError } from "../../utils/http.js";
import { createId } from "../../utils/id.js";
import { createAuditLog, store } from "../demo/store.js";
import type { ProviderConnection, ProviderUsageSnapshot } from "../demo/store.js";
import { fetchProviderUsage, resolveCapabilities } from "./weatherai.adapter.js";

export const apiKeySchema = z.string().regex(/^wai_[A-Za-z0-9_\-]{6,}$/u, "WeatherAI API keys must start with wai_");

export async function connectProvider(workspaceId: string, actorMemberId: string, apiKey: string) {
  const verifiedKey = apiKeySchema.parse(apiKey);
  const usage = await fetchProviderUsage(verifiedKey);
  const capabilities = resolveCapabilities(usage);
  const now = new Date().toISOString();

  const existing = store.providerConnections.find((connection) => connection.workspaceId === workspaceId);
  const connection: ProviderConnection = existing ?? {
    id: createId("pvc"),
    workspaceId,
    providerName: "WeatherAI",
    encryptedApiKey: "",
    maskedKey: "",
    connectionStatus: "ACTIVE",
    capabilityTier: "UNKNOWN",
    requestLimit: 0,
    aiRequestLimit: 0,
    forecastDays: 7,
    webhooksEnabled: false,
    smsEligible: false,
    smsApproved: false,
    lastVerifiedAt: now,
    createdAt: now
  };

  connection.encryptedApiKey = encryptApiKey(verifiedKey);
  connection.maskedKey = maskApiKey(verifiedKey);
  connection.connectionStatus = "ACTIVE";
  connection.lastVerifiedAt = now;
  Object.assign(connection, capabilities);

  if (!existing) {
    store.providerConnections.unshift(connection);
  }

  const snapshot: ProviderUsageSnapshot = {
    id: createId("pus"),
    workspaceId,
    requestsUsed: usage.requestsUsed,
    requestLimit: usage.requestLimit,
    aiRequestsUsed: usage.aiRequestsUsed,
    aiRequestLimit: usage.aiRequestLimit,
    periodStart: usage.periodStart,
    periodEnd: usage.periodEnd,
    capturedAt: now
  };
  store.providerUsageSnapshots.unshift(snapshot);

  createAuditLog({
    workspaceId,
    actorMemberId,
    action: existing ? "provider.key_replaced" : "provider.connected",
    targetType: "ProviderConnection",
    targetId: connection.id,
    metadataJson: {
      capabilityTier: capabilities.capabilityTier,
      requestLimit: capabilities.requestLimit,
      aiRequestLimit: capabilities.aiRequestLimit
    }
  });

  return getProviderStatus(workspaceId);
}

export function getProviderStatus(workspaceId: string) {
  const workspace = store.workspaces.find((candidate) => candidate.id === workspaceId);
  if (!workspace) {
    throw new HttpError(404, "Workspace not found");
  }

  const connection = store.providerConnections.find((candidate) => candidate.workspaceId === workspaceId);
  const latestUsage = getLatestUsage(workspaceId);

  if (!connection && workspace.providerMode === "PLATFORM_MANAGED") {
    return {
      mode: "PLATFORM_MANAGED",
      connection: null,
      usage: {
        requestsUsed: 0,
        requestLimit: 1000,
        aiRequestsUsed: 0,
        aiRequestLimit: 200,
        periodStart: new Date().toISOString(),
        periodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
        capturedAt: new Date().toISOString()
      },
      capabilities: {
        capabilityTier: "FREE",
        forecastDays: 7,
        webhooksEnabled: false,
        smsEligible: false,
        smsApproved: false
      }
    };
  }

  return {
    mode: workspace.providerMode,
    connection: connection ? sanitizeConnection(connection).connection : null,
    usage: latestUsage,
    capabilities: connection
      ? {
          capabilityTier: connection.capabilityTier,
          forecastDays: connection.forecastDays,
          webhooksEnabled: connection.webhooksEnabled,
          smsEligible: connection.smsEligible,
          smsApproved: connection.smsApproved
        }
      : null
  };
}

export function getLatestUsage(workspaceId: string) {
  return (
    store.providerUsageSnapshots
      .filter((snapshot) => snapshot.workspaceId === workspaceId)
      .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))[0] ?? null
  );
}

export async function syncProviderUsage(workspaceId: string, actorMemberId: string) {
  const connection = store.providerConnections.find(
    (candidate) => candidate.workspaceId === workspaceId && candidate.connectionStatus === "ACTIVE"
  );
  if (!connection) {
    throw new HttpError(404, "No active provider connection found");
  }

  const apiKey =
    connection.encryptedApiKey === "demo-encrypted-key"
      ? "wai_demo_free_34bf"
      : decryptApiKey(connection.encryptedApiKey);
  const usage = await fetchProviderUsage(apiKey);
  const capabilities = resolveCapabilities(usage);
  const now = new Date().toISOString();

  Object.assign(connection, capabilities, { lastVerifiedAt: now });

  const snapshot: ProviderUsageSnapshot = {
    id: createId("pus"),
    workspaceId,
    requestsUsed: usage.requestsUsed,
    requestLimit: usage.requestLimit,
    aiRequestsUsed: usage.aiRequestsUsed,
    aiRequestLimit: usage.aiRequestLimit,
    periodStart: usage.periodStart,
    periodEnd: usage.periodEnd,
    capturedAt: now
  };
  store.providerUsageSnapshots.unshift(snapshot);

  createAuditLog({
    workspaceId,
    actorMemberId,
    action: "provider.usage_synced",
    targetType: "ProviderConnection",
    targetId: connection.id
  });

  return getProviderStatus(workspaceId);
}

export function disconnectProvider(workspaceId: string, actorMemberId: string) {
  const connection = store.providerConnections.find((candidate) => candidate.workspaceId === workspaceId);
  if (!connection) {
    throw new HttpError(404, "Provider connection not found");
  }

  connection.connectionStatus = "DISCONNECTED";
  createAuditLog({
    workspaceId,
    actorMemberId,
    action: "provider.disconnected",
    targetType: "ProviderConnection",
    targetId: connection.id
  });

  return getProviderStatus(workspaceId);
}

function sanitizeConnection(connection: ProviderConnection, usage?: ProviderUsageSnapshot) {
  const { encryptedApiKey: _encryptedApiKey, ...safeConnection } = connection;
  return {
    connection: safeConnection,
    usage: usage ?? getLatestUsage(connection.workspaceId)
  };
}
