"use client";

import "../sx-core.css";
import "../sx-form.css";
import "./sx-schema.css";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import IconButton from "@/components/ui/IconButton";
import { aiId as makeAiId } from "@/lib/ai/ids";
import { suggestDiscoveryTerms } from "@/lib/services/studio";
import { SxButton } from "../Button";
import { PlusIcon, SparklesIcon, XIcon, glyph } from "../icons";
import { SxNote } from "../layout/Note";
import { TagsInput, mergeTags } from "../form/TagsInput";
import type { SxControlA11y } from "../types";

export type DiscoveryTermsProps = {
  id: string;
  value: readonly string[];
  onChange: (next: string[]) => void;
  label: string;
  readOnly: boolean;
  a11y: SxControlA11y;
  aiId: string;
  suggest?: { title: string; description: string; parentTitle: string } | null;
  onBlur?: () => void;
};

type Ask = { state: "idle" } | { state: "busy" } | { state: "fail" } | { state: "done"; items: string[] };

const fold = (s: string) => s.trim().toLocaleLowerCase();

export function freshSuggestions(items: readonly string[], current: readonly string[], dismissed: readonly string[]): string[] {
  const have = new Set([...current, ...dismissed].map(fold));
  const out: string[] = [];
  for (const raw of items) {
    const s = String(raw ?? "").trim();
    if (!s || have.has(fold(s))) continue;
    have.add(fold(s));
    out.push(s);
  }
  return out;
}

export function DiscoveryTerms({ id, value, onChange, label, readOnly, a11y, aiId, suggest, onBlur }: DiscoveryTermsProps): ReactElement {
  const t = useTranslations("studio");
  const [ask, setAsk] = useState<Ask>({ state: "idle" });
  const [dismissed, setDismissed] = useState<string[]>([]);
  const ctrl = useRef<AbortController | null>(null);
  const items = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  const canSuggest = !!suggest && !readOnly;
  const needTitle = canSuggest && !suggest.title.trim();
  const needId = `${id}-need`;

  useEffect(() => () => ctrl.current?.abort(), []);

  const run = () => {
    if (!suggest || needTitle || ask.state === "busy") return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setAsk({ state: "busy" });
    setDismissed([]);
    suggestDiscoveryTerms({ title: suggest.title.trim(), description: suggest.description, parentTitle: suggest.parentTitle }, c.signal).then(
      (list) => {
        if (!c.signal.aborted) setAsk({ state: "done", items: list });
      },
      () => {
        if (!c.signal.aborted) setAsk({ state: "fail" });
      },
    );
  };

  const shown = ask.state === "done" ? freshSuggestions(ask.items, items, dismissed) : [];
  const addOne = (s: string) => onChange(mergeTags(items, [s]));
  const editOne = (s: string) => {
    setDismissed((d) => [...d, s]);
    const input = document.getElementById(id) as HTMLInputElement | null;
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, s);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  };

  return (
    <div className="sx-sf-dt">
      <TagsInput
        id={id}
        value={items}
        onChange={onChange}
        label={label}
        readOnly={readOnly}
        onBlur={onBlur}
        aria-labelledby={a11y["aria-labelledby"]}
        aria-describedby={a11y["aria-describedby"]}
        aria-invalid={a11y["aria-invalid"]}
        aria-required={a11y["aria-required"]}
        aiId={aiId}
      />
      {canSuggest ? (
        <div className="sx-sf-dt__ai">
          <div className="sx-sf-dt__row">
            <SxButton
              variant="secondary"
              size="sm"
              icon={SparklesIcon}
              busy={ask.state === "busy"}
              aria-disabled={needTitle || ask.state === "busy" ? true : undefined}
              aria-describedby={needTitle ? needId : undefined}
              onClick={run}
              aiId={makeAiId(aiId, "suggest")}
            >
              {ask.state === "busy" ? t("sx.tags.suggesting") : t("sx.tags.suggest")}
            </SxButton>
            {needTitle ? (
              <span className="sx-sf-dt__need" id={needId}>
                {t("sx.tags.needTitle")}
              </span>
            ) : null}
          </div>
          {ask.state === "fail" ? (
            <SxNote
              tone="error"
              role="status"
              action={
                <SxButton variant="ghost" size="sm" onClick={run}>
                  {t("sx.ui.retry")}
                </SxButton>
              }
            >
              {t("sx.tags.suggestFail")}
            </SxNote>
          ) : null}
          {ask.state === "done" ? (
            shown.length ? (
              <div className="sx-sf-dt__sugg" role="group" aria-labelledby={`${id}-sugg`}>
                <div className="sx-sf-dt__head">
                  <span className="sx-sf-dt__title" id={`${id}-sugg`}>
                    {t("sx.tags.suggestions")}
                  </span>
                  <SxButton variant="ghost" size="sm" icon={PlusIcon} onClick={() => onChange(mergeTags(items, shown))} aiId={makeAiId(aiId, "suggest", "add-all")}>
                    {t("sx.tags.addAll")}
                  </SxButton>
                </div>
                <ul className="sx-sf-dt__list">
                  {shown.map((s, i) => (
                    <li key={s} className="sx-sf-dt__chip">
                      <button type="button" className="sx-sf-dt__text" aria-label={t("sx.tags.edit", { name: s })} onClick={() => editOne(s)} data-ai-id={makeAiId(aiId, "suggest", i)} data-ai-type="button" data-ai-label={s}>
                        {s}
                      </button>
                      <IconButton className="sx-ibtn" size="sm" tip={false} icon={glyph(PlusIcon, { size: 14 })} label={`${t("sx.tags.add")}: ${s}`} onClick={() => addOne(s)} aiId={makeAiId(aiId, "suggest", i, "add")} />
                      <IconButton
                        className="sx-ibtn"
                        size="sm"
                        tip={false}
                        icon={glyph(XIcon, { size: 14 })}
                        label={t("sx.tags.remove", { name: s })}
                        onClick={() => setDismissed((d) => [...d, s])}
                        aiId={makeAiId(aiId, "suggest", i, "remove")}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="sx-sf-dt__muted" role="status">
                {t("sx.tags.suggestEmpty")}
              </p>
            )
          ) : null}
          <p className="sx-sf-dt__muted">{t("sx.tags.suggestHint")}</p>
        </div>
      ) : null}
    </div>
  );
}
