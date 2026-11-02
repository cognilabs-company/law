import { asDict, asStr } from "@/lib/http";

export const textOf = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(textOf).filter(Boolean).join("\n\n");
  const d = asDict(v);
  return asStr(d.text ?? d.body ?? d.content ?? d.message ?? d.title ?? d.name) || Object.values(d).map(textOf).filter(Boolean).join("\n");
};

export const pathKey = (p: string) => `path.${p.replace(/\./g, "_")}`;

export const pct = (v: unknown): number | null => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n <= 1 ? n * 100 : n));
};

export function isoToLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
