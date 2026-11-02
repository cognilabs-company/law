"use client";

import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import { labelIn } from "@/lib/backendLabel";
import type { CheckItem, CheckRow, CheckRows, CheckVerdict } from "@/lib/services/experience";
import { IcCheck, IcClose, IcShield } from "../../icons";

const VERDICTS: readonly Exclude<CheckVerdict, "">[] = ["approved", "not_applicable", "rejected"];

function VerdictIcon({ v }: { v: Exclude<CheckVerdict, ""> }) {
  switch (v) {
    case "approved":
      return <IcCheck size={15} />;
    case "rejected":
      return <IcClose size={15} />;
    default:
      return (
        <svg className="opx-i" viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden="true" focusable="false">
          <path d="M6 12h12" />
        </svg>
      );
  }
}

export function checkLabel(c: CheckItem, i: number, locale: string, fallback: (n: number) => string): string {
  return labelIn(c, locale) || fallback(i + 1);
}

export default function VerifyChecklist({ checks, rows, onSet, locked, bad }: { checks: CheckItem[]; rows: CheckRows; onSet: (key: string, patch: Partial<CheckRow>) => void; locked: boolean; bad: boolean }) {
  const t = useTranslations("callCenter.verify");
  const locale = useLocale();
  const id = useId();
  const total = checks.length;
  const done = checks.filter((c) => rows[c.key]?.verdict).length;
  const share = total ? Math.round((done / total) * 100) : 0;
  return (
    <section className={`opx-psec opx-vrf-chk${bad ? " is-bad" : ""}`} aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`}>
        <IcShield size={17} />
        {t("checklist")}
        <em className="opx-num" data-full={total > 0 && done === total ? "" : undefined}>
          {t("answered", { done, total })}
        </em>
      </h3>
      <span className="opx-vrf-bar" aria-hidden="true">
        <i style={{ width: `${share}%` }} />
      </span>
      {checks.length ? (
        <ol className="opx-vrf-chk__list">
          {checks.map((c, i) => {
            const row = rows[c.key];
            const name = checkLabel(c, i, locale, (n) => t("checkN", { n }));
            return (
              <li key={c.key} data-verdict={row?.verdict || undefined}>
                <div className="opx-vrf-chk__q">
                  <span className="opx-vrf-chk__n opx-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>
                    <b>{name}</b>
                    {c.hint ? <small>{c.hint}</small> : null}
                  </span>
                </div>
                <div className="opx-vrf-seg" role="radiogroup" aria-label={name}>
                  {VERDICTS.map((v) => (
                    <button key={v} type="button" role="radio" aria-checked={row?.verdict === v} data-v={v} disabled={locked} onClick={() => onSet(c.key, { verdict: row?.verdict === v ? "" : v })}>
                      <VerdictIcon v={v} />
                      {t(`verdict.${v}`)}
                    </button>
                  ))}
                </div>
                {!locked || row?.note ? (
                  <input
                    className="opx-vrf-note"
                    value={row?.note ?? ""}
                    onChange={(e) => onSet(c.key, { note: e.target.value })}
                    placeholder={row?.verdict === "rejected" ? t("notePh") : t("notePhOptional")}
                    aria-label={t("noteFor", { item: name })}
                    disabled={locked}
                    maxLength={500}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
