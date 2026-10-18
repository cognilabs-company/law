"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { errDetail } from "@/lib/http";
import { suggestDiscoveryTerms } from "@/lib/services/studio";
import { IconClose, IconPlus, IconSparkle } from "@/components/icons";

// AI suggestions for discovery terms (2026-10-18): asked from the title,
// description and parent the form already has, shown as chips to drop,
// and added to the list only when the person says so — never saved by
// itself.
export default function DiscoverySuggest({ title, description, parentTitle, current, onAdd }: { title: string; description: string; parentTitle: string; current: string[]; onAdd: (terms: string[]) => void }) {
  const t = useTranslations("studio.discovery");
  const [busy, setBusy] = useState(false);
  const [terms, setTerms] = useState<string[] | null>(null);
  const [err, setErr] = useState("");
  const have = new Set(current.map((x) => x.toLocaleLowerCase()));
  const fresh = (terms ?? []).filter((x) => !have.has(x.toLocaleLowerCase()));

  async function ask() {
    if (busy || !title.trim()) return;
    setBusy(true);
    setErr("");
    try {
      setTerms(await suggestDiscoveryTerms({ title: title.trim(), description: description.trim(), parentTitle: parentTitle.trim() }));
    } catch (e) {
      setErr(errDetail(e) || t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stu-disc">
      <button type="button" className="btn btn--line btn--sm" onClick={() => void ask()} disabled={busy || !title.trim()} title={title.trim() ? undefined : t("needTitle")}>
        <IconSparkle aria-hidden />
        {busy ? t("asking") : terms ? t("again") : t("ask")}
      </button>
      {err ? <p className="stu-disc__err" role="alert">{err}</p> : null}
      {terms ? (
        fresh.length ? (
          <div className="stu-disc__box">
            <small>{t("lead")}</small>
            <ul>
              {fresh.map((x) => (
                <li key={x}>
                  <span>{x}</span>
                  <button type="button" onClick={() => setTerms((ts) => (ts ?? []).filter((y) => y !== x))} aria-label={t("drop", { term: x })}>
                    <IconClose />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn btn--pri btn--sm"
              onClick={() => {
                onAdd(fresh);
                setTerms(null);
              }}
            >
              <IconPlus aria-hidden />
              {t("add", { n: fresh.length })}
            </button>
          </div>
        ) : (
          <p className="stu-disc__none">{t("none")}</p>
        )
      ) : null}
    </div>
  );
}
