"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckIcon, ChevronDownIcon, CopyIcon, FileTextIcon, FilesIcon, RefreshCwIcon } from "lucide-react";
import { fmtDateTime } from "@/lib/date";
import { isAborted, parseServerTime } from "@/lib/http";
import { listCopilotDrafts, type CopilotDraft, type CopilotEntityRef } from "@/lib/services/copilotPanel";
import { ACTION_ICONS, copilotSeg } from "./CopilotAnswer";

const ICON = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

export default function CopilotDrafts({ entity, label, onReload }: { entity: CopilotEntityRef | null; label: string; onReload: () => void }) {
  const t = useTranslations("copilot");
  const locale = useLocale();
  const [res, setRes] = useState<{ items: CopilotDraft[] | null; failed: boolean }>({ items: null, failed: false });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState("");
  const type = entity?.type ?? "";
  const id = entity?.id ?? "";

  useEffect(() => {
    const c = new AbortController();
    listCopilotDrafts(id ? { type, id } : null, c.signal)
      .then((items) => {
        if (!c.signal.aborted) setRes({ items, failed: false });
      })
      .catch((e: unknown) => {
        if (!c.signal.aborted && !isAborted(e)) setRes({ items: [], failed: true });
      });
    return () => c.abort();
  }, [type, id]);

  async function copy(d: CopilotDraft) {
    try {
      await navigator.clipboard.writeText(d.content);
      setCopied(d.id);
      window.setTimeout(() => setCopied((c) => (c === d.id ? "" : c)), 1600);
    } catch {
      setCopied("");
    }
  }

  const typeLabel = (x: string) => (x && t.has(`action.type.${x}`) ? t(`action.type.${x}`) : x.replace(/[_-]+/g, " "));
  const statusLabel = (x: string) => (!x || x === "draft" ? t("drafts.status") : t.has(`drafts.statusName.${x}`) ? t(`drafts.statusName.${x}`) : x.replace(/[_-]+/g, " "));

  return (
    <div className="cpl-drafts" data-ai-private="">
      <div className="cpl-drafts__h">
        <p>{entity ? t("drafts.forContext", { title: label }) : t("drafts.all")}</p>
        <button type="button" className="cpl-ib cpl-ib--sm" onClick={onReload} aria-label={t("drafts.reload")} title={t("drafts.reload")} data-ai-id="copilot.drafts.reload">
          <RefreshCwIcon {...ICON} />
        </button>
      </div>
      {res.items === null ? (
        <div className="cpl-drafts__state" role="status">
          <span className="cpl-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {t("drafts.loading")}
        </div>
      ) : res.failed ? (
        <div className="cpl-drafts__state cpl-drafts__state--err" role="alert">
          {t("drafts.error")}
        </div>
      ) : !res.items.length ? (
        <div className="cpl-drafts__empty">
          <span className="cpl-drafts__emptyic" aria-hidden="true">
            <FilesIcon {...ICON} size={22} />
          </span>
          <b>{entity ? t("drafts.emptyCtx") : t("drafts.empty")}</b>
          <span>{t("drafts.emptyHint")}</span>
        </div>
      ) : (
        <ul className="cpl-drafts__list">
          {res.items.map((d, i) => {
            const Icon = ACTION_ICONS[d.type] ?? FileTextIcon;
            const key = d.id || `${d.title}-${i}`;
            const seg = copilotSeg(d.id || String(i));
            const isOpen = !!open[key];
            const when = d.at ? fmtDateTime(parseServerTime(d.at), locale) : "";
            return (
              <li key={key} className="cpl-draft">
                <header className="cpl-draft__h">
                  <span className="cpl-draft__ic">
                    <Icon {...ICON} />
                  </span>
                  <span className="cpl-draft__tt">
                    <b>{d.title || typeLabel(d.type) || t("drafts.untitled")}</b>
                    <small>{[typeLabel(d.type), when].filter(Boolean).join(" · ")}</small>
                  </span>
                  <span className="cpl-tag" data-status={d.status || "draft"}>
                    {statusLabel(d.status)}
                  </span>
                </header>
                {d.content ? <p className={`cpl-draft__body${isOpen ? " is-open" : ""}`}>{d.content}</p> : null}
                <footer className="cpl-draft__f">
                  <button type="button" className="cpl-btn cpl-btn--ghost cpl-btn--sm" onClick={() => void copy(d)} disabled={!d.content} data-ai-id={`copilot.draft.${seg}.copy`}>
                    {copied === d.id && d.id ? <CheckIcon {...ICON} size={14} /> : <CopyIcon {...ICON} size={14} />}
                    {copied === d.id && d.id ? t("drafts.copied") : t("drafts.copy")}
                  </button>
                  {d.content ? (
                    <button
                      type="button"
                      className="cpl-btn cpl-btn--ghost cpl-btn--sm"
                      aria-expanded={isOpen}
                      onClick={() => setOpen((m) => ({ ...m, [key]: !m[key] }))}
                      data-ai-id={`copilot.draft.${seg}.open`}
                    >
                      <ChevronDownIcon {...ICON} size={14} className={isOpen ? "cpl-rot" : undefined} />
                      {isOpen ? t("drafts.collapse") : t("drafts.open")}
                    </button>
                  ) : null}
                </footer>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
