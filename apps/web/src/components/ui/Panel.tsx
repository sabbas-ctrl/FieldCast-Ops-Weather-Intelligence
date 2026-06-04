import type { ReactNode } from "react";
import { clsx } from "clsx";

export function Panel({
  children,
  className,
  title,
  action
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
}) {
  return (
    <section className={clsx("rounded-lg border border-slate-200 bg-white p-4 shadow-soft", className)}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title ? <h2 className="text-sm font-bold uppercase tracking-normal text-slate-600">{title}</h2> : <span />}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
