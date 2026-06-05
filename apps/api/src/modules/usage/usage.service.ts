import { prisma } from "../../infrastructure/prisma/client.js";

export async function listUsageEvents(workspaceId: string) {
  return prisma.usageEvent.findMany({
    where: { workspaceId },
    include: {
      member: { include: { user: { select: { id: true, fullName: true, email: true } } } },
      site: true
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });
}

export async function usageSummary(workspaceId: string) {
  const events = await prisma.usageEvent.findMany({
    where: { workspaceId },
    include: {
      member: { include: { user: { select: { fullName: true } } } }
    },
    orderBy: { createdAt: "desc" }
  });
  const byFeature = new Map<string, { feature: string; count: number; providerCalls: number; cacheHits: number }>();
  const byMember = new Map<string, { memberId: string; memberName: string; analyses: number; aiSummaries: number; lastActivity?: Date }>();

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
      const memberSummary = byMember.get(event.memberId) ?? {
        memberId: event.memberId,
        memberName: event.member?.user.fullName ?? "Unknown member",
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
