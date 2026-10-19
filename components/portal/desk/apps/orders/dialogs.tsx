"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { isAborted } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { completeMarketplaceOrder, marketErrorCode, PRICE_OPTION_ERRORS, requestAdditionalPayment, type MarketCompletion, type MarketOrder, type ResultFile, type SupplementalPayment } from "@/lib/services/marketplace";
import { checklistBlockOf, type BlockingItem, type OrderChecklist } from "@/lib/services/marketRuntime";
import { getPriceOptions, getPriceQuote, type PriceOptionSection, type PriceQuote } from "@/lib/services/priceOptions";
import { checklistBlockers } from "@/components/marketplace/order/checklistRules";
import { noteOrderLock } from "@/components/marketplace/order/lock";
import { ORDER_FILE_MB, ORDER_FILES_MAX, uploadOrderFile } from "@/components/marketplace/order/upload";
import { useMarketError } from "@/components/marketplace/useMarketError";
import { IconAlert, IconClock, IconClose, IconPaperclip } from "@/components/icons";
import { Banner, Btn, Check, Dialog, Field, Loading, TextArea } from "../../kit/kit";

const TEXT_MAX = 4000;

// Completing an order with its result: the text and the files the client
// gets; required checklist items still open hold it back, and say which.
export function CompleteDialog({ open, o, checklist, onClose, onDone }: { open: boolean; o: MarketOrder; checklist: OrderChecklist | null; onClose: () => void; onDone: (status: string, r?: MarketCompletion) => void }) {
  const t = useTranslations("marketplace.complete");
  const td = useTranslations("marketplace.orderDetail.complete");
  const marketErr = useMarketError();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [blocked, setBlocked] = useState<BlockingItem[] | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const pending = checklistBlockers(checklist);
  async function go() {
    if (busy) return;
    if (!text.trim() && !files.length) return setErr(t("required"));
    setBusy(true);
    setErr("");
    setBlocked(null);
    try {
      const out: ResultFile[] = [];
      for (const f of files) {
        const u = await uploadOrderFile(o.roomId, f, t("caption"));
        out.push({ fileId: u.id, fileName: u.name, downloadUrl: u.url });
      }
      const r = await completeMarketplaceOrder(o.id, { resultText: text.slice(0, TEXT_MAX), resultFiles: out });
      noteOrderLock(o.id, { chatReadOnly: r.chatReadOnly ?? true, callsAllowed: r.callsAllowed ?? false });
      onDone(r.status, r);
      setText("");
      setFiles([]);
      onClose();
    } catch (e) {
      const items = checklistBlockOf(e);
      if (items) setBlocked(items);
      else setErr(marketErr(e, t("error")));
    } finally {
      setBusy(false);
    }
  }
  const open2 = blocked ?? pending;
  return (
    <Dialog
      open={open}
      title={t("title")}
      onClose={() => !busy && onClose()}
      onSubmit={() => void go()}
      width={540}
      actions={
        <>
          <Btn onClick={onClose} disabled={busy}>
            {t("keep")}
          </Btn>
          <Btn kind="primary" type="submit" busy={busy} disabled={!!pending.length}>
            {t("confirm")}
          </Btn>
        </>
      }
    >
      <p className="dx-dlg__text">{t("lead")}</p>
      {open2.length ? (
        <Banner tone="err" title={td("pendingTitle")}>
          <ul className="dxm-block">
            {open2.map((it, i) => (
              <li key={`${it.id}-${i}`}>
                <IconAlert aria-hidden />
                {it.title || t("blockedItem", { n: i + 1 })}
              </li>
            ))}
          </ul>
        </Banner>
      ) : null}
      <Field label={t("textLabel")} hint={`${text.length}/${TEXT_MAX}`}>
        <TextArea value={text} onChange={(v) => setText(v.slice(0, TEXT_MAX))} rows={6} placeholder={t("textPh")} maxLength={TEXT_MAX} />
      </Field>
      <Field label={t("filesLabel")} hint={o.roomId ? t("filesHint", { n: ORDER_FILES_MAX, mb: ORDER_FILE_MB }) : t("noRoom")}>
        <span className="dxm-files">
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="dxm-file is-static is-new">
              <IconPaperclip aria-hidden />
              {f.name}
              <button type="button" onClick={() => setFiles((l) => l.filter((_, k) => k !== i))} aria-label={f.name}>
                <IconClose />
              </button>
            </span>
          ))}
          {o.roomId && files.length < ORDER_FILES_MAX ? (
            <Btn small icon={<IconPaperclip />} onClick={() => pick.current?.click()}>
              {t("attach")}
            </Btn>
          ) : null}
        </span>
        <input ref={pick} type="file" multiple hidden onChange={(e) => (setFiles((l) => [...l, ...[...(e.target.files ?? [])].filter((f) => f.size <= ORDER_FILE_MB * 1048576)].slice(0, ORDER_FILES_MAX)), (e.target.value = ""))} />
      </Field>
      {err ? <Banner tone="err" title={err} /> : null}
    </Dialog>
  );
}

