export type WorkspaceType = "PERSONAL" | "ORGANISATION";
export type MemberRole = "PERSONAL_OWNER" | "ORG_OWNER" | "IT_ADMIN" | "OPS_ADMIN" | "TEAM_MEMBER" | "VIEWER";
export type SiteType =
  | "FIELD_WORK_SITE"
  | "FARM_PLANTATION"
  | "CONSTRUCTION_SITE"
  | "DELIVERY_HUB"
  | "EVENT_VENUE"
  | "CAMPUS_OUTDOOR_FACILITY"
  | "OTHER";
export type HazardType = "RAIN" | "HIGH_TEMPERATURE" | "HIGH_WIND" | "FROST";
export type IncidentStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";

export type User = {
  id: string;
  fullName: string;
  email: string;
  status: string;
};

export type Workspace = {
  id: string;
  name: string;
  type: WorkspaceType;
  providerMode: "PLATFORM_MANAGED" | "ORGANISATION_CONNECTED";
  country?: string;
  timezone: string;
  createdAt: string;
};

export type Member = {
  id: string;
  workspaceId: string;
  userId: string;
  role: MemberRole;
  weatherUsageEnabled: boolean;
  status: "ACTIVE" | "SUSPENDED";
  joinedAt: string;
  user?: Pick<User, "id" | "fullName" | "email"> | null;
};

export type AuthPayload = {
  accessToken: string;
  user: User;
  workspace: Workspace;
  member: Member;
  memberships: Array<Member & { workspace: Workspace | null }>;
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
  units: "METRIC" | "IMPERIAL";
  monitoringEnabled: boolean;
  ruleCount?: number;
  openIncidentCount?: number;
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
  createdAt: string;
};

export type Incident = {
  id: string;
  workspaceId: string;
  siteId: string;
  ruleId?: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  reason: string;
  recommendation: string;
  forecastStart: string;
  forecastEnd: string;
  observedValue?: number;
  thresholdValue?: number;
  status: IncidentStatus;
  createdAt: string;
  site?: Site | null;
};

export type ProviderStatus = {
  mode: "PLATFORM_MANAGED" | "ORGANISATION_CONNECTED";
  connection: {
    id: string;
    maskedKey: string;
    connectionStatus: string;
    capabilityTier: "FREE" | "PRO" | "SCALE" | "UNKNOWN";
    requestLimit: number;
    aiRequestLimit: number;
    forecastDays: number;
    webhooksEnabled: boolean;
    smsEligible: boolean;
    smsApproved: boolean;
    lastVerifiedAt: string;
  } | null;
  usage: {
    requestsUsed: number;
    requestLimit: number;
    aiRequestsUsed: number;
    aiRequestLimit: number;
    periodStart: string;
    periodEnd: string;
    capturedAt: string;
  } | null;
  capabilities: {
    capabilityTier: "FREE" | "PRO" | "SCALE" | "UNKNOWN";
    forecastDays: number;
    webhooksEnabled: boolean;
    smsEligible: boolean;
    smsApproved: boolean;
  } | null;
};

export type EvaluatedHour = {
  timestamp: string;
  temperatureC: number;
  precipitationProbability: number;
  windSpeedKph: number;
  condition: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
};

export type AnalysisResult = {
  site: Site;
  evaluatedHours: EvaluatedHour[];
  workingWindows: Array<{
    start: string;
    end: string;
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    summary: string;
    recommendation?: string;
  }>;
  hazardWindows: Array<{
    start: string;
    end: string;
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    summary: string;
    recommendation?: string;
  }>;
  incidentsCreated: Incident[];
  servedFromCache: boolean;
};

export type UsageSummary = {
  totalEvents: number;
  providerCalls: number;
  cacheHits: number;
  aiRequests: number;
  byFeature: Array<{ feature: string; count: number; providerCalls: number; cacheHits: number }>;
  byMember: Array<{ memberId: string; memberName: string; analyses: number; aiSummaries: number; lastActivity?: string }>;
};

export type AuditLog = {
  id: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadataJson?: Record<string, unknown>;
  createdAt: string;
};
