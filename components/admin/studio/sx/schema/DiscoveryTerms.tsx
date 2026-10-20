"use client";

import "../sx-core.css";
import "../sx-form.css";
import "./sx-schema.css";
import "./sx-schema-hints.css";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { aiId as makeAiId } from "@/lib/ai/ids";
import { suggestDiscoveryTerms } from "@/lib/services/studio";
import { SxButton } from "../Button";
import { CircleCheckIcon, SparklesIcon, glyph } from "../icons";
import { SxNote } from "../layout/Note";
import { TagsInput, mergeTags } from "../form/TagsInput";
import type { SxControlA11y } from "../types";
import { ServiceSuggest } from "./k02/ServiceSuggest";

export type DiscoveryTermsProps = {
  id: string;
  value: readonly string[];
  onChange: (next: string[]) => void;
  label: string;
  readOnly: boolean;
  a11y: SxControlA11y;
  aiId: string;
  suggest?: { title: string; description: string; parentTitle: string } | null;
  service?: { ready: boolean; body: Record<string, unknown> } | null;
  onBlur?: () => void;
};

type Ask = { state: "idle" } | { state: "busy" } | { state: "fail" } | { state: "done"; added: number };

export const AUTO_FILL_DELAY = 1200;

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

export function shouldAutoFill(opts: { enabled: boolean; title: string; startTitle: string; count: number }): boolean {
  const title = opts.title.trim();
  return opts.enabled && !!title && title !== opts.startTitle.trim() && opts.count === 0;
}

export function DiscoveryTerms({ id, value, onChange, label, readOnly, a11y, aiId, suggest: ownSuggest, service, onBlur }: DiscoveryTermsProps): ReactElement {
  const suggest = service ? null : ownSuggest;
  const t = useTranslations("studio");
  const [ask, setAsk] = useState<Ask>({ state: "idle" });
  const ctrl = useRef<AbortController | null>(null);
  const items = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  const canSuggest = !!suggest && !readOnly;
  const title = suggest?.title.trim() ?? "";
  const needTitle = canSuggest && !title;
  const needId = `${id}-need`;
  const [startTitle] = useState(title);
  const autoDone = useRef(false);
  const latest = useRef({ items, onChange });
  const fillRef = useRef<(auto: boolean) => void>(() => {});

  useEffect(() => {
    latest.current = { items, onChange };
  });
  useEffect(() => () => ctrl.current?.abort(), []);

  const fill = (auto: boolean) => {
    if (!suggest || !title || ctrl.current) return;
    autoDone.current = true;
    const c = new AbortController();
    ctrl.current = c;
    setAsk({ state: "busy" });
    suggestDiscoveryTerms({ title, description: suggest.description, parentTitle: suggest.parentTitle }, c.signal).then(
      (list) => {
        if (c.signal.aborted) return;
        ctrl.current = null;
        const now = latest.current;
        const fresh = freshSuggestions(list, now.items, []);
        if (fresh.length) now.onChange(mergeTags(now.items, fresh));
        setAsk({ state: "done", added: fresh.length });
      },
      () => {
        if (c.signal.aborted) return;
        ctrl.current = null;
        setAsk(auto ? { state: "idle" } : { state: "fail" });
      },
    );
  };

  useEffect(() => {
    fillRef.current = fill;
  });

  const autoWanted = shouldAutoFill({ enabled: canSuggest, title, startTitle, count: items.length });
  useEffect(() => {
    if (!autoWanted) return;
    const timer = setTimeout(() => {
      if (!autoDone.current) fillRef.current(true);
    }, AUTO_FILL_DELAY);
    return () => clearTimeout(timer);
  }, [autoWanted, title]);

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
      {service && !readOnly ? <ServiceSuggest id={id} ai={aiId} ready={service.ready} body={service.body} current={items} onAdd={(terms) => onChange(mergeTags(items, terms))} /> : null}
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
              onClick={() => fill(false)}
              aiId={makeAiId(aiId, "suggest")}
            >
              {ask.state === "busy" ? t("sx.tags.filling") : t("sx.tags.fill")}
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
                <SxButton variant="ghost" size="sm" onClick={() => fill(false)}>
                  {t("sx.ui.retry")}
                </SxButton>
              }
            >
              {t("sx.tags.suggestFail")}
            </SxNote>
          ) : null}
          <div role="status" aria-live="polite" className="sx-sf-dt__live">
            {ask.state === "done" ? (
              ask.added > 0 ? (
                <p className="sx-sf-dt__done">
                  {glyph(CircleCheckIcon, { size: 14 })}
                  <span>{t("sx.tags.filled", { n: ask.added })}</span>
                </p>
              ) : (
                <p className="sx-sf-dt__muted">{t("sx.tags.fillEmpty")}</p>
              )
            ) : null}
          </div>
          <p className="sx-sf-dt__muted">{t("sx.tags.fillHint")}</p>
        </div>
      ) : null}
    </div>
  );
}
