"use client";

import "../sx-core.css";
import "./sx-inline.css";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { aiId, aiSeg } from "@/lib/ai/ids";
import { Link } from "@/i18n/navigation";
import { ExternalLinkIcon, HourglassIcon, PencilIcon, PencilLineIcon, TriangleAlertIcon, glyph } from "../icons";
import type { SxIcon } from "../types";
import { canReopen, objectHref, type InlinePending } from "./model";

type Tone = "submitted" | "draft" | "returned" | "approved";

function toneOf(status: string): Tone {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "draft") return "draft";
  if (s === "changes_requested" || s === "returned" || s === "rejected") return "returned";
  if (s === "approved") return "approved";
  return "submitted";
}

const ICON: Readonly<Record<Tone, SxIcon>> = { submitted: HourglassIcon, draft: PencilLineIcon, returned: TriangleAlertIcon, approved: HourglassIcon };

export function PendingChips({ items, label, canEdit, onOpen, ai }: { items: readonly InlinePending[]; label: string; canEdit: boolean; onOpen: (item: InlinePending) => void; ai: string }): ReactElement | null {
  const t = useTranslations("studio");
  if (!items.length) return null;
  return (
    <ul className="sx-inl-chips" aria-label={label}>
      {items.map((p) => {
        const tone = toneOf(p.status);
        const state = t(`sx.inline.state.${tone}${p.isNew ? "" : "Edit"}`);
        const name = p.title || t("sx.ui.untitled");
        const base = aiId(ai, "pending", aiSeg(p.objectId));
        return (
          <li key={p.objectId} className="sx-inl-chip" data-tone={tone} data-ai-id={base} data-ai-type="status" data-ai-label={`${name}: ${state}`}>
            <span className="sx-inl-chip__icon" aria-hidden="true">
              {glyph(ICON[tone], { size: 14 })}
            </span>
            <span className="sx-inl-chip__text" title={name}>
              {name}
            </span>
            <span className="sx-inl-chip__state">{state}</span>
            {canEdit && canReopen(p.status) ? (
              <button type="button" className="sx-inl-chip__btn" onClick={() => onOpen(p)} aria-label={t("sx.inline.continueOf", { name })} title={t("sx.inline.continue")} data-ai-id={aiId(base, "open")}>
                {glyph(PencilIcon, { size: 14 })}
              </button>
            ) : null}
            <Link href={objectHref(p.objectId)} target="_blank" className="sx-inl-chip__btn" aria-label={t("sx.inline.openOf", { name })} title={t("sx.inline.openFull")} data-ai-id={aiId(base, "link")}>
              {glyph(ExternalLinkIcon, { size: 14 })}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
