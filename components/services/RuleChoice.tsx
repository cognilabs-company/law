"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import type { SelectableRule } from "@/lib/services/marketRuntime";
import { IconAlert, IconCheck, IconChevronDown, IconScale } from "@/components/icons";
import RuleBody from "./rules/RuleBody";
import "./catalogPicker.css";

export default function RuleChoice({
  rules,
  value,
  onChange,
  aiId,
  error = "",
  invalidIds = [],
}: {
  rules: SelectableRule[];
  value: string[];
  onChange: (ids: string[]) => void;
  aiId?: string;
  error?: string;
  invalidIds?: readonly string[];
}) {
  const t = useTranslations("sellerServices.ruleChoice");
  const uid = useId();
  const on = new Set(value);
  const bad = new Set(invalidIds);
  const toggle = (id: string) => onChange(on.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  const described = [`${uid}-l`, error ? `${uid}-e` : ""].filter(Boolean).join(" ");
  return (
    <fieldset className={`svform__sec svrc${error ? " is-bad" : ""}`} aria-describedby={described} data-ai-id={aiId} data-ai-type={aiId ? "section" : undefined} data-ai-label={aiId ? t("title") : undefined}>
      <legend className="svform__lbl">
        <span className="svform__n" aria-hidden="true">
          <IconScale />
        </span>
        {t("title")}
      </legend>
      <p id={`${uid}-l`} className="svform__hint">
        {t("lead")} {t("clientNote")}
      </p>
      <ul className="svrc__list">
        {rules.map((r) => {
          const checked = on.has(r.id);
          const body = (r.body ?? "").trim();
          const preview = r.bodyPreview || (body && !/<[a-z]/i.test(body) && body.length <= 160 ? body : "");
          const showBody = Boolean(body) && body !== preview;
          return (
            <li key={r.id} className={bad.has(r.id) ? "is-bad" : undefined}>
              <label className={`svrc__o${checked ? " is-on" : ""}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(r.id)} data-ai-id={aiId ? `${aiId}.rule.${r.id}` : undefined} data-ai-type={aiId ? "checkbox" : undefined} />
                <span className="svform__box" aria-hidden="true">
                  <IconCheck />
                </span>
                <span className="svrc__m">
                  <b>
                    {r.title || t("untitled")}
                    {r.version ? <small>{t("version", { v: r.version })}</small> : null}
                  </b>
                  {preview ? <small>{preview}</small> : null}
                </span>
              </label>
              {showBody ? (
                <details className="svrc__body">
                  <summary data-ai-id={aiId ? `${aiId}.rule.${r.id}.body` : undefined} data-ai-type={aiId ? "toggle" : undefined}>
                    {t("readBody")}
                    <IconChevronDown aria-hidden="true" />
                  </summary>
                  <div className="svrc__bodyin">
                    <RuleBody html={body} />
                  </div>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="svrc__n" aria-live="polite">
        {t("count", { n: value.filter((id) => rules.some((r) => r.id === id)).length })}
      </p>
      {error ? (
        <p id={`${uid}-e`} className="svrc__err" role="alert">
          <IconAlert aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </fieldset>
  );
}
