"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import type { SelectableRule } from "@/lib/services/marketRuntime";
import { IconCheck, IconScale } from "@/components/icons";
import "./catalogPicker.css";

export default function RuleChoice({ rules, value, onChange, aiId }: { rules: SelectableRule[]; value: string[]; onChange: (ids: string[]) => void; aiId?: string }) {
  const t = useTranslations("sellerServices.ruleChoice");
  const uid = useId();
  const on = new Set(value);
  const toggle = (id: string) => onChange(on.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <fieldset className="svform__sec svrc" aria-describedby={`${uid}-l`} data-ai-id={aiId} data-ai-type={aiId ? "section" : undefined} data-ai-label={aiId ? t("title") : undefined}>
      <legend className="svform__lbl">
        <span className="svform__n" aria-hidden="true">
          <IconScale />
        </span>
        {t("title")}
      </legend>
      <p id={`${uid}-l`} className="svform__hint">
        {t("lead")}
      </p>
      <ul className="svrc__list">
        {rules.map((r) => {
          const checked = on.has(r.id);
          return (
            <li key={r.id}>
              <label className={`svrc__o${checked ? " is-on" : ""}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(r.id)} data-ai-id={aiId ? `${aiId}.rule.${r.id}` : undefined} data-ai-type={aiId ? "checkbox" : undefined} />
                <span className="svform__box" aria-hidden="true">
                  <IconCheck />
                </span>
                <span className="svrc__m">
                  <b>
                    {r.title || r.id}
                    {r.version ? <small>{t("version", { v: r.version })}</small> : null}
                  </b>
                  {r.bodyPreview ? <small>{r.bodyPreview}</small> : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="svrc__n" aria-live="polite">
        {t("count", { n: value.filter((id) => rules.some((r) => r.id === id)).length })}
      </p>
    </fieldset>
  );
}
