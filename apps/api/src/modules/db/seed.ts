import bcrypt from "bcryptjs";
import { prisma } from "../../infrastructure/prisma/client.js";
import { createAuditLog, createDefaultRulesForSite } from "./helpers.js";

export async function seedDemoDataIfEmpty() {
  const existingUserCount = await prisma.user.count();
  if (existingUserCount > 0) {
    return;
  }

  const createdAt = new Date();
  const passwordHash = await bcrypt.hash("FieldCast123!", 10);
  const demoUserId = "usr_demo_admin";
  const demoWorkspaceId = "wks_demo_org";
  const demoMemberId = "mem_demo_admin";
  const personalWorkspaceId = "wks_demo_personal";
  const personalMemberId = "mem_demo_personal";

  await prisma.user.create({
    data: {
      id: demoUserId,
      fullName: "Demo Operations Admin",
      email: "demo@fieldcast.local",
      passwordHash,
      status: "ACTIVE",
      createdAt
    }
  });

  await prisma.workspace.createMany({
    data: [
      {
        id: demoWorkspaceId,
        name: "FieldCast Demo Organisation",
        type: "ORGANISATION",
        providerMode: "ORGANISATION_CONNECTED",
        country: "Pakistan",
        timezone: "Asia/Karachi",
        createdAt
      },
      {
        id: personalWorkspaceId,
        name: "Demo Personal Workspace",
        type: "PERSONAL",
        providerMode: "PLATFORM_MANAGED",
        country: "Pakistan",
        timezone: "Asia/Karachi",
        createdAt
      }
    ]
  });

  await prisma.workspaceMember.createMany({
    data: [
      {
        id: demoMemberId,
        workspaceId: demoWorkspaceId,
        userId: demoUserId,
        role: "ORG_OWNER",
        weatherUsageEnabled: true,
        status: "ACTIVE",
        joinedAt: createdAt
      },
      {
        id: personalMemberId,
        workspaceId: personalWorkspaceId,
        userId: demoUserId,
        role: "PERSONAL_OWNER",
        weatherUsageEnabled: true,
        status: "ACTIVE",
        joinedAt: createdAt
      }
    ]
  });

  const sites = [
    {
      id: "site_islamabad_ops",
      workspaceId: demoWorkspaceId,
      name: "Islamabad Outdoor Operations Site",
      description: "Maintenance and inspection unit for field teams.",
      siteType: "FIELD_WORK_SITE" as const,
      country: "Pakistan",
      latitude: 33.6844,
      longitude: 73.0479,
      timezone: "Asia/Karachi",
      units: "METRIC" as const,
      monitoringEnabled: true,
      createdBy: demoMemberId,
      createdAt
    },
    {
      id: "site_lahore_yard",
      workspaceId: demoWorkspaceId,
      name: "Lahore Distribution Yard",
      description: "Logistics staging and vehicle loading area.",
      siteType: "DELIVERY_HUB" as const,
      country: "Pakistan",
      latitude: 31.5204,
      longitude: 74.3587,
      timezone: "Asia/Karachi",
      units: "METRIC" as const,
      monitoringEnabled: true,
      createdBy: demoMemberId,
      createdAt
    },
    {
      id: "site_nairobi_field",
      workspaceId: demoWorkspaceId,
      name: "Nairobi Field Unit",
      description: "Regional outdoor work coordination point.",
      siteType: "FIELD_WORK_SITE" as const,
      country: "Kenya",
      latitude: -1.2921,
      longitude: 36.8219,
      timezone: "Africa/Nairobi",
      units: "METRIC" as const,
      monitoringEnabled: false,
      createdBy: demoMemberId,
      createdAt
    },
    {
      id: "site_bomet_plot",
      workspaceId: demoWorkspaceId,
      name: "Bomet Agricultural Plot",
      description: "Agronomic field demo site.",
      siteType: "FARM_PLANTATION" as const,
      country: "Kenya",
      latitude: -0.7813,
      longitude: 35.3416,
      timezone: "Africa/Nairobi",
      units: "METRIC" as const,
      monitoringEnabled: false,
      createdBy: demoMemberId,
      createdAt
    },
    {
      id: "site_personal_islamabad",
      workspaceId: personalWorkspaceId,
      name: "Islamabad Saved Location",
      siteType: "FIELD_WORK_SITE" as const,
      country: "Pakistan",
      latitude: 33.6844,
      longitude: 73.0479,
      timezone: "Asia/Karachi",
      units: "METRIC" as const,
      monitoringEnabled: false,
      createdBy: personalMemberId,
      createdAt
    }
  ];

  await prisma.site.createMany({ data: sites });
  for (const site of sites) {
    await createDefaultRulesForSite(site.workspaceId, site.id, site.createdBy);
  }

  await prisma.providerConnection.create({
    data: {
      id: "pvc_demo_weatherai",
      workspaceId: demoWorkspaceId,
      providerName: "WeatherAI",
      encryptedApiKey: "demo-encrypted-key",
      maskedKey: "wai_****************34bf",
      connectionStatus: "ACTIVE",
      capabilityTier: "FREE",
      requestLimit: 1000,
      aiRequestLimit: 200,
      forecastDays: 7,
      webhooksEnabled: false,
      smsEligible: false,
      smsApproved: false,
      lastVerifiedAt: createdAt,
      createdAt
    }
  });

  await prisma.providerUsageSnapshot.create({
    data: {
      id: "pus_demo_current",
      workspaceId: demoWorkspaceId,
      requestsUsed: 186,
      requestLimit: 1000,
      aiRequestsUsed: 12,
      aiRequestLimit: 200,
      periodStart: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12),
      periodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 18),
      capturedAt: createdAt
    }
  });

  await createAuditLog({
    workspaceId: demoWorkspaceId,
    actorMemberId: demoMemberId,
    action: "workspace.seeded",
    targetType: "Workspace",
    targetId: demoWorkspaceId,
    metadataJson: { source: "database-seed" }
  });
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  await seedDemoDataIfEmpty();
  await prisma.$disconnect();
}
