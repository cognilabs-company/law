"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { IconCheck } from "@/components/icons";
import { toast } from "@/lib/toast";
import { loadCrmMeta } from "@/lib/crm/useCrm";
import { saveKanbanColumns, type CrmMeta } from "@/lib/services/crm";
import { useCrmError, useStatusLabel } from "./bits";
import { SWATCHES } from "./KanbanColumns";

// One status's settings from its own column header: its title and colour.
// The six statuses are fixed (contract 13cb257 §6) — none is added,
// archived or made final here; saving sends all six, in their order, to
// PUT /crm/kanban/columns (crm.automation.manage).
export function StageMenu({ meta, status, onClose }: { meta: CrmMeta; status: string; onClose: () => void }): ReactElement {
  const t = useTranslations("crm.columns");
  const tb = useTranslations("crm.board");
  const label = useStatusLabel();
  const crmErr = useCrmError();
  const own = meta.statusInfo.find((c) => c.key === status);
  const [title, setTitle] = useState(() => label(status));
  const [color, setColor] = useState(() => own?.color || SWATCHES[0]);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const clean = title.trim();
  const clash = meta.statusInfo.some((c) => c.key !== status && label(c.key).trim().toLowerCase() === clean.toLowerCase());
  const issue = !clean ? t("needTitle") : clash ? t("sameTitle") : "";

  async function save() {
    setTried(true);
    if (busy || issue) return;
    setBusy(true);
    try {
      await saveKanbanColumns(meta.statusInfo.map((c, i) => (c.key === status ? { key: c.key, title: clean, color } : { key: c.key, title: label(c.key), color: c.color || SWATCHES[i % SWATCHES.length] })));
      await loadCrmMeta(true);
      toast(t("saved"), { tone: "ok" });
      onClose();
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="crm-stagem" ref={box} role="dialog" aria-label={tb("stageSettings")}>
      <label className="crm-stagem__f">
        <span>{tb("stageName")}</span>
        <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePh")} aria-invalid={tried && issue ? true : undefined} autoFocus />
      </label>
      {tried && issue ? <p className="crm-stagem__bad">{issue}</p> : null}
      <div className="crm-stagem__f">
        <span>{t("color")}</span>
        <div className="crm-stagem__sw" role="radiogroup" aria-label={t("color")}>
          {SWATCHES.map((c, i) => (
            <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={t("colorN", { n: i + 1 })} style={{ background: c }} className={color === c ? "on" : ""} onClick={() => setColor(c)}>
              {color === c ? <IconCheck aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      </div>
      <p className="crm-stagem__lead">{t("fixed")}</p>
      <div className="crm-stagem__acts">
        <button type="button" className="crm-btn crm-btn--sm" onClick={onClose} disabled={busy}>
          {t("cancel")}
        </button>
        <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" onClick={() => void save()} disabled={busy} aria-busy={busy || undefined}>
          {t("save")}
        </button>
      </div>
    </div>
  );
}
