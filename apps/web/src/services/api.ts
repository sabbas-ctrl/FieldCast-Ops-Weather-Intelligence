import type {
  AnalysisResult,
  AuditLog,
  AuthPayload,
  Incident,
  LocationResult,
  Member,
  ProviderStatus,
  RiskRule,
  Site,
  UsageSummary
} from "../types/domain";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const tokenKey = "fieldcast_access_token";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export function getStoredToken() {
  return localStorage.getItem(tokenKey);
}

export function storeToken(token: string) {
  localStorage.setItem(tokenKey, token);
}

export function clearToken() {
  localStorage.removeItem(tokenKey);
}

async function refreshAccessToken() {
  const response = await fetch(`${API_URL}/api/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    clearToken();
    throw new ApiError("Session expired. Please sign in again.", response.status);
  }

  const payload = (await response.json()) as AuthPayload;
  storeToken(payload.accessToken);
  return payload.accessToken;
}

async function request<T>(path: string, options: RequestInit = {}, retryOnUnauthorized = true): Promise<T> {
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

  if (response.status === 401 && retryOnUnauthorized && token && path !== "/api/auth/refresh") {
    await refreshAccessToken();
    return request<T>(path, options, false);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(payload?.error ?? `Request failed with ${response.status}`, response.status);
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
    country?: string;
    timezone?: string;
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
    industry?: string;
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
  auditLogs: () => request<AuditLog[]>("/api/audit-logs"),
  searchLocations: (query: string, countryCode?: string) => {
    const params = new URLSearchParams({ q: query });
    if (countryCode) {
      params.set("countryCode", countryCode);
    }
    return request<{ provider: string; attribution: string; results: LocationResult[] }>(`/api/locations/search?${params.toString()}`);
  }
};
