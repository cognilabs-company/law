"use client";

import "../sx-core.css";
import "../editor/sx-editor-panels.css";
import "./sx-ap2.css";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { LoaderCircleIcon } from "lucide-react";
import { logApiError } from "@/lib/http";
import { publishStudioObject } from "@/lib/services/studio";
import { SxButton } from "../Button";
import { celebrate } from "../celebrate";
import { SxDialog } from "../editor/SxDialog";
import { CircleAlertIcon, CircleCheckIcon, CirclePauseIcon, RocketIcon, XIcon, ctorGlyph, glyph } from "../icons";
import { SxProgress } from "../shared/Progress";
import { useStudioLabels } from "../useStudioLabels";
import type { ApprRow } from "./model";
import { actionErrorOf } from "./review/actions";

export type BulkItem = { id: string; title: string; code: string; group: string };
export type BulkFail = { item: BulkItem; reason: string };
type Phase = "confirm" | "running" | "result";
type Run = { phase: Phase; done: number; ok: string[]; fails: BulkFail[]; current: string; stopped: boolean; stopping: boolean };

const AI = "admin.studio.approvals.bulk";
const PREVIEW = 5;
const FRESH: Run = { phase: "confirm", done: 0, ok: [], fails: [], current: "", stopped: false, stopping: false };

export const bulkItemOf = (r: ApprRow): BulkItem => ({ id: r.id, title: r.title, code: r.code, group: r.group });

export type BulkBarProps = { count: number; onPublish: () => void; onClear: () => void };

export function BulkBar({ count, onPublish, onClear }: BulkBarProps): ReactElement {
  const t = useTranslations("studio");
  return (
    <div className="sx-ap2-bar" role="region" aria-label={t("sx.ap2.bar.label")} data-ai-id={`${AI}.bar`} data-ai-type="section" data-ai-label={t("sx.ap2.bar.label")}>
      <span className="sx-ap2-bar__n" aria-live="polite">
        <span className="sx-ap2-bar__badge sx-num">{count}</span>
        <span>{t("sx.ap2.bar.count", { n: count })}</span>
      </span>
      <span className="sx-ap2-bar__acts">
        <SxButton variant="ghost" size="sm" icon={XIcon} onClick={onClear} aiId={`${AI}.clear`}>
          {t("sx.ap2.bar.clear")}
        </SxButton>
        <SxButton variant="primary" size="sm" icon={RocketIcon} onClick={onPublish} aria-haspopup="dialog" aiId={`${AI}.publish`}>
          {t("sx.ap2.bar.publish")}
        </SxButton>
      </span>
    </div>
  );
}

export type BulkDialogProps = { items: readonly BulkItem[]; onClose: (published: readonly string[]) => void; onFinished: () => void };