// Asking the client to pay for options the order did not include: the
// options left to add, the new total quoted by the backend, a note.
export function SupplementalDialog({ open, o, onClose, onSent }: { open: boolean; o: MarketOrder; onClose: () => void; onSent: (s: SupplementalPayment | null) => void }) {
  const t = useTranslations("marketplace.supplemental");
  const te = useTranslations("enums");
  const marketErr = useMarketError();
  const target = o.packageId ? "package" : "service";
  const targetId = o.packageId || o.serviceId;
  const [sections, setSections] = useState<PriceOptionSection[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [quote, setQuote] = useState<{ key: string; q: PriceQuote | null }>({ key: "", q: null });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [reload, setReload] = useState(0);
  const paid = o.selectedOptions.map((x) => x.id).filter(Boolean);
  const paidKey = paid.join("|");
  const pickedKey = picked.join("|");
  useEffect(() => {
    if (!open || !targetId) return;
    const c = new AbortController();
    getPriceOptions(target, targetId, c.signal)
      .then((f) => setSections(f.sections))
      .catch((e) => !isAborted(e) && setSections([]));
    return () => c.abort();
  }, [open, target, targetId, reload]);
  useEffect(() => {
    if (!open || !targetId || !pickedKey) return;
    const c = new AbortController();
    const h = setTimeout(() => {
      getPriceQuote(target, targetId, [...(paidKey ? paidKey.split("|") : []), ...pickedKey.split("|")], { lawyerUserId: o.lawyerUserId, signal: c.signal })
        .then((q) => setQuote({ key: pickedKey, q }))
        .catch((e) => !isAborted(e) && setQuote({ key: pickedKey, q: null }));
    }, 250);
    return () => {
      clearTimeout(h);
      c.abort();
    };
  }, [open, target, targetId, paidKey, pickedKey, o.lawyerUserId]);
  const left = (sections ?? []).map((s) => ({ ...s, options: s.options.filter((x) => !paid.includes(x.id)) })).filter((s) => s.options.length);
  const q = quote.key === pickedKey ? quote.q : null;
  const cur = (v: number) => `${fmtUzs(v)} ${!o.currency || o.currency === "UZS" ? te("currency") : o.currency}`;
  async function send() {
    if (busy || !picked.length) return;
    setBusy(true);
    setErr("");
    try {
      const s = await requestAdditionalPayment(o.id, { selectedOptionIds: picked, note: note.slice(0, 1000) });
      onSent(s);
      setPicked([]);
      setNote("");
      onClose();
    } catch (e) {
      setErr(marketErr(e, t("error")));
      if (PRICE_OPTION_ERRORS.includes(marketErrorCode(e))) setReload((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      title={t("title")}
      onClose={() => !busy && onClose()}
      onSubmit={() => void send()}
      width={560}
      actions={
        <>
          <Btn onClick={onClose} disabled={busy}>
            {t("keep")}
          </Btn>
          <Btn kind="primary" type="submit" busy={busy} disabled={!picked.length || (!!pickedKey && quote.key !== pickedKey)}>
            {t("submit")}
          </Btn>
        </>
      }
    >
      <ul className="dxm-rules">
        <li>
          <IconClock aria-hidden />
          {t("rule24h")}
        </li>
        <li>
          <IconAlert aria-hidden />
          {t("rulePause")}
        </li>
        <li>{t("ruleIncrease")}</li>
      </ul>
      {!targetId ? (
        <Banner tone="warn" title={t("noTarget")} />
      ) : sections === null ? (
        <Loading label={t("pickTitle")} />
      ) : !left.length ? (
        <Banner tone="info" title={t("noOptions")} />
      ) : (
        <div className="dxm-opts-pick">
          <b>{t("pickTitle")}</b>
          <small>{t("pickLead")}</small>
          {left.map((s) => (
            <fieldset key={s.id}>
              {s.title ? <legend>{s.title}</legend> : null}
              {s.options.map((x) => (
                <Check key={x.id} checked={picked.includes(x.id)} onChange={(v) => setPicked((l) => (v ? [...l, x.id] : l.filter((y) => y !== x.id)))} label={x.label}>
                  <span className="dxm-opt">
                    <span>{x.label}</span>
                    {x.description ? <small>{x.description}</small> : null}
                  </span>
                </Check>
              ))}
            </fieldset>
          ))}
        </div>
      )}
      {picked.length ? (
        <div className="dxm-offers">
          <div>
            <small>{t("paidTotal")}</small>
            <b>{cur(o.price)}</b>
          </div>
          <div className="is-offer">
            <small>{t("newTotal")}</small>
            <b>{q ? cur(q.totalPrice) : "…"}</b>
          </div>
        </div>
      ) : null}
      <Field label={t("noteLabel")}>
        <TextArea value={note} onChange={setNote} rows={3} placeholder={t("notePh")} maxLength={1000} />
      </Field>
      {err ? <Banner tone="err" title={err} /> : null}
    </Dialog>
  );
}
