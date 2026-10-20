"use client";

import "../../sx-core.css";
import "../../sx-form.css";
import "../sx-schema.css";
import "./sx-k02.css";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { aiId as makeAiId } from "@/lib/ai/ids";
import { logApiError } from "@/lib/http";
import { SxButton } from "../../Button";
import { CheckIcon, PlusIcon, RefreshCwIcon, SparklesIcon, glyph } from "../../icons";
import { SxNote } from "../../layout/Note";
import { suggestFailKey, suggestServiceTerms } from "./api";
import { freshGroups, suggestRetryable, type SuggestGroup } from "./model";

type Ask = { state: "idle" } | { state: "busy" } | { state: "fail"; key: string } | { state: "done"; groups: SuggestGroup[] };

export type ServiceSuggestProps = {
  id: string;
  ai: string;
  ready: boolean;
  body: Record<string, unknown>;
  current: readonly string[];
  onAdd: (terms: string[]) => void;
};

export function ServiceSuggest({ id, ai, ready, body, current, onAdd }: ServiceSuggestProps): ReactElement {
  const t = useTranslations("studio");
  const [ask, setAsk] = useState<Ask>({ state: "idle" });
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [announce, setAnnounce] = useState("");
  const ctrl = useRef<AbortController | null>(null);
  const bodyRef = useRef(body);
  useEffect(() => {
    bodyRef.current = body;
  });
  useEffect(() => () => ctrl.current?.abort(), []);

  const busy = ask.state === "busy";
  const needId = `${id}-ai-need`;
  const headId = `${id}-ai-head`;

  const run = () => {
    if (!ready || busy) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setAsk({ state: "busy" });
    setPicked([]);
    setAnnounce("");
    suggestServiceTerms(bodyRef.current, c.signal).then(
      (res) => {
        if (!c.signal.aborted) setAsk({ state: "done", groups: res.groups });
      },
      (e: unknown) => {
        if (c.signal.aborted) return;
        logApiError("studio.sx.k02.suggest", e);
        setAsk({ state: "fail", key: suggestFailKey(e) });
      },
    );
  };

  const groups = ask.state === "done" ? freshGroups(ask.groups, current) : [];
  const all = groups.flatMap((g) => g.items);
  const chosen = picked.filter((s) => all.includes(s));
  const allOn = all.length > 0 && chosen.length === all.length;
  const toggle = (s: string) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  const add = () => {
    if (!chosen.length) return;
    onAdd(chosen);
    setAnnounce(t("sx.k02t.added", { n: chosen.length }));
    setPicked([]);
  };

  return (
    <div className="sx-k2t" data-ai-id={makeAiId(ai, "ai")} data-ai-type="section" data-ai-label={t("sx.k02t.suggest")}>
      <div className="sx-sf-dt__row">
        <SxButton
          variant="secondary"
          size="sm"
          icon={SparklesIcon}
          busy={busy}
          aria-disabled={!ready || busy ? true : undefined}
          aria-describedby={!ready ? needId : undefined}
          onClick={run}
          aiId={makeAiId(ai, "suggest")}
        >
          {busy ? t("sx.k02t.busy") : t("sx.k02t.suggest")}
        </SxButton>
        {!ready ? (
          <span className="sx-sf-dt__need" id={needId}>
            {t("sx.k02t.need")}
          </span>
        ) : null}
      </div>
      {ask.state === "fail" ? (
        <SxNote
          tone={ask.key === "sx.k02t.err.unavailable" || ask.key === "sx.k02t.err.context" ? "warn" : "error"}
          role="status"
          action={
            suggestRetryable(ask.key) ? (
              <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={run} aiId={makeAiId(ai, "suggest", "retry")}>
                {t("sx.ui.retry")}
              </SxButton>
            ) : undefined
          }
        >
          {t(ask.key)}
        </SxNote>
      ) : null}
      {ask.state === "done" ? (
        groups.length ? (
          <div className="sx-k2t__panel" role="group" aria-labelledby={headId}>
            <div className="sx-k2t__head">
              <span className="sx-k2t__title" id={headId}>
                {glyph(SparklesIcon, { size: 15 })}
                {t("sx.k02t.title")}
              </span>
              <SxButton variant="ghost" size="sm" onClick={() => setPicked(allOn ? [] : all)} aiId={makeAiId(ai, "suggest", "all")}>
                {allOn ? t("sx.k02t.clear") : t("sx.k02t.selectAll")}
              </SxButton>
            </div>
            <p className="sx-k2t__lead">{t("sx.k02t.lead")}</p>
            {groups.map((g) => {
              const gid = `${id}-ai-${g.lang}`;
              return (
                <div key={g.lang} className="sx-k2t__group" role="group" aria-labelledby={gid}>
                  <span className="sx-k2t__lang" id={gid}>
                    {t(`sx.k02t.lang.${g.lang}`)}
                  </span>
                  <ul className="sx-k2t__chips">
                    {g.items.map((s, i) => {
                      const on = chosen.includes(s);
                      return (
                        <li key={s}>
                          <button
                            type="button"
                            className="sx-k2t__chip"
                            aria-pressed={on}
                            onClick={() => toggle(s)}
                            data-ai-id={makeAiId(ai, "suggest", g.lang, i)}
                            data-ai-type="button"
                            data-ai-label={s}
                          >
                            <span className="sx-k2t__mark" aria-hidden="true">
                              {glyph(on ? CheckIcon : PlusIcon, { size: 13, strokeWidth: on ? 2.5 : 2 })}
                            </span>
                            <span className="sx-k2t__text">{s}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
            <div className="sx-k2t__foot">
              <SxButton variant="primary" size="sm" icon={PlusIcon} disabled={!chosen.length} onClick={add} aiId={makeAiId(ai, "suggest", "add")}>
                {t("sx.k02t.addSelected", { n: chosen.length })}
              </SxButton>
              <SxButton variant="ghost" size="sm" onClick={() => setAsk({ state: "idle" })} aiId={makeAiId(ai, "suggest", "close")}>
                {t("sx.k02t.dismiss")}
              </SxButton>
            </div>
          </div>
        ) : (
          <p className="sx-sf-dt__muted" role="status">
            {t("sx.k02t.none")}
          </p>
        )
      ) : null}
      <span className="sx-vh" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}
