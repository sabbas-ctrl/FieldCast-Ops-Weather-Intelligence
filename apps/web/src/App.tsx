import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CloudSun,
  KeyRound,
  LogOut,
  MapPin,
  Play,
  RefreshCw,
  Shield,
  SlidersHorizontal,
  UserPlus,
  Users
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Button } from "./components/ui/Button";
import { Field, SelectInput, TextInput } from "./components/ui/FormField";
import { Panel } from "./components/ui/Panel";
import { ProgressBar } from "./components/ui/ProgressBar";
import { RiskBadge } from "./components/ui/RiskBadge";
import { Stat } from "./components/ui/Stat";
import { api, clearToken, getStoredToken } from "./services/api";
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
} from "./types/domain";

type View = "overview" | "sites" | "rules" | "incidents" | "provider" | "members" | "audit";

const siteTemplates = [
  {
    label: "Islamabad Outdoor Operations",
    name: "Islamabad Outdoor Operations Site",
    description: "Maintenance and inspection unit for field teams.",
    siteType: "FIELD_WORK_SITE",
    country: "Pakistan",
    latitude: 33.6844,
    longitude: 73.0479,
    timezone: "Asia/Karachi",
    units: "METRIC",
    monitoringEnabled: true
  },
  {
    label: "Lahore Distribution Yard",
    name: "Lahore Distribution Yard",
    description: "Logistics staging and vehicle loading area.",
    siteType: "DELIVERY_HUB",
    country: "Pakistan",
    latitude: 31.5204,
    longitude: 74.3587,
    timezone: "Asia/Karachi",
    units: "METRIC",
    monitoringEnabled: true
  },
  {
    label: "Bomet Agricultural Plot",
    name: "Bomet Agricultural Plot",
    description: "Agronomic field demo site.",
    siteType: "FARM_PLANTATION",
    country: "Kenya",
    latitude: -0.7813,
    longitude: 35.3416,
    timezone: "Africa/Nairobi",
    units: "METRIC",
    monitoringEnabled: false
  }
] as const;

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric"
  }).format(new Date(value));
}