export function BulkDialog({ items, onClose, onFinished }: BulkDialogProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const [run, setRun] = useState<Run>(FRESH);
  const stop = useRef(false);
  const begun = useRef(false);
  const alive = useRef(true);
  const bar = useRef<HTMLDivElement>(null);
  const total = items.length;
  const titleOf = (it: BulkItem) => it.title || t("sx.ui.untitled");

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop.current = true;
    };
  }, []);

  const start = async () => {
    if (begun.current) return;
    begun.current = true;
    stop.current = false;
    const ok: string[] = [];
    const fails: BulkFail[] = [];
    setRun({ ...FRESH, phase: "running", current: items[0]?.id ?? "" });
    let done = 0;
    for (const it of items) {
      if (stop.current) break;
      if (alive.current) setRun((r) => ({ ...r, current: it.id }));
      try {
        await publishStudioObject(it.id, { note: "" });
        ok.push(it.id);
      } catch (e) {
        logApiError("studio.sx.approvals.bulk-publish", e);
        fails.push({ item: it, reason: t(actionErrorOf(e).key) });
      }
      done += 1;
      if (alive.current) setRun((r) => ({ ...r, done, ok: [...ok], fails: [...fails] }));
    }
    if (!alive.current) {
      onFinished();
      return;
    }
    if (ok.length && bar.current) celebrate(bar.current);
    setRun((r) => ({ ...r, phase: "result", current: "", stopped: done < total, stopping: false }));
    onFinished();
  };

  const halt = () => {
    stop.current = true;
    setRun((r) => ({ ...r, stopping: true }));
  };

  const running = run.phase === "running";
  const pct = total ? (run.done / total) * 100 : 0;
  const current = items.find((it) => it.id === run.current);
  const skipped = total - run.done;

  let body: ReactElement;
  let footer: ReactElement;
  if (run.phase === "confirm") {
    const shown = items.slice(0, PREVIEW);
    body = (
      <div className="sx-ap2-dlg">
        <ul className="sx-ap2-dlg__list" aria-label={t("sx.ap2.dlg.listLabel")}>
          {shown.map((it) => (
            <li key={it.id}>
              <span className="sx-ap2-dlg__ic">{ctorGlyph(it.code, it.group, { size: 15 })}</span>
              <span className="sx-ap2-dlg__t">{titleOf(it)}</span>
              <span className="sx-ap2-dlg__c">{labels.ctorName(it.code)}</span>
            </li>
          ))}
        </ul>
        {total > PREVIEW ? <p className="sx-ap2-dlg__more">{t("sx.ap2.dlg.more", { n: total - PREVIEW })}</p> : null}
      </div>
    );
    footer = (
      <>
        <SxButton variant="secondary" onClick={() => onClose([])} aiId={`${AI}.cancel`}>
          {t("sx.ui.cancel")}
        </SxButton>
        <SxButton variant="primary" icon={RocketIcon} onClick={() => void start()} aiId={`${AI}.confirm`}>
          {t("sx.ap2.dlg.confirm", { n: total })}
        </SxButton>
      </>
    );
  } else if (running) {
    body = (
      <div className="sx-ap2-dlg" aria-busy="true">
        <div className="sx-ap2-run" ref={bar}>
          <div className="sx-ap2-run__top">
            <span className="sx-ap2-run__spin">{glyph(LoaderCircleIcon, { size: 18 })}</span>
            <span className="sx-ap2-run__state">{run.stopping ? t("sx.ap2.dlg.stopping") : t("sx.ap2.dlg.running")}</span>
            <span className="sx-ap2-run__n sx-num" aria-hidden="true">
              {t("sx.ap2.dlg.progress", { done: run.done, total })}
            </span>
          </div>
          <SxProgress value={pct} size="md" label={t("sx.ap2.dlg.progressLabel", { done: run.done, total })} className="sx-ap2-run__bar" />
          {current ? <p className="sx-ap2-run__cur">{t("sx.ap2.dlg.current", { title: titleOf(current) })}</p> : null}
          {run.fails.length ? <p className="sx-ap2-run__err">{t("sx.ap2.dlg.failSoFar", { n: run.fails.length })}</p> : null}
        </div>
      </div>
    );
    footer = (
      <SxButton variant="secondary" icon={CirclePauseIcon} onClick={halt} aria-disabled={run.stopping || undefined} aiId={`${AI}.stop`}>
        {t("sx.ap2.dlg.stop")}
      </SxButton>
    );
  } else {
    const allOk = run.ok.length === total;
    body = (
      <div className="sx-ap2-dlg" role="status">
        <div className="sx-ap2-res" data-tone={allOk ? "ok" : run.ok.length ? "mixed" : "fail"}>
          <span className="sx-ap2-res__ic">{glyph(allOk ? CircleCheckIcon : CircleAlertIcon, { size: 22 })}</span>
          <div className="sx-ap2-res__tx">
            <p className="sx-ap2-res__t">{run.ok.length ? t("sx.ap2.dlg.ok", { n: run.ok.length }) : t("sx.ap2.dlg.noneOk")}</p>
            {run.fails.length ? <p className="sx-ap2-res__s">{t("sx.ap2.dlg.fail", { n: run.fails.length })}</p> : null}
            {run.stopped && skipped > 0 ? <p className="sx-ap2-res__s">{t("sx.ap2.dlg.skipped", { n: skipped })}</p> : null}
          </div>
        </div>
        {run.fails.length ? (
          <ul className="sx-ap2-dlg__list" data-fail="" aria-label={t("sx.ap2.dlg.failList")}>
            {run.fails.map((f) => (
              <li key={f.item.id}>
                <span className="sx-ap2-dlg__ic">{ctorGlyph(f.item.code, f.item.group, { size: 15 })}</span>
                <span className="sx-ap2-dlg__t">{titleOf(f.item)}</span>
                <span className="sx-ap2-dlg__why">{f.reason}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
    footer = (
      <SxButton variant="primary" onClick={() => onClose(run.ok)} aiId={`${AI}.close`}>
        {t("sx.ui.close")}
      </SxButton>
    );
  }

  return (
    <SxDialog
      open
      onClose={() => onClose(run.ok)}
      title={t("sx.ap2.dlg.title")}
      description={t("sx.ap2.dlg.lead", { n: total })}
      busy={running}
      size="md"
      aiId={AI}
      footer={footer}
    >
      {body}
    </SxDialog>
  );
}
