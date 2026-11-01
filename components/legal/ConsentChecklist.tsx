"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { legalLabelKey, legalPathFromSlug } from "@/lib/legal";
import { IconExternal } from "../icons";
import CheckBox from "../CheckBox";
import { humanize } from "@/lib/labels";

export type ConsentItem = { slug: string; title: string; version: string; body: string; language?: string };

// One explicit checkbox per current legal document, with its version, a
// new-tab link (keeps an in-progress form intact) and the exact text being
// accepted, in the page's language as the backend wrote it. State is keyed by
// slug so it survives the placeholder → API swap and a language change.
export default function ConsentChecklist({
  items,
  checked,
  onToggle,
  hint,
}: {
  items: ConsentItem[];
  checked: Record<string, boolean>;
  onToggle: (slug: string, on: boolean) => void;
  hint?: boolean;
}) {
  const t = useTranslations("legal");

  return (
    <div className="consent">
      <b className="consent__t">{t("consent.title")}</b>
      {hint ? <p className="rf__hint">{t("consent.hint")}</p> : null}
      {items.map((it) => {
        // The backend's title; the local label only for a placeholder row
        // shown while the documents load.
        const key = legalLabelKey(it.slug);
        const name = it.title || (t.has(key) ? t(key) : humanize(it.slug));
        return (
          <div className="consent__i" key={it.slug}>
            <CheckBox className="consent__row" checked={!!checked[it.slug]} onChange={(on) => onToggle(it.slug, on)}>
              {t("consent.accept", { doc: name })}
            </CheckBox>
            <div className="consent__meta">
              {it.version ? <span>{t("version", { version: it.version })}</span> : null}
              <Link href={`/legal/${legalPathFromSlug(it.slug)}`} target="_blank" rel="noopener noreferrer">
                {t("consent.openPage")}
                <IconExternal />
              </Link>
            </div>
            {it.body ? (
              <details className="consent__body">
                <summary>{t("consent.showText")}</summary>
                <p lang={it.language || undefined}>{it.body}</p>
              </details>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
