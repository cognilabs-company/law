"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { legalLabelKey, legalPathFromSlug } from "@/lib/legal";
import { IconExternal } from "../icons";
import CheckBox from "../CheckBox";
import { humanize } from "@/lib/labels";

export type ConsentItem = { slug: string; title: string; version: string; body: string };

// One explicit checkbox per current legal document, with its version, a
// new-tab link (keeps an in-progress form intact) and the exact text being
// accepted. State is keyed by slug so it survives the placeholder → API swap.
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
  const locale = useLocale();

  return (
    <div className="consent">
      <b className="consent__t">{t("consent.title")}</b>
      {hint ? <p className="rf__hint">{t("consent.hint")}</p> : null}
      {locale !== "uz" ? <p className="consent__note">{t("uzOnlyNote")}</p> : null}
      {items.map((it) => {
        const key = legalLabelKey(it.slug);
        const name = t.has(key) ? t(key) : it.title || humanize(it.slug);
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
                <p lang="uz">{it.body}</p>
              </details>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
