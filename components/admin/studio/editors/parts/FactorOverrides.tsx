"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { loadStudioReference, type StudioReferenceItem } from "@/lib/services/studio";

type Override = { adjustment_type: "fixed" | "percent"; value: number };
type Overrides = Record<string, Override>;

// A package's own values for the price factors it uses (K03-M,
// price_factor_overrides, 2026-10-18): one row per factor picked above,
// left empty to keep the factor's own value, or given a fixed amount or a
// percentage for this package only. Factors only ever add to the price.
export default function FactorOverrides({ factorIds, value, onChange, readOnly }: { factorIds: string[]; value: unknown; onChange: (v: Overrides | undefined) => void; readOnly: boolean }) {
  const t = useTranslations("studio.factorOverrides");
  const [names, setNames] = useState<StudioReferenceItem[]>([]);
  useEffect(() => {
    const c = new AbortController();
    loadStudioReference("/studio/reference/price-factors", "", 100, c.signal)
      .then((l) => !c.signal.aborted && setNames(l))
      .catch(() => undefined);
    return () => c.abort();
  }, []);
  const cur: Overrides = value && typeof value === "object" && !Array.isArray(value) ? (value as Overrides) : {};
  const nameOf = (id: string) => names.find((n) => n.id === id || n.value === id)?.label || id;
  const set = (id: string, o: Override | null) => {
    const next = { ...cur };
    if (o) next[id] = o;
    else delete next[id];
    // Only the factors still picked are kept.
    for (const k of Object.keys(next)) if (!factorIds.includes(k)) delete next[k];
    onChange(Object.keys(next).length ? next : undefined);
  };

  if (!factorIds.length) return <p className="stu-fo__none">{t("pickFirst")}</p>;
  return (
    <ul className="stu-fo">
      {factorIds.map((id) => {
        const o = cur[id];
        return (
          <li key={id}>
            <b>{nameOf(id)}</b>
            <select
              value={o ? o.adjustment_type : ""}
              disabled={readOnly}
              onChange={(e) => {
                const ty = e.target.value as Override["adjustment_type"] | "";
                set(id, ty ? { adjustment_type: ty, value: o?.value ?? 0 } : null);
              }}
              aria-label={t("type", { name: nameOf(id) })}
            >
              <option value="">{t("inherit")}</option>
              <option value="fixed">{t("fixed")}</option>
              <option value="percent">{t("percent")}</option>
            </select>
            {o ? (
              <label>
                <input
                  type="number"
                  min={0}
                  max={o.adjustment_type === "percent" ? 1000 : undefined}
                  step={o.adjustment_type === "percent" ? 1 : 1000}
                  value={o.value}
                  disabled={readOnly}
                  onChange={(e) => set(id, { ...o, value: Math.max(0, Number(e.target.value) || 0) })}
                  aria-label={t("value", { name: nameOf(id) })}
                />
                <span>{o.adjustment_type === "percent" ? "%" : t("som")}</span>
              </label>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
