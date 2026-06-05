import type {
  AnalysisResult,
  AuditLog,
  AuthPayload,
  ForecastResult,
  Incident,
  LocationResult,
  Member,
  ProviderStatus,
  RiskRule,
  Site,
  UsageSummary,
  WeatherAiCapabilities
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

async function requestForm<T>(path: string, formData: FormData, retryOnUnauthorized = true): Promise<T> {
  const token = getStoredToken();
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData
  });

  if (response.status === 401 && retryOnUnauthorized && token) {
    await refreshAccessToken();
    return requestForm<T>(path, formData, false);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(payload?.error ?? `Request failed with ${response.status}`, response.status);
  }

  return (await response.json()) as T;
}

function weatherAiParams(input: {
  siteId?: string;
  lat?: number;
  lon?: number;
  days?: number;
  ai?: boolean;
  units?: "metric" | "imperial";
  lang?: string;
  ip?: string;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  return params.toString();
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
  forecast: (siteId: string, days = 7) => request<ForecastResult>(`/api/sites/${siteId}/forecast?${new URLSearchParams({ days: String(days) }).toString()}`),
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
  weatherAiCapabilities: () => request<WeatherAiCapabilities>("/api/weatherai/capabilities"),
  weatherAiWeather: (input: { siteId?: string; lat?: number; lon?: number; days?: number; ai?: boolean; units?: "metric" | "imperial"; lang?: string }) =>
    request<unknown>(`/api/weatherai/weather?${weatherAiParams(input)}`),
  weatherAiForecast: (input: { siteId?: string; lat?: number; lon?: number; days?: number; ai?: boolean; units?: "metric" | "imperial"; lang?: string }) =>
    request<unknown>(`/api/weatherai/forecast?${weatherAiParams(input)}`),
  weatherAiWeatherGeo: (input: { siteId?: string; lat?: number; lon?: number; ip?: string; days?: number; ai?: boolean; units?: "metric" | "imperial"; lang?: string }) =>
    request<unknown>(`/api/weatherai/weather-geo?${weatherAiParams(input)}`),
  weatherAiIpLookup: (ip = "auto") => request<unknown>(`/api/weatherai/ip-lookup?${new URLSearchParams({ ip }).toString()}`),
  weatherAiWebhooks: () => request<unknown>("/api/weatherai/webhooks"),
  weatherAiCreateWebhook: (input: { url: string; siteId?: string; lat?: number; lon?: number; triggers: string[]; timezone?: string }) =>
    request<unknown>("/api/weatherai/webhooks", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  weatherAiDeleteWebhook: (webhookId: string) =>
    request<unknown>(`/api/weatherai/webhooks/${encodeURIComponent(webhookId)}`, { method: "DELETE" }),
  weatherAiSmsSend: (input: { to: string; message: string; type?: string; pilotTag?: string }) =>
    request<unknown>("/api/weatherai/sms/send", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  weatherAiSmsAlert: (input: { to: string; alertType: string; data?: Record<string, unknown> }) =>
    request<unknown>("/api/weatherai/sms/alert", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  weatherAiBometRegister: (input: { phone: string; name: string; location?: string; cropType?: string }) =>
    request<unknown>("/api/weatherai/sms/bomet/register", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  weatherAiSmsStats: () => request<unknown>("/api/weatherai/sms/stats"),
  weatherAiSmsHealth: () => request<unknown>("/api/weatherai/sms/health"),
  weatherAiTreeHistory: () => request<unknown>("/api/weatherai/trees/history"),
  weatherAiTreeQuota: () => request<unknown>("/api/weatherai/trees/quota"),
  weatherAiTreeAnalyze: (formData: FormData) => requestForm<unknown>("/api/weatherai/trees/analyze", formData),
  searchLocations: (query: string, countryCode?: string) => {
    const params = new URLSearchParams({ q: query });
    if (countryCode) {
      params.set("countryCode", countryCode);
    }
    return request<{ provider: string; attribution: string; results: LocationResult[] }>(`/api/locations/search?${params.toString()}`);
  }
};
