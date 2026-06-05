import { z } from "zod";
import { prisma } from "../../infrastructure/prisma/client.js";
import { decryptApiKey, encryptApiKey, maskApiKey } from "../../infrastructure/encryption/apiKeyCrypto.js";
import { HttpError } from "../../utils/http.js";
import { createId } from "../../utils/id.js";
import { createAuditLog } from "../db/helpers.js";
import { fetchProviderUsage, resolveCapabilities } from "./weatherai.adapter.js";

export const apiKeySchema = z.string().regex(/^wai_[A-Za-z0-9_\-]{6,}$/u, "WeatherAI API keys must start with wai_");

export async function connectProvider(workspaceId: string, actorMemberId: string, apiKey: string) {
  const verifiedKey = apiKeySchema.parse(apiKey);
  const usage = await fetchProviderUsage(verifiedKey);
  const capabilities = resolveCapabilities(usage);
  const now = new Date();
  const existing = await prisma.providerConnection.findFirst({ where: { workspaceId } });

  const connection = existing
    ? await prisma.providerConnection.update({
        where: { id: existing.id },
        data: {
          encryptedApiKey: encryptApiKey(verifiedKey),
          maskedKey: maskApiKey(verifiedKey),
          connectionStatus: "ACTIVE",
          lastVerifiedAt: now,
          ...capabilities
        }
      })
    : await prisma.providerConnection.create({
        data: {
          id: createId("pvc"),
          workspaceId,
          providerName: "WeatherAI",
          encryptedApiKey: encryptApiKey(verifiedKey),
          maskedKey: maskApiKey(verifiedKey),
          connectionStatus: "ACTIVE",
          lastVerifiedAt: now,
          createdAt: now,
          ...capabilities
        }
      });

  await prisma.providerUsageSnapshot.create({
    data: {
      id: createId("pus"),
      workspaceId,
      requestsUsed: usage.requestsUsed,
      requestLimit: usage.requestLimit,
      aiRequestsUsed: usage.aiRequestsUsed,
      aiRequestLimit: usage.aiRequestLimit,
      periodStart: new Date(usage.periodStart),
      periodEnd: new Date(usage.periodEnd),
      capturedAt: now
    }
  });

  await createAuditLog({
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

export async function getProviderStatus(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) {
    throw new HttpError(404, "Workspace not found");
  }

  const connection = await prisma.providerConnection.findFirst({ where: { workspaceId } });
  const latestUsage = await getLatestUsage(workspaceId);

  if (!connection && workspace.providerMode === "PLATFORM_MANAGED") {
    const now = new Date();
    return {
      mode: "PLATFORM_MANAGED",
      connection: null,
      usage: {
        requestsUsed: 0,
        requestLimit: 1000,
        aiRequestsUsed: 0,
        aiRequestLimit: 200,
        periodStart: now,
        periodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        capturedAt: now
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
    connection: connection ? sanitizeConnection(connection) : null,
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

export async function getLatestUsage(workspaceId: string) {
  return prisma.providerUsageSnapshot.findFirst({
    where: { workspaceId },
    orderBy: { capturedAt: "desc" }
  });
}

export async function syncProviderUsage(workspaceId: string, actorMemberId: string) {
  const connection = await prisma.providerConnection.findFirst({
    where: { workspaceId, connectionStatus: "ACTIVE" }
  });
  if (!connection) {
    throw new HttpError(404, "No active provider connection found");
  }

  const apiKey =
    connection.encryptedApiKey === "demo-encrypted-key"
      ? "wai_demo_free_34bf"
      : decryptApiKey(connection.encryptedApiKey);
  const usage = await fetchProviderUsage(apiKey);
  const capabilities = resolveCapabilities(usage);
  const now = new Date();

  await prisma.providerConnection.update({
    where: { id: connection.id },
    data: {
      ...capabilities,
      lastVerifiedAt: now
    }
  });

  await prisma.providerUsageSnapshot.create({
    data: {
      id: createId("pus"),
      workspaceId,
      requestsUsed: usage.requestsUsed,
      requestLimit: usage.requestLimit,
      aiRequestsUsed: usage.aiRequestsUsed,
      aiRequestLimit: usage.aiRequestLimit,
      periodStart: new Date(usage.periodStart),
      periodEnd: new Date(usage.periodEnd),
      capturedAt: now
    }
  });

  await createAuditLog({
    workspaceId,
    actorMemberId,
    action: "provider.usage_synced",
    targetType: "ProviderConnection",
    targetId: connection.id
  });

  return getProviderStatus(workspaceId);
}

export async function disconnectProvider(workspaceId: string, actorMemberId: string) {
  const connection = await prisma.providerConnection.findFirst({ where: { workspaceId } });
  if (!connection) {
    throw new HttpError(404, "Provider connection not found");
  }

  await prisma.providerConnection.update({
    where: { id: connection.id },
    data: { connectionStatus: "DISCONNECTED" }
  });

  await createAuditLog({
    workspaceId,
    actorMemberId,
    action: "provider.disconnected",
    targetType: "ProviderConnection",
    targetId: connection.id
  });

  return getProviderStatus(workspaceId);
}

function sanitizeConnection<T extends { encryptedApiKey: string }>(connection: T) {
  const { encryptedApiKey: _encryptedApiKey, ...safeConnection } = connection;
  return safeConnection;
}
