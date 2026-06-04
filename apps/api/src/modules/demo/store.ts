import bcrypt from "bcryptjs";
import { createId, hashToken } from "../../utils/id.js";

export type WorkspaceType = "PERSONAL" | "ORGANISATION";
export type ProviderMode = "PLATFORM_MANAGED" | "ORGANISATION_CONNECTED";
export type MemberRole = "PERSONAL_OWNER" | "ORG_OWNER" | "IT_ADMIN" | "OPS_ADMIN" | "TEAM_MEMBER" | "VIEWER";
export type MemberStatus = "ACTIVE" | "SUSPENDED";
export type CapabilityTier = "FREE" | "PRO" | "SCALE" | "UNKNOWN";
export type SiteType =
  | "FIELD_WORK_SITE"
  | "FARM_PLANTATION"
  | "CONSTRUCTION_SITE"
  | "DELIVERY_HUB"
  | "EVENT_VENUE"
  | "CAMPUS_OUTDOOR_FACILITY"
  | "OTHER";
export type Units = "METRIC" | "IMPERIAL";
export type HazardType = "RAIN" | "HIGH_TEMPERATURE" | "HIGH_WIND" | "FROST";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IncidentStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";

export type User = {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
  status: "ACTIVE" | "DISABLED";
  createdAt: string;
};

export type Workspace = {
  id: string;
  name: string;
  type: WorkspaceType;
  providerMode: ProviderMode;
  country?: string;
  timezone: string;
  createdAt: string;
};

export type WorkspaceMember = {
  id: string;
  workspaceId: string;
  userId: string;
  role: MemberRole;
  weatherUsageEnabled: boolean;
  status: MemberStatus;
  joinedAt: string;
};

export type ProviderConnection = {
  id: string;
  workspaceId: string;
  providerName: "WeatherAI";
  encryptedApiKey: string;
  maskedKey: string;
  connectionStatus: "ACTIVE" | "DISCONNECTED" | "FAILED";
  capabilityTier: CapabilityTier;
  requestLimit: number;
  aiRequestLimit: number;
  forecastDays: number;
  webhooksEnabled: boolean;
  smsEligible: boolean;
  smsApproved: boolean;
  lastVerifiedAt: string;
  createdAt: string;
};

export type ProviderUsageSnapshot = {
  id: string;
  workspaceId: string;
  requestsUsed: number;
  requestLimit: number;
  aiRequestsUsed: number;
  aiRequestLimit: number;
  periodStart: string;
  periodEnd: string;
  capturedAt: string;
};

export type UsageEvent = {
  id: string;
  workspaceId: string;
  memberId?: string;
  siteId?: string;
  endpoint: string;
  feature: string;
  aiEnabled: boolean;
  servedFromCache: boolean;
  providerCalled: boolean;
  responseStatus: number;
  durationMs: number;
  createdAt: string;
};

export type Site = {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  siteType: SiteType;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
  units: Units;
  monitoringEnabled: boolean;
  createdBy?: string;
  createdAt: string;
};

export type RiskRule = {
  id: string;
  workspaceId: string;
  siteId: string;
  hazardType: HazardType;
  mediumThreshold: number;
  highThreshold: number;
  enabled: boolean;
  recommendation: string;
  createdBy?: string;
  createdAt: string;
};

export type Incident = {
  id: string;
  workspaceId: string;
  siteId: string;
  ruleId?: string;
  severity: Severity;
  title: string;
  reason: string;
  recommendation: string;
  forecastStart: string;
  forecastEnd: string;
  observedValue?: number;
  thresholdValue?: number;
  deduplicationKey: string;
  status: IncidentStatus;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
};

export type AuditLog = {
  id: string;
  workspaceId: string;
  actorMemberId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadataJson?: Record<string, unknown>;
  createdAt: string;
};

export type Invitation = {
  id: string;
  workspaceId: string;
  email: string;
  role: MemberRole;
  tokenHash: string;
  tokenPreview: string;
  expiresAt: string;
  acceptedAt?: string;
  createdBy: string;
  createdAt: string;
};

export type Session = {
  id: string;
  userId: string;
  memberId: string;
  refreshHash: string;
  revokedAt?: string;
  expiresAt: string;
  createdAt: string;
};

type Store = {
  users: User[];
  workspaces: Workspace[];
  members: WorkspaceMember[];
  providerConnections: ProviderConnection[];
  providerUsageSnapshots: ProviderUsageSnapshot[];
  usageEvents: UsageEvent[];
  sites: Site[];
  riskRules: RiskRule[];
  incidents: Incident[];
  auditLogs: AuditLog[];
  invitations: Invitation[];
  sessions: Session[];
};

const now = () => new Date().toISOString();

function addDefaultRules(store: Store, workspaceId: string, siteId: string, createdBy?: string) {
  const createdAt = now();
  const defaults: Array<Omit<RiskRule, "id" | "workspaceId" | "siteId" | "createdAt">> = [
    {
      hazardType: "RAIN",
      mediumThreshold: 40,
      highThreshold: 65,
      enabled: true,
      recommendation: "Postpone exposed outdoor work and equipment handling until rain probability drops."
    },
    {
      hazardType: "HIGH_TEMPERATURE",
      mediumThreshold: 33,
      highThreshold: 38,
      enabled: true,
      recommendation: "Move strenuous activity outside the hottest part of the day and increase hydration checks."
    },
    {
      hazardType: "HIGH_WIND",
      mediumThreshold: 25,
      highThreshold: 35,
      enabled: true,
      recommendation: "Restrict elevated work, temporary structures and equipment-heavy activity."
    },
    {
      hazardType: "FROST",
      mediumThreshold: 5,
      highThreshold: 2,
      enabled: true,
      recommendation: "Delay frost-sensitive activity until surface temperatures recover."
    }
  ];

  for (const rule of defaults) {
    store.riskRules.push({
      id: createId("rule"),
      workspaceId,
      siteId,
      createdBy,
      createdAt,
      ...rule
    });
  }
}

