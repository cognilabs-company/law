"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { clientChecklistItem, type ChecklistItem } from "@/lib/services/marketRuntime";
import { IconChevronDown } from "@/components/icons";
import { proofsOf, type HeadingLevel } from "./facts";
import "./runtime.css";

export function FactHeading({ level = 3, id, children }: { level?: HeadingLevel; id?: string; children: ReactNode }) {
  if (level === 5)
    return (
      <h5 className="mkrt-h" id={id}>
        {children}
      </h5>
    );
  if (level === 4)
    return (
      <h4 className="mkrt-h" id={id}>
        {children}
      </h4>
    );
  return (
    <h3 className="mkrt-h" id={id}>
      {children}
    </h3>
  );
}

export function ChecklistPreview({ items: given, limit = 4, tone = "detail", idBase, level = 3 }: { items: readonly ChecklistItem[]; limit?: number; tone?: "detail" | "assist"; idBase: string; level?: HeadingLevel }) {
  // Clients read the preview: only the client wording of each item.
  const items = given.map(clientChecklistItem);
  const t = useTranslations("marketplace.runtime");
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const cap = Math.max(1, limit);
  const extra = items.length - cap;
  const shown = open || extra <= 0 ? items : items.slice(0, cap);
  const listId = `${idBase}-list`;
  return (
    <div className={`mkrt-ck mkrt-ck--${tone}`}>
      <FactHeading level={level} id={`${idBase}-title`}>
        {t("checklistTitle")}
      </FactHeading>
      {tone === "detail" ? <p className="mkrt-lead">{t("checklistLead")}</p> : null}
      <ol className="mkrt-ck__list" id={listId} aria-labelledby={`${idBase}-title`}>
        {shown.map((item, i) => {
          const proofs = proofsOf(item);
          return (
            <li key={item.id || `${item.title}-${i}`}>
              <span className="mkrt-ck__t">
                {item.title}
                {item.required ? <em className="mkrt-ck__req">{t("checklistRequired")}</em> : null}
              </span>
              {item.description ? <small>{item.description}</small> : null}
              {proofs.length ? <small className="mkrt-ck__proof">{t("checklistProof", { list: proofs.map((k) => t(`proof.${k}`)).join(", ") })}</small> : null}
            </li>
          );
        })}
      </ol>
      {extra > 0 ? (
        <button type="button" className="mkrt-more" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((v) => !v)}>
          {open ? t("checklistLess") : t("checklistMore", { n: extra })}
          <IconChevronDown aria-hidden="true" className={open ? "is-up" : undefined} />
        </button>
      ) : null}
    </div>
  );
}
