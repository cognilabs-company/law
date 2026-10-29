"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import CheckBox from "@/components/CheckBox";
import { IconCheck, IconTrash } from "@/components/icons";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { loadCrmMeta } from "@/lib/crm/useCrm";
import { archiveKanbanColumn, listKanbanColumns, saveKanbanColumns, type CrmMeta, type KanbanColumnInput } from "@/lib/services/crm";
import { useCrmError, useStatusLabel } from "./bits";
import { CrmSelect } from "./fields";
import { SWATCHES } from "./KanbanColumns";

export function StageMenu({
  meta,
  status,
  counts,
  onClose,
}: {
  meta: CrmMeta;
  status: string;
  counts: Record<string, number>;
  onClose: () => void;
}): ReactElement {
  const t = useTranslations("crm.columns");
  const tb = useTranslations("crm.board");
  const label = useStatusLabel();
  const crmErr = useCrmError();
  const [cols, setCols] = useState<KanbanColumnInput[] | null>(null);
  const [title, setTitle] = useState(() => label(status));
  const [color, setColor] = useState("");
  const [isFinal, setIsFinal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [asking, setAsking] = useState(false);
  const [moveTo, setMoveTo] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctl = new AbortController();
    const seed = (list: KanbanColumnInput[]) => {
      setCols(list);
      const mine = list.find((c) => c.key === status);
      if (!mine) return;
      setTitle(mine.title || label(status));
      setColor(mine.color || SWATCHES[0]);
      setIsFinal(mine.isFinal);
    };
    listKanbanColumns(ctl.signal).then(seed, (e) => {
      if (isAborted(e)) return;
      logApiError("crm.stage.columns", e);
      seed(meta.statusInfo.map((c) => ({ key: c.key, title: label(c.key), color: c.color || SWATCHES[0], order: c.order, isFinal: c.isFinal })));
    });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

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
  const clash = (cols ?? []).some((c) => c.key !== status && c.title.trim().toLowerCase() === clean.toLowerCase());
  const issue = !clean ? t("needTitle") : clash ? t("sameTitle") : "";
  const others = (cols ?? []).filter((c) => c.key !== status);
  const mine = counts[status] ?? 0;

  async function save() {
    setTried(true);
    if (!cols || busy || issue) return;
    setBusy(true);
    try {
      await saveKanbanColumns(cols.map((c) => (c.key === status ? { ...c, title: clean, color, isFinal } : c)));
      await loadCrmMeta(true);
      toast(t("saved"), { tone: "ok" });
      onClose();
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy(false);
    }
  }

  async function drop() {
    if (busy) return;
    setBusy(true);
    try {
      await archiveKanbanColumn(status, mine ? moveTo : undefined);
      await loadCrmMeta(true);
      toast(t("archived"), { tone: "ok" });
      onClose();
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="crm-stagem" ref={box} role="dialog" aria-label={tb("stageSettings")}>
      {asking ? (
        <>
          <p className="crm-stagem__lead">{mine ? t("archiveLeads", { n: mine }) : t("archiveEmpty")}</p>
          {mine ? (
            <label className="crm-stagem__f">
              <span>{t("moveLeadsTo")}</span>
              <CrmSelect value={moveTo} onChange={setMoveTo} options={others.map((c) => ({ value: c.key, label: c.title || label(c.key) }))} label={t("moveLeadsTo")} />
            </label>
          ) : null}
          <div className="crm-stagem__acts">
            <button type="button" className="crm-btn crm-btn--sm" onClick={() => setAsking(false)} disabled={busy}>
              {t("cancel")}
            </button>
            <button type="button" className="crm-btn crm-btn--sm crm-btn--bad" onClick={() => void drop()} disabled={busy || (!!mine && !moveTo)}>
              <IconTrash aria-hidden="true" />
              {tb("stageArchive")}
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="crm-stagem__f">
            <span>{tb("stageName")}</span>
            <input
              value={title}
              maxLength={60}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titlePh")}
              aria-invalid={tried && issue ? true : undefined}
              autoFocus
            />
          </label>
          {tried && issue ? <p className="crm-stagem__bad">{issue}</p> : null}

          <div className="crm-stagem__f">
            <span>{t("color")}</span>
            <div className="crm-stagem__sw" role="radiogroup" aria-label={t("color")}>
              {SWATCHES.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={t("colorN", { n: i + 1 })}
                  style={{ background: c }}
                  className={color === c ? "on" : ""}
                  onClick={() => setColor(c)}
                >
                  {color === c ? <IconCheck aria-hidden="true" /> : null}
                </button>
              ))}
            </div>
          </div>

          <CheckBox checked={isFinal} onChange={setIsFinal}>{t("final")}</CheckBox>

          <div className="crm-stagem__acts">
            <button type="button" className="crm-btn crm-btn--sm crm-btn--ghost" onClick={() => setAsking(true)} disabled={busy || others.length === 0}>
              <IconTrash aria-hidden="true" />
              {tb("stageRemove")}
            </button>
            <button type="button" className="crm-btn crm-btn--sm crm-btn--pri" onClick={() => void save()} disabled={busy}>
              {t("save")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
