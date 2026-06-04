import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="min-h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-ink shadow-sm transition placeholder:text-slate-400 focus:border-ocean"
      {...props}
    />
  );
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className="min-h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-ink shadow-sm transition focus:border-ocean"
      {...props}
    />
  );
}