function seedStore(): Store {
  const demoUserId = "usr_demo_admin";
  const demoWorkspaceId = "wks_demo_org";
  const demoMemberId = "mem_demo_admin";
  const personalWorkspaceId = "wks_demo_personal";
  const personalMemberId = "mem_demo_personal";
  const createdAt = now();
  const passwordHash = bcrypt.hashSync("FieldCast123!", 10);

  const store: Store = {
    users: [
      {
        id: demoUserId,
        fullName: "Demo Operations Admin",
        email: "demo@fieldcast.local",
        passwordHash,
        status: "ACTIVE",
        createdAt
      }
    ],
    workspaces: [
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
    ],
    members: [
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
    ],
    providerConnections: [],
    providerUsageSnapshots: [],
    usageEvents: [],
    sites: [
      {
        id: "site_islamabad_ops",
        workspaceId: demoWorkspaceId,
        name: "Islamabad Outdoor Operations Site",
        description: "Maintenance and inspection unit for field teams.",
        siteType: "FIELD_WORK_SITE",
        country: "Pakistan",
        latitude: 33.6844,
        longitude: 73.0479,
        timezone: "Asia/Karachi",
        units: "METRIC",
        monitoringEnabled: true,
        createdBy: demoMemberId,
        createdAt
      },
      {
        id: "site_lahore_yard",
        workspaceId: demoWorkspaceId,
        name: "Lahore Distribution Yard",
        description: "Logistics staging and vehicle loading area.",
        siteType: "DELIVERY_HUB",
        country: "Pakistan",
        latitude: 31.5204,
        longitude: 74.3587,
        timezone: "Asia/Karachi",
        units: "METRIC",
        monitoringEnabled: true,
        createdBy: demoMemberId,
        createdAt
      },
      {
        id: "site_nairobi_field",
        workspaceId: demoWorkspaceId,
        name: "Nairobi Field Unit",
        description: "Regional outdoor work coordination point.",
        siteType: "FIELD_WORK_SITE",
        country: "Kenya",
        latitude: -1.2921,
        longitude: 36.8219,
        timezone: "Africa/Nairobi",
        units: "METRIC",
        monitoringEnabled: false,
        createdBy: demoMemberId,
        createdAt
      },
      {
        id: "site_bomet_plot",
        workspaceId: demoWorkspaceId,
        name: "Bomet Agricultural Plot",
        description: "Agronomic field demo site.",
        siteType: "FARM_PLANTATION",
        country: "Kenya",
        latitude: -0.7813,
        longitude: 35.3416,
        timezone: "Africa/Nairobi",
        units: "METRIC",
        monitoringEnabled: false,
        createdBy: demoMemberId,
        createdAt
      },
      {
        id: "site_personal_islamabad",
        workspaceId: personalWorkspaceId,
        name: "Islamabad Saved Location",
        siteType: "FIELD_WORK_SITE",
        country: "Pakistan",
        latitude: 33.6844,
        longitude: 73.0479,
        timezone: "Asia/Karachi",
        units: "METRIC",
        monitoringEnabled: false,
        createdBy: personalMemberId,
        createdAt
      }
    ],
    riskRules: [],
    incidents: [],
    auditLogs: [],
    invitations: [],
    sessions: []
  };

  for (const site of store.sites) {
    addDefaultRules(store, site.workspaceId, site.id, site.createdBy);
  }

  const connection: ProviderConnection = {
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
  };

  store.providerConnections.push(connection);
  store.providerUsageSnapshots.push({
    id: "pus_demo_current",
    workspaceId: demoWorkspaceId,
    requestsUsed: 186,
    requestLimit: 1000,
    aiRequestsUsed: 12,
    aiRequestLimit: 200,
    periodStart: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12).toISOString(),
    periodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 18).toISOString(),
    capturedAt: createdAt
  });

  store.auditLogs.push({
    id: createId("aud"),
    workspaceId: demoWorkspaceId,
    actorMemberId: demoMemberId,
    action: "workspace.seeded",
    targetType: "Workspace",
    targetId: demoWorkspaceId,
    metadataJson: { source: "demo" },
    createdAt
  });

  return store;
}

export const store = seedStore();

export function createDefaultRulesForSite(workspaceId: string, siteId: string, createdBy?: string) {
  addDefaultRules(store, workspaceId, siteId, createdBy);
}

export function createAuditLog(input: Omit<AuditLog, "id" | "createdAt">) {
  const auditLog: AuditLog = {
    id: createId("aud"),
    createdAt: now(),
    ...input
  };
  store.auditLogs.unshift(auditLog);
  return auditLog;
}

export function createUsageEvent(input: Omit<UsageEvent, "id" | "createdAt">) {
  const usageEvent: UsageEvent = {
    id: createId("use"),
    createdAt: now(),
    ...input
  };
  store.usageEvents.unshift(usageEvent);
  return usageEvent;
}

export function createInvitation(input: Omit<Invitation, "id" | "tokenHash" | "tokenPreview" | "createdAt">) {
  const token = createId("inv");
  const invitation: Invitation = {
    id: createId("ivt"),
    tokenHash: hashToken(token),
    tokenPreview: token,
    createdAt: now(),
    ...input
  };
  store.invitations.unshift(invitation);
  return { invitation, token };
}

export function publicMember(member: WorkspaceMember) {
  const user = store.users.find((candidate) => candidate.id === member.userId);
  return {
    ...member,
    user: user
      ? {
          id: user.id,
          fullName: user.fullName,
          email: user.email
        }
      : null
  };
}
