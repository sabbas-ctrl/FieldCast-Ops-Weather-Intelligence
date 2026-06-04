import { store } from "../demo/store.js";

export function listUsageEvents(workspaceId: string) {
  return store.usageEvents
    .filter((event) => event.workspaceId === workspaceId)
    .slice(0, 100)
    .map((event) => ({
      ...event,
      member: event.memberId ? store.members.find((member) => member.id === event.memberId) ?? null : null,
      site: event.siteId ? store.sites.find((site) => site.id === event.siteId) ?? null : null
    }));
}

export function usageSummary(workspaceId: string) {
  const events = store.usageEvents.filter((event) => event.workspaceId === workspaceId);
  const byFeature = new Map<string, { feature: string; count: number; providerCalls: number; cacheHits: number }>();
  const byMember = new Map<string, { memberId: string; memberName: string; analyses: number; aiSummaries: number; lastActivity?: string }>();

  for (const event of events) {
    const feature = byFeature.get(event.feature) ?? {
      feature: event.feature,
      count: 0,
      providerCalls: 0,
      cacheHits: 0
    };
    feature.count += 1;
    feature.providerCalls += event.providerCalled ? 1 : 0;
    feature.cacheHits += event.servedFromCache ? 1 : 0;
    byFeature.set(event.feature, feature);

    if (event.memberId) {
      const member = store.members.find((candidate) => candidate.id === event.memberId);
      const user = member ? store.users.find((candidate) => candidate.id === member.userId) : undefined;
      const memberSummary = byMember.get(event.memberId) ?? {
        memberId: event.memberId,
        memberName: user?.fullName ?? "Unknown member",
        analyses: 0,
        aiSummaries: 0
      };
      memberSummary.analyses += event.feature === "working_window_analysis" ? 1 : 0;
      memberSummary.aiSummaries += event.aiEnabled ? 1 : 0;
      memberSummary.lastActivity = event.createdAt;
      byMember.set(event.memberId, memberSummary);
    }
  }

  return {
    totalEvents: events.length,
    providerCalls: events.filter((event) => event.providerCalled).length,
    cacheHits: events.filter((event) => event.servedFromCache).length,
    aiRequests: events.filter((event) => event.aiEnabled).length,
    byFeature: Array.from(byFeature.values()),
    byMember: Array.from(byMember.values())
  };
}
