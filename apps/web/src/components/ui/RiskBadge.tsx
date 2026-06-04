import { clsx } from "clsx";

export function RiskBadge({ value }: { value: string }) {
  const normalized = value.toUpperCase();
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-md px-2 py-1 text-xs font-bold",
        (normalized === "LOW" || normalized === "RESOLVED" || normalized === "ACTIVE") && "bg-emerald-50 text-safe",
        (normalized === "MEDIUM" || normalized === "ACKNOWLEDGED" || normalized === "FREE") && "bg-amber-50 text-caution",
        (normalized === "HIGH" || normalized === "CRITICAL" || normalized === "OPEN") && "bg-red-50 text-danger",
        (normalized === "PRO" || normalized === "SCALE") && "bg-blue-50 text-ocean",
        !["LOW", "MEDIUM", "HIGH", "CRITICAL", "OPEN", "ACKNOWLEDGED", "RESOLVED", "ACTIVE", "FREE", "PRO", "SCALE"].includes(
          normalized
        ) && "bg-slate-100 text-slate-600"
      )}
    >
      {value.replace(/_/g, " ")}
    </span>
  );
}
