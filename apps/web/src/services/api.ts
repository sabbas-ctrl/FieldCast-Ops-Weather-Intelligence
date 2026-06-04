import type {
  AnalysisResult,
  AuditLog,
  AuthPayload,
  Incident,
  Member,
  ProviderStatus,
  RiskRule,
  Site,
  UsageSummary
} from "../types/domain";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const tokenKey = "fieldcast_access_token";

export function getStoredToken() {
  return localStorage.getItem(tokenKey);
}

export function storeToken(token: string) {
  localStorage.setItem(tokenKey, token);
}

export function clearToken() {
  localStorage.removeItem(tokenKey);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  async demoLogin() {
    const payload = await request<AuthPayload>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "demo@fieldcast.local", password: "FieldCast123!" })
    });
    storeToken(payload.accessToken);
    return payload;
  },
  async login(email: string, password: string) {
    const payload = await request<AuthPayload>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    storeToken(payload.accessToken);
    return payload;
  },
  async registerIndividual(input: {
    fullName: string;
    email: string;
    password: string;
    defaultLocation?: { name: string; country: string; latitude: number; longitude: number; timezone: string };
  }) {
    const payload = await request<AuthPayload>("/api/auth/register/individual", {
      method: "POST",
      body: JSON.stringify({ preferredUnits: "METRIC", ...input })
    });
    storeToken(payload.accessToken);
    return payload;
  },
  async registerOrganisation(input: {
    organisationName: string;
    adminFullName: string;
    adminEmail: string;
    password: string;
    country: string;
    timezone: string;
  }) {
    const payload = await request<AuthPayload>("/api/auth/register/organisation", {
      method: "POST",
      body: JSON.stringify(input)
    });
    storeToken(payload.accessToken);
    return payload;
  },
  me: () => request<AuthPayload>("/api/auth/me"),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  workspace: () => request<{ workspace: AuthPayload["workspace"]; stats: Record<string, number>; providerConnection: unknown }>("/api/workspaces/current"),
  sites: () => request<Site[]>("/api/sites"),
  createSite: (site: Partial<Site>) =>
    request<Site>("/api/sites", {
      method: "POST",
      body: JSON.stringify(site)
    }),
  rules: (siteId: string) => request<RiskRule[]>(`/api/sites/${siteId}/rules`),
  updateRule: (ruleId: string, input: Partial<RiskRule>) =>
    request<RiskRule>(`/api/rules/${ruleId}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    }),
  analyse: (siteId: string) =>
    request<AnalysisResult>(`/api/sites/${siteId}/analyse-working-windows`, {
      method: "POST",
      body: JSON.stringify({ days: 2 })
    }),
  incidents: () => request<Incident[]>("/api/incidents"),
  acknowledgeIncident: (incidentId: string) =>
    request<Incident>(`/api/incidents/${incidentId}/acknowledge`, { method: "PATCH" }),
  resolveIncident: (incidentId: string) => request<Incident>(`/api/incidents/${incidentId}/resolve`, { method: "PATCH" }),
  provider: () => request<ProviderStatus>("/api/provider/status"),
  connectProvider: (apiKey: string) =>
    request<ProviderStatus>("/api/provider/connect", {
      method: "POST",
      body: JSON.stringify({ apiKey })
    }),
  syncProvider: () => request<ProviderStatus>("/api/provider/usage/sync", { method: "POST" }),
  usageSummary: () => request<UsageSummary>("/api/usage/summary"),
  members: (workspaceId: string) => request<Member[]>(`/api/workspaces/${workspaceId}/members`),
  setWeatherUsage: (workspaceId: string, memberId: string, enabled: boolean) =>
    request<Member>(`/api/workspaces/${workspaceId}/members/${memberId}/usage-access`, {
      method: "PATCH",
      body: JSON.stringify({ enabled })
    }),
  invite: (workspaceId: string, email: string, role: string) =>
    request<{ inviteLink: string }>(`/api/workspaces/${workspaceId}/invitations`, {
      method: "POST",
      body: JSON.stringify({ email, role })
    }),
  auditLogs: () => request<AuditLog[]>("/api/audit-logs")
};