function formatDate(value?: string) {
  if (!value) {
    return "Not available";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function AuthScreen({ onAuthed }: { onAuthed: (payload: AuthPayload) => void }) {
  const [mode, setMode] = useState<"login" | "individual" | "organisation">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    try {
      if (mode === "login") {
        onAuthed(await api.login(String(form.get("email")), String(form.get("password"))));
      } else if (mode === "individual") {
        onAuthed(
          await api.registerIndividual({
            fullName: String(form.get("fullName")),
            email: String(form.get("email")),
            password: String(form.get("password")),
            defaultLocation: {
              name: "Islamabad Saved Location",
              country: "Pakistan",
              latitude: 33.6844,
              longitude: 73.0479,
              timezone: "Asia/Karachi"
            }
          })
        );
      } else {
        onAuthed(
          await api.registerOrganisation({
            organisationName: String(form.get("organisationName")),
            adminFullName: String(form.get("adminFullName")),
            adminEmail: String(form.get("adminEmail")),
            password: String(form.get("password")),
            country: String(form.get("country")),
            timezone: String(form.get("timezone"))
          })
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function demoLogin() {
    setBusy(true);
    setError(null);
    try {
      onAuthed(await api.demoLogin());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Demo login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,1fr)]">
        <section className="flex min-h-[520px] flex-col justify-between rounded-lg bg-ink p-6 text-white shadow-soft">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-sm font-semibold">
              <CloudSun size={18} />
              FieldCast Ops
            </div>
            <h1 className="mt-8 max-w-xl text-4xl font-bold leading-tight tracking-normal">
              Weather operations for sites, rules, incidents, and provider quota.
            </h1>
          </div>
          <div className="grid gap-3 text-sm text-slate-200 sm:grid-cols-3">
            <div className="rounded-md border border-white/10 p-3">Workspace tenancy</div>
            <div className="rounded-md border border-white/10 p-3">Risk rule engine</div>
            <div className="rounded-md border border-white/10 p-3">Quota-aware provider centre</div>
          </div>
        </section>

        <Panel className="min-h-[520px]">
          <div className="mb-5 flex rounded-md bg-slate-100 p-1">
            {(["login", "individual", "organisation"] as const).map((item) => (
              <button
                key={item}
                className={`min-h-10 flex-1 rounded-md px-3 text-sm font-bold capitalize ${
                  mode === item ? "bg-white text-ink shadow-sm" : "text-slate-500"
                }`}
                onClick={() => setMode(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>

          {error ? <div className="mb-4 rounded-md bg-red-50 p-3 text-sm font-semibold text-danger">{error}</div> : null}

          <form className="space-y-4" onSubmit={submit}>
            {mode === "login" ? (
              <>
                <Field label="Email">
                  <TextInput name="email" defaultValue="demo@fieldcast.local" type="email" required />
                </Field>
                <Field label="Password">
                  <TextInput name="password" defaultValue="FieldCast123!" type="password" required />
                </Field>
              </>
            ) : mode === "individual" ? (
              <>
                <Field label="Full name">
                  <TextInput name="fullName" defaultValue="Personal Demo User" required />
                </Field>
                <Field label="Email">
                  <TextInput name="email" defaultValue={`personal-${Date.now()}@fieldcast.local`} type="email" required />
                </Field>
                <Field label="Password">
                  <TextInput name="password" defaultValue="FieldCast123!" type="password" required />
                </Field>
              </>
            ) : (
              <>
                <Field label="Organisation name">
                  <TextInput name="organisationName" defaultValue="North Region Field Ops" required />
                </Field>
                <Field label="Admin full name">
                  <TextInput name="adminFullName" defaultValue="Operations Owner" required />
                </Field>
                <Field label="Admin email">
                  <TextInput name="adminEmail" defaultValue={`org-${Date.now()}@fieldcast.local`} type="email" required />
                </Field>
                <Field label="Password">
                  <TextInput name="password" defaultValue="FieldCast123!" type="password" required />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Country">
                    <TextInput name="country" defaultValue="Pakistan" required />
                  </Field>
                  <Field label="Timezone">
                    <TextInput name="timezone" defaultValue="Asia/Karachi" required />
                  </Field>
                </div>
              </>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <Button disabled={busy} type="submit" variant="primary" icon={<CheckCircle2 size={17} />}>
                Continue
              </Button>
              <Button disabled={busy} type="button" onClick={demoLogin} icon={<Play size={17} />}>
                Demo Workspace
              </Button>
            </div>
          </form>
        </Panel>
      </div>
    </main>
  );
}

export function App() {
  const [auth, setAuth] = useState<AuthPayload | null>(null);
  const [view, setView] = useState<View>("overview");
  const [loading, setLoading] = useState(Boolean(getStoredToken()));
  const [error, setError] = useState<string | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [rules, setRules] = useState<RiskRule[]>([]);
  const [ruleDrafts, setRuleDrafts] = useState<Record<string, Partial<RiskRule>>>({});
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [providerKey, setProviderKey] = useState("wai_demo_free_34bf");
  const [templateIndex, setTemplateIndex] = useState(0);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) ?? sites[0] ?? null,
    [selectedSiteId, sites]
  );

  const loadRules = useCallback(async (siteId: string) => {
    const nextRules = await api.rules(siteId);
    setRules(nextRules);
    setRuleDrafts(
      Object.fromEntries(
        nextRules.map((rule) => [
          rule.id,
          {
            mediumThreshold: rule.mediumThreshold,
            highThreshold: rule.highThreshold,
            enabled: rule.enabled,
            recommendation: rule.recommendation
          }
        ])
      )
    );
  }, []);

  const loadDashboard = useCallback(async (payload?: AuthPayload) => {
    setLoading(true);
    setError(null);
    try {
      const me = payload ?? (await api.me());
      setAuth(me);
      const [siteList, providerStatus, incidentList, usageSummary, memberList, auditList] = await Promise.all([
        api.sites(),
        api.provider(),
        api.incidents(),
        api.usageSummary(),
        api.members(me.workspace.id),
        api.auditLogs()
      ]);
      setSites(siteList);
      setProvider(providerStatus);
      setIncidents(incidentList);
      setUsage(usageSummary);
      setMembers(memberList);
      setAuditLogs(auditList);
      const nextSiteId = selectedSiteId || siteList[0]?.id || "";
      setSelectedSiteId(nextSiteId);
      if (nextSiteId) {
        await loadRules(nextSiteId);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load dashboard");
      clearToken();
      setAuth(null);
    } finally {
      setLoading(false);
    }
  }, [loadRules, selectedSiteId]);

  useEffect(() => {
    if (getStoredToken()) {
      void loadDashboard();
    }
  }, [loadDashboard]);

  useEffect(() => {
    if (selectedSiteId) {
      void loadRules(selectedSiteId).catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load rules"));
    }
  }, [loadRules, selectedSiteId]);

  async function runAnalysis(siteId = selectedSite?.id) {
    if (!siteId) {
      return;
    }
    setBusyAction("analyse");
    setError(null);
    try {
      const result = await api.analyse(siteId);
      setAnalysis(result);
      setIncidents(await api.incidents());
      setUsage(await api.usageSummary());
      setAuditLogs(await api.auditLogs());
      setView("overview");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis failed");
    } finally {
      setBusyAction(null);
    }
  }

  async function logout() {
    await api.logout().catch(() => undefined);
    clearToken();
    setAuth(null);
  }

  if (!auth && loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-600 shadow-soft">
          Loading FieldCast Ops
        </div>
      </main>
    );
  }

  if (!auth) {
    return <AuthScreen onAuthed={(payload) => void loadDashboard(payload)} />;
  }

  const openIncidents = incidents.filter((incident) => ["OPEN", "ACKNOWLEDGED"].includes(incident.status));
  const highIncidents = openIncidents.filter((incident) => incident.severity === "HIGH" || incident.severity === "CRITICAL");
  const chartData =
    analysis?.evaluatedHours.slice(0, 24).map((hour) => ({
      hour: formatDateTime(hour.timestamp),
      temp: hour.temperatureC,
      rain: hour.precipitationProbability,
      wind: hour.windSpeedKph
    })) ?? [];

  const navItems: Array<{ id: View; label: string; icon: React.ReactNode }> = [
    { id: "overview", label: "Overview", icon: <BarChart3 size={18} /> },
    { id: "sites", label: "Sites", icon: <MapPin size={18} /> },
    { id: "rules", label: "Rules", icon: <SlidersHorizontal size={18} /> },
    { id: "incidents", label: "Incidents", icon: <AlertTriangle size={18} /> },
    { id: "provider", label: "Provider", icon: <KeyRound size={18} /> },
    { id: "members", label: "Members", icon: <Users size={18} /> },
    { id: "audit", label: "Audit", icon: <Shield size={18} /> }
  ];

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="dashboard-grid grid min-h-screen">
        <aside className="border-r border-slate-200 bg-white p-4">
          <div className="mb-6 flex items-center gap-2 text-lg font-bold text-ink">
            <CloudSun className="text-ocean" size={24} />
            FieldCast Ops
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-bold ${
                  view === item.id ? "bg-blue-50 text-ocean" : "text-slate-600 hover:bg-slate-100"
                }`}
                onClick={() => setView(item.id)}
                type="button"
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>
          <div className="mt-8 rounded-lg border border-slate-200 p-3 text-sm">
            <div className="font-bold text-ink">{auth.workspace.name}</div>
            <div className="mt-1 text-slate-500">{auth.member.role.replace(/_/g, " ")}</div>
          </div>
        </aside>

        <section className="min-w-0 p-4 sm:p-6">
          <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-normal text-ink">{auth.workspace.name}</h1>
              <div className="mt-1 flex flex-wrap gap-2 text-sm text-slate-500">
                <RiskBadge value={auth.workspace.type} />
                {provider?.connection?.capabilityTier ? <RiskBadge value={provider.connection.capabilityTier} /> : null}
                {selectedSite ? <span>{selectedSite.name}</span> : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void loadDashboard()} icon={<RefreshCw size={17} />}>
                Refresh
              </Button>
              <Button onClick={() => void logout()} icon={<LogOut size={17} />} variant="ghost">
                Sign out
              </Button>
            </div>
          </header>

          {error ? <div className="mb-4 rounded-md bg-red-50 p-3 text-sm font-semibold text-danger">{error}</div> : null}

          {view === "overview" ? (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Stat label="Monitored sites" value={sites.length} icon={<MapPin size={20} />} />
                <Stat label="Open incidents" value={openIncidents.length} icon={<AlertTriangle size={20} />} tone={openIncidents.length ? "danger" : "safe"} />
                <Stat label="High-risk incidents" value={highIncidents.length} icon={<Activity size={20} />} tone={highIncidents.length ? "danger" : "safe"} />
                <Stat label="Provider calls" value={usage?.providerCalls ?? 0} icon={<KeyRound size={20} />} />
              </div>

              <Panel
                title="Working Windows"
                action={
                  <div className="flex flex-wrap gap-2">
                    <SelectInput value={selectedSiteId} onChange={(event) => setSelectedSiteId(event.target.value)}>
                      {sites.map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.name}
                        </option>
                      ))}
                    </SelectInput>
                    <Button disabled={!selectedSite || busyAction === "analyse"} onClick={() => void runAnalysis()} icon={<Play size={17} />} variant="primary">
                      Analyse
                    </Button>
                  </div>
                }
              >
                {analysis ? (
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
                    <div className="h-[320px] min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid stroke="#e2e8f0" />
                          <XAxis dataKey="hour" hide />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="temp" name="Temp C" stroke="#2563eb" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="rain" name="Rain %" stroke="#0f9f8f" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="wind" name="Wind kph" stroke="#b7791f" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold uppercase text-slate-500">Recommended</h3>
                      {analysis.workingWindows.slice(0, 3).map((window) => (
                        <div key={`${window.start}-${window.end}`} className="rounded-md border border-emerald-100 bg-emerald-50 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <strong className="text-sm text-safe">{formatDateTime(window.start)} to {formatDateTime(window.end)}</strong>
                            <RiskBadge value={window.riskLevel} />
                          </div>
                          <p className="mt-2 text-sm text-slate-700">{window.summary}</p>
                        </div>
                      ))}
                      <h3 className="pt-2 text-sm font-bold uppercase text-slate-500">Avoid</h3>
                      {analysis.hazardWindows.slice(0, 3).map((window) => (
                        <div key={`${window.start}-${window.end}`} className="rounded-md border border-red-100 bg-red-50 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <strong className="text-sm text-danger">{formatDateTime(window.start)} to {formatDateTime(window.end)}</strong>
                            <RiskBadge value={window.riskLevel} />
                          </div>
                          <p className="mt-2 text-sm text-slate-700">{window.summary}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-center">
                    <CloudSun className="text-ocean" size={42} />
                    <div className="text-lg font-bold text-ink">Run a site analysis</div>
                    <Button disabled={!selectedSite} onClick={() => void runAnalysis()} icon={<Play size={17} />} variant="primary">
                      Analyse Selected Site
                    </Button>
                  </div>
                )}
              </Panel>
            </div>
          ) : null}

          {view === "sites" ? (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_360px]">
              <Panel title="Operational Sites">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="text-xs uppercase text-slate-500">
                      <tr>
                        <th className="py-2">Site</th>
                        <th>Type</th>
                        <th>Location</th>
                        <th>Rules</th>
                        <th>Incidents</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sites.map((site) => (
                        <tr key={site.id}>
                          <td className="py-3">
                            <div className="font-bold text-ink">{site.name}</div>
                            <div className="text-slate-500">{site.description}</div>
                          </td>
                          <td>{site.siteType.replace(/_/g, " ")}</td>
                          <td>{site.country}</td>
                          <td>{site.ruleCount ?? 0}</td>
                          <td>{site.openIncidentCount ?? 0}</td>
                          <td className="text-right">
                            <Button onClick={() => void runAnalysis(site.id)} icon={<Play size={16} />}>
                              Analyse
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
              <Panel title="Add Site">
                <div className="space-y-3">
                  <Field label="Template">
                    <SelectInput value={templateIndex} onChange={(event) => setTemplateIndex(Number(event.target.value))}>
                      {siteTemplates.map((template, index) => (
                        <option key={template.label} value={index}>
                          {template.label}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                  <Button
                    className="w-full"
                    icon={<MapPin size={17} />}
                    onClick={async () => {
                      setBusyAction("create-site");
                      try {
                        await api.createSite(siteTemplates[templateIndex] ?? siteTemplates[0]);
                        await loadDashboard();
                      } catch (caught) {
                        setError(caught instanceof Error ? caught.message : "Unable to create site");
                      } finally {
                        setBusyAction(null);
                      }
                    }}
                    variant="primary"
                  >
                    Add Template
                  </Button>
                </div>
              </Panel>
            </div>
          ) : null}

          {view === "rules" ? (
            <Panel
              title="Risk Rules"
              action={
                <SelectInput value={selectedSiteId} onChange={(event) => setSelectedSiteId(event.target.value)}>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </SelectInput>
              }
            >
              <div className="grid gap-4 lg:grid-cols-2">
                {rules.map((rule) => {
                  const draft = ruleDrafts[rule.id] ?? {};
                  return (
                    <div key={rule.id} className="rounded-md border border-slate-200 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <strong className="text-ink">{rule.hazardType.replace(/_/g, " ")}</strong>
                        <RiskBadge value={draft.enabled === false ? "DISABLED" : "ACTIVE"} />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Medium">
                          <TextInput
                            type="number"
                            value={draft.mediumThreshold ?? rule.mediumThreshold}
                            onChange={(event) =>
                              setRuleDrafts((current) => ({
                                ...current,
                                [rule.id]: { ...current[rule.id], mediumThreshold: Number(event.target.value) }
                              }))
                            }
                          />
                        </Field>
                        <Field label="High">
                          <TextInput
                            type="number"
                            value={draft.highThreshold ?? rule.highThreshold}
                            onChange={(event) =>
                              setRuleDrafts((current) => ({
                                ...current,
                                [rule.id]: { ...current[rule.id], highThreshold: Number(event.target.value) }
                              }))
                            }
                          />
                        </Field>
                      </div>
                      <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <input
                          checked={draft.enabled ?? rule.enabled}
                          type="checkbox"
                          onChange={(event) =>
                            setRuleDrafts((current) => ({
                              ...current,
                              [rule.id]: { ...current[rule.id], enabled: event.target.checked }
                            }))
                          }
                        />
                        Enabled
                      </label>
                      <div className="mt-3">
                        <Field label="Recommendation">
                          <TextInput
                            value={draft.recommendation ?? rule.recommendation}
                            onChange={(event) =>
                              setRuleDrafts((current) => ({
                                ...current,
                                [rule.id]: { ...current[rule.id], recommendation: event.target.value }
                              }))
                            }
                          />
                        </Field>
                      </div>
                      <Button
                        className="mt-3"
                        onClick={async () => {
                          await api.updateRule(rule.id, ruleDrafts[rule.id] ?? {});
                          await loadRules(rule.siteId);
                        }}
                        icon={<CheckCircle2 size={16} />}
                      >
                        Save
                      </Button>
                    </div>
                  );
                })}
              </div>
            </Panel>
          ) : null}

          {view === "incidents" ? (
            <Panel title="Incidents">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-2">Incident</th>
                      <th>Site</th>
                      <th>Window</th>
                      <th>Status</th>
                      <th>Severity</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {incidents.map((incident) => (
                      <tr key={incident.id}>
                        <td className="py-3">
                          <div className="font-bold text-ink">{incident.title}</div>
                          <div className="text-slate-500">{incident.reason}</div>
                        </td>
                        <td>{incident.site?.name ?? sites.find((site) => site.id === incident.siteId)?.name ?? "Unknown"}</td>
                        <td>{formatDateTime(incident.forecastStart)} to {formatDateTime(incident.forecastEnd)}</td>
                        <td><RiskBadge value={incident.status} /></td>
                        <td><RiskBadge value={incident.severity} /></td>
                        <td className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button onClick={async () => { await api.acknowledgeIncident(incident.id); setIncidents(await api.incidents()); }}>
                              Acknowledge
                            </Button>
                            <Button onClick={async () => { await api.resolveIncident(incident.id); setIncidents(await api.incidents()); }} variant="ghost">
                              Resolve
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ) : null}

          {view === "provider" ? (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <Panel title="Provider Centre">
                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <div className="mb-2 text-sm font-semibold text-slate-500">Connection</div>
                    <div className="text-xl font-bold text-ink">{provider?.connection?.maskedKey ?? "No organisation key"}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {provider?.connection?.capabilityTier ? <RiskBadge value={provider.connection.capabilityTier} /> : null}
                      <RiskBadge value={provider?.mode ?? "UNKNOWN"} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-sm font-semibold text-slate-500">Billing period ends</div>
                    <div className="text-xl font-bold text-ink">{formatDate(provider?.usage?.periodEnd)}</div>
                  </div>
                  <div className="md:col-span-2">
                    <div className="mb-2 text-sm font-semibold text-slate-500">Requests</div>
                    <ProgressBar
                      used={provider?.usage?.requestsUsed ?? 0}
                      limit={provider?.usage?.requestLimit ?? 1000}
                      tone={(provider?.usage?.requestsUsed ?? 0) / (provider?.usage?.requestLimit ?? 1) > 0.8 ? "danger" : "neutral"}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <div className="mb-2 text-sm font-semibold text-slate-500">AI Requests</div>
                    <ProgressBar
                      used={provider?.usage?.aiRequestsUsed ?? 0}
                      limit={provider?.usage?.aiRequestLimit ?? 200}
                      tone={(provider?.usage?.aiRequestsUsed ?? 0) / (provider?.usage?.aiRequestLimit ?? 1) > 0.8 ? "danger" : "safe"}
                    />
                  </div>
                </div>
              </Panel>
              <Panel title="Connect Key">
                <div className="space-y-3">
                  <Field label="WeatherAI API key">
                    <TextInput value={providerKey} onChange={(event) => setProviderKey(event.target.value)} />
                  </Field>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <Button
                      icon={<KeyRound size={17} />}
                      onClick={async () => {
                        setProvider(await api.connectProvider(providerKey));
                        setAuditLogs(await api.auditLogs());
                      }}
                      variant="primary"
                    >
                      Connect
                    </Button>
                    <Button
                      icon={<RefreshCw size={17} />}
                      onClick={async () => {
                        setProvider(await api.syncProvider());
                      }}
                    >
                      Sync Usage
                    </Button>
                  </div>
                </div>
              </Panel>
            </div>
          ) : null}

          {view === "members" ? (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <Panel title="Members">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="text-xs uppercase text-slate-500">
                      <tr>
                        <th className="py-2">Member</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Weather usage</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {members.map((member) => (
                        <tr key={member.id}>
                          <td className="py-3">
                            <div className="font-bold text-ink">{member.user?.fullName ?? member.id}</div>
                            <div className="text-slate-500">{member.user?.email}</div>
                          </td>
                          <td>{member.role.replace(/_/g, " ")}</td>
                          <td><RiskBadge value={member.status} /></td>
                          <td>{member.weatherUsageEnabled ? "Enabled" : "Disabled"}</td>
                          <td className="text-right">
                            <Button
                              onClick={async () => {
                                await api.setWeatherUsage(auth.workspace.id, member.id, !member.weatherUsageEnabled);
                                setMembers(await api.members(auth.workspace.id));
                              }}
                              variant="ghost"
                            >
                              Toggle
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
              <Panel title="Invite">
                <form
                  className="space-y-3"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const result = await api.invite(auth.workspace.id, String(form.get("email")), String(form.get("role")));
                    setInviteLink(result.inviteLink);
                    setAuditLogs(await api.auditLogs());
                  }}
                >
                  <Field label="Email">
                    <TextInput name="email" placeholder="teammate@example.com" type="email" required />
                  </Field>
                  <Field label="Role">
                    <SelectInput name="role" defaultValue="TEAM_MEMBER">
                      <option value="IT_ADMIN">IT Admin</option>
                      <option value="OPS_ADMIN">Ops Admin</option>
                      <option value="TEAM_MEMBER">Team Member</option>
                      <option value="VIEWER">Viewer</option>
                    </SelectInput>
                  </Field>
                  <Button className="w-full" icon={<UserPlus size={17} />} type="submit" variant="primary">
                    Create Invite
                  </Button>
                  {inviteLink ? <div className="break-all rounded-md bg-slate-100 p-3 text-xs font-semibold text-slate-600">{inviteLink}</div> : null}
                </form>
              </Panel>
            </div>
          ) : null}

          {view === "audit" ? (
            <Panel title="Audit Logs">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-2">Action</th>
                      <th>Target</th>
                      <th>When</th>
                      <th>Metadata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="py-3 font-bold text-ink">{log.action}</td>
                        <td>{log.targetType}</td>
                        <td>{formatDateTime(log.createdAt)}</td>
                        <td className="max-w-[320px] truncate text-slate-500">{log.metadataJson ? JSON.stringify(log.metadataJson) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ) : null}
        </section>
      </div>
    </main>
  );
}
