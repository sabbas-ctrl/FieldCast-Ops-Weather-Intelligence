export function ProgressBar({ used, limit, tone = "neutral" }: { used: number; limit: number; tone?: "neutral" | "safe" | "caution" | "danger" }) {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const color = {
    neutral: "bg-ocean",
    safe: "bg-safe",
    caution: "bg-caution",
    danger: "bg-danger"
  }[tone];

  return (
    <div className="space-y-2">
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
      <div className="flex justify-between text-xs font-medium text-slate-500">
        <span>{used.toLocaleString()} used</span>
        <span>{limit.toLocaleString()} limit</span>
      </div>
    </div>
  );
}
