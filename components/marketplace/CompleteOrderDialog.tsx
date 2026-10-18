"use client";

import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { Notice } from "@/components/admin/AdminBits";
import { IconAlert, IconCheck, IconClose, IconFileText, IconClipboardCheck, IconPaperclip } from "@/components/icons";
import { Link } from "@/i18n/navigation";
import { completeMarketplaceOrder, type MarketCompletion, type MarketOrder, type ResultFile } from "@/lib/services/marketplace";
import { checklistBlockOf, getOrderChecklist, type BlockingItem, type OrderChecklist as OrderChecklistData } from "@/lib/services/marketRuntime";
import { checklistBlockers } from "./order/checklistRules";
import { noteOrderLock } from "./order/lock";
import { ORDER_FILE_MB, ORDER_FILES_MAX, uploadOrderFile } from "./order/upload";
import { useMarketError } from "./useMarketError";
import "./completeOrder.css";

const TEXT_MAX = 4000;
const FILES_MAX = ORDER_FILES_MAX;
const FILE_MB = ORDER_FILE_MB;

type Attachment = { key: string; file: File; state: "wait" | "up" | "done" | "fail"; uploaded: ResultFile | null };

export default function CompleteOrderDialog({
  order,
  onClose,
  onDone,
  checklist,
  onShowChecklist,
  detailHref,
}: {
  order: MarketOrder | null;
  onClose: () => void;
  onDone: (status: string, result?: MarketCompletion) => void;
  checklist?: OrderChecklistData | null;
  onShowChecklist?: () => void;
  detailHref?: string;
}): ReactElement {
  const t = useTranslations("marketplace.complete");
  const td = useTranslations("marketplace.orderDetail.complete");
  const marketErr = useMarketError();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [blocked, setBlocked] = useState<BlockingItem[] | null>(null);
  const [fetched, setFetched] = useState<{ id: string; list: OrderChecklistData | null } | null>(null);
  const blockId = useId();
  const pendId = useId();
  const errId = useId();
  const input = useRef<HTMLInputElement>(null);
  const submitBtn = useRef<HTMLButtonElement>(null);
  const [refocus, setRefocus] = useState(0);
  useEffect(() => {
    if (!refocus) return;
    const at = document.activeElement;
    if (!at || at === document.body) submitBtn.current?.focus();
  }, [refocus]);
  const key = order?.id ?? "";
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setText("");
    setFiles([]);
    setErr("");
    setBlocked(null);
    setFetched(null);
  }
  const needList = checklist === undefined && !!key;
  useEffect(() => {
    if (!needList || !key) return;
    const ctrl = new AbortController();
    getOrderChecklist(key, ctrl.signal)
      .then((list) => {
        if (!ctrl.signal.aborted) setFetched({ id: key, list });
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setFetched({ id: key, list: null });
      });
    return () => ctrl.abort();
  }, [needList, key]);
  if (!order) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;
  const target = order;
  const canAttach = !!target.roomId;
  const ready = text.trim().length > 0 || files.length > 0;
  const list = checklist !== undefined ? checklist : fetched?.id === key ? fetched.list : null;
  const checking = needList && fetched?.id !== key;
  const pending = checklistBlockers(list);
  const gated = pending.length > 0;
  const toChecklist = detailHref ? `${detailHref}#mod-checklist` : "";

  function showChecklist() {
    const show = onShowChecklist;
    onClose();
    if (show) setTimeout(show, 0);
  }

  function add(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    let tooBig = false;
    for (const f of Array.from(list)) {
      if (next.length >= FILES_MAX) break;
      if (f.size > FILE_MB * 1024 * 1024) {
        tooBig = true;
        continue;
      }
      next.push({ key: `${f.name}-${f.size}-${f.lastModified}`, file: f, state: "wait", uploaded: null });
    }
    setFiles(next);
    setErr(tooBig ? t("tooBig", { mb: FILE_MB }) : "");
    if (input.current) input.current.value = "";
  }

  async function go() {
    if (busy) return;
    if (!ready) {
      setErr(t("required"));
      return;
    }
    setBusy(true);
    setErr("");
    setBlocked(null);
    const out: ResultFile[] = [];
    try {
      for (const p of files) {
        if (p.uploaded) {
          out.push(p.uploaded);
          continue;
        }
        setFiles((cur) => cur.map((x) => (x.key === p.key ? { ...x, state: "up" } : x)));
        try {
          const u = await uploadOrderFile(target.roomId, p.file, t("caption"));
          const done: ResultFile = { fileId: u.id, fileName: u.name, downloadUrl: u.url };
          out.push(done);
          setFiles((cur) => cur.map((x) => (x.key === p.key ? { ...x, state: "done", uploaded: done } : x)));
        } catch (e) {
          setFiles((cur) => cur.map((x) => (x.key === p.key ? { ...x, state: "fail" } : x)));
          throw e;
        }
      }
      const r = await completeMarketplaceOrder(target.id, { resultText: text.slice(0, TEXT_MAX), resultFiles: out });
      noteOrderLock(target.id, { chatReadOnly: r.chatReadOnly ?? true, callsAllowed: r.callsAllowed ?? false });
      onDone(r.status, r);
      onClose();
    } catch (e) {
      const items = checklistBlockOf(e);
      if (items) setBlocked(items);
      else setErr(marketErr(e, t("error")));
      setRefocus((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={busy ? () => undefined : onClose} title={t("title")}>
      <div className="mk-act mkc" data-ai-id="advocate.marketplace-orders.complete-modal" data-ai-type="modal" data-ai-label={t("title")} data-ai-private>
        <div className="mk-act__head">
          {target.workId ? <span className="wid">{target.workId}</span> : null}
          <b>{target.serviceTitle}</b>
        </div>
        <p>{t("lead")}</p>
        {checking ? (
          <small className="mkc__hint" role="status">
            {td("checking")}
          </small>
        ) : null}
        {gated ? (
          <div id={pendId} className="mkc__files mkc__blocked mkc__pending" role="status" data-ai-id="advocate.marketplace-orders.complete.pending" data-ai-type="section" data-ai-label={td("pendingTitle")}>
            <p className="anote anote--err">
              <b>{td("pendingTitle")}</b> {td("pendingCount", { n: pending.length })}
            </p>
            <ul className="mkc__list" aria-label={td("pendingTitle")}>
              {pending.map((it, i) => (
                <li key={`${it.id || it.title}-${i}`} className="is-fail">
                  <IconAlert aria-hidden="true" />
                  <span>{it.title || t("blockedItem", { n: i + 1 })}</span>
                  <em>{t("blockedPending")}</em>
                </li>
              ))}
            </ul>
            {onShowChecklist ? (
              <button type="button" className="btn btn--line btn--sm mkc__open" onClick={showChecklist} data-ai-id="advocate.marketplace-orders.complete.open-checklist">
                <IconClipboardCheck aria-hidden="true" />
                {td("openChecklist")}
              </button>
            ) : toChecklist ? (
              <Link href={toChecklist} className="btn btn--line btn--sm mkc__open" onClick={onClose} data-ai-id="advocate.marketplace-orders.complete.open-checklist">
                <IconClipboardCheck aria-hidden="true" />
                {td("openChecklist")}
              </Link>
            ) : null}
          </div>
        ) : null}
        <label className="mk-in">
          <span>{t("textLabel")}</span>
          <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, TEXT_MAX))} placeholder={t("textPh")} rows={5} maxLength={TEXT_MAX} data-ai-id="advocate.marketplace-orders.complete.text" data-ai-label={t("textLabel")} />
          <em>
            {text.length}/{TEXT_MAX}
          </em>
        </label>
        <div className="mkc__files">
          <div className="mkc__fh">
            <span>{t("filesLabel")}</span>
            <button type="button" className="btn btn--line btn--sm" disabled={!canAttach || busy || files.length >= FILES_MAX} onClick={() => input.current?.click()} data-ai-id="advocate.marketplace-orders.complete.attach">
              <IconPaperclip aria-hidden="true" />
              {t("attach")}
            </button>
            <input ref={input} type="file" multiple hidden onChange={(e) => add(e.target.files)} />
          </div>
          {!canAttach ? <small className="mkc__hint">{t("noRoom")}</small> : <small className="mkc__hint">{t("filesHint", { n: FILES_MAX, mb: FILE_MB })}</small>}
          {files.length ? (
            <ul className="mkc__list">
              {files.map((p) => (
                <li key={p.key} className={`is-${p.state}`}>
                  <IconFileText aria-hidden="true" />
                  <span>{p.file.name}</span>
                  <em>{t(`state.${p.state}`)}</em>
                  {p.state === "done" || busy ? null : (
                    <button type="button" aria-label={t("remove")} onClick={() => setFiles((cur) => cur.filter((x) => x.key !== p.key))}>
                      <IconClose aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <p className={`mkc__rule${ready ? " is-ok" : ""}`}>
          <IconCheck aria-hidden="true" />
          {t("rule")}
        </p>
        {blocked ? (
          <div id={blockId} className="mkc__files mkc__blocked" role="alert" data-ai-id="advocate.marketplace-orders.complete.blocked" data-ai-type="section" data-ai-label={t("checklistTitle")}>
            <p className="anote anote--err">
              <b>{t("checklistTitle")}</b> {t("checklistLead", { n: blocked.length })}
            </p>
            {blocked.length ? (
              <ul className="mkc__list" aria-label={t("checklistTitle")}>
                {blocked.map((it, i) => (
                  <li key={`${it.id || it.title}-${i}`} className="is-fail">
                    <IconAlert aria-hidden="true" />
                    <span>{it.title || t("blockedItem", { n: i + 1 })}</span>
                    <em>{t("blockedPending")}</em>
                  </li>
                ))}
              </ul>
            ) : null}
            {onShowChecklist ? (
              <button type="button" className="btn btn--line btn--sm mkc__open" onClick={showChecklist} data-ai-id="advocate.marketplace-orders.complete.blocked.open-checklist">
                <IconClipboardCheck aria-hidden="true" />
                {td("openChecklist")}
              </button>
            ) : toChecklist ? (
              <Link href={toChecklist} className="btn btn--line btn--sm mkc__open" onClick={onClose} data-ai-id="advocate.marketplace-orders.complete.blocked.open-checklist">
                <IconClipboardCheck aria-hidden="true" />
                {td("openChecklist")}
              </Link>
            ) : null}
            <small className="mkc__hint">{t("checklistNext", { action: t("confirm") })}</small>
          </div>
        ) : null}
        {err ? (
          <div id={errId}>
            <Notice ok={false} msg={err} />
          </div>
        ) : null}
        <div className="mk-buy__acts">
          <button ref={submitBtn} type="button" className="btn btn--grad" disabled={busy || !ready || gated} aria-describedby={[gated ? pendId : "", blocked ? blockId : "", err ? errId : ""].filter(Boolean).join(" ") || undefined} onClick={() => void go()} data-ai-id="advocate.marketplace-orders.complete.submit">
            {busy ? t("sending") : t("confirm")}
          </button>
          <button type="button" className="btn btn--line" disabled={busy} onClick={onClose}>
            {t("keep")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
