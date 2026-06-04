import type { ReactNode } from "react";

export function Stat({ label, value, icon, tone = "neutral" }: { label: string; value: ReactNode; icon?: ReactNode; tone?: "neutral" | "safe" | "caution" | "danger" }) {
  const toneClass = {
    neutral: "bg-blue-50 text-ocean",
    safe: "bg-emerald-50 text-safe",
    caution: "bg-amber-50 text-caution",
    danger: "bg-red-50 text-danger"
  }[tone];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-slate-500">{label}</div>
          <div className="mt-2 text-2xl font-bold text-ink">{value}</div>
        </div>
        {icon ? <div className={`rounded-md p-2 ${toneClass}`}>{icon}</div> : null}
      </div>
    </div>
  );
}
