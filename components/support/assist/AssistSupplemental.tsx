"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { isAborted } from "@/lib/http";
import { subscribeUserEvents } from "@/lib/userSocket";
import { aiId } from "@/lib/ai/ids";
import { getPriceOptions, type PriceOptionSection } from "@/lib/services/priceOptions";
import { marketErrorCode, marketSignalOf } from "@/lib/services/marketplace";
import { resolveAssistSupplemental, type AssistResolveInput, type AssistResolveResult, type AssistSupplemental as Sup } from "@/lib/services/supportAssist";
import { OptionGroups } from "@/components/marketplace/PriceOptions";
import { useMarketError } from "@/components/marketplace/useMarketError";
import { IconRefresh } from "@/components/icons";
import { ConfirmModal, ResultCard, StatusChip, assistErrorText, sumText, type AssistSectionProps, type InfoRow } from "./bits";

type Action = AssistResolveInput["action"];
type Form = { key: string; status: "loading" | "ready" | "error"; sections: PriceOptionSection[] };
type Sent = { sup: Sup; action: Action; result: AssistResolveResult; phase: "" | "approved" | "rejected" };

const ACTIONS: Action[] = ["replace_options", "full_refund", "partial_refund"];
const REASON_MAX = 500;

export default function AssistSupplemental({ ticketId, ctx, onDone, onBlock }: AssistSectionProps) {
  const t = useTranslations("support.assist.sup");
  const ta = useTranslations("support.assist");
  const tc = useTranslations("common");
  const tme = useTranslations("marketplace.errors");
  const marketErr = useMarketError();
  const list = ctx.supplementals;
  const [pickedId, setPickedId] = useState("");
  const [manualId, setManualId] = useState("");
  const [action, setAction] = useState<Action>("replace_options");
  const [opts, setOpts] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [form, setForm] = useState<Form>({ key: "", status: "loading", sections: [] });
  const [formTick, setFormTick] = useState(0);
  const [err, setErr] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmErr, setConfirmErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const inflight = useRef(false);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  const fallbackId = (list.find((s) => s.status === "pending" || s.status === "escalated") ?? list[0])?.id ?? "";
  const chosenId = pickedId || fallbackId;
  const chosen: Sup | null = list.find((s) => s.id === chosenId) ?? (manualId.trim() ? { ...emptySup(), id: manualId.trim() } : null);
  const target = chosen?.packageId ? "package" : "service";
  const targetId = chosen ? chosen.packageId || chosen.serviceId : "";
  const formKey = `${target}:${targetId}:${formTick}`;
  const ai = (...parts: string[]) => aiId("call_center.support.ticket", ticketId, "assist", "marketplace-additional-payment", ...parts);

  useEffect(() => {
    if (action !== "replace_options" || !targetId) return;
    const c = new AbortController();
    getPriceOptions(target, targetId, c.signal)
      .then((f) => setForm({ key: formKey, status: "ready", sections: f.sections }))
      .catch((e: unknown) => {
        if (!isAborted(e)) setForm({ key: formKey, status: "error", sections: [] });
      });
    return () => c.abort();
  }, [action, target, targetId, formKey]);

  const sentOrder = sent?.sup.orderId ?? "";
  useEffect(() => {
    if (!sentOrder) return;
    return subscribeUserEvents((raw) => {
      const sig = marketSignalOf(raw);
      if (!sig || sig.orderId !== sentOrder || (sig.kind !== "refund" && sig.kind !== "supplemental")) return;
      if (sig.sub === "approved" || sig.sub === "rejected") {
        const phase = sig.sub;
        setSent((cur) => (cur ? { ...cur, phase } : cur));
        doneRef.current();
      }
    });
  }, [sentOrder]);

  const paid = new Set(chosen?.paidOptionIds ?? []);
  const sections = (form.key === formKey ? form.sections : []).map((s) => ({ ...s, options: s.options.filter((o) => !paid.has(o.id)) })).filter((s) => s.options.length);
  const amountNum = Number(amount.replace(/\D/g, "")) || 0;

  const errText = (e: unknown) => {
    const code = marketErrorCode(e);
    return code && tme.has(code) ? marketErr(e, "") : assistErrorText(e, ta, tc);
  };

  function review() {
    if (busy) return;
    if (!chosen) return setErr(t("pickRequest"));
    if (action === "replace_options" && !opts.length) return setErr(t("pickOptions"));
    if (action !== "replace_options" && !reason.trim()) return setErr(t("reasonRequired"));
    if (action === "partial_refund" && amountNum <= 0) return setErr(t("amountRequired"));
    setErr("");
    setConfirmErr("");
    setConfirming(true);
  }

  async function submit() {
    if (!chosen || inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setConfirmErr("");
    const input: AssistResolveInput =
      action === "replace_options" ? { action, selectedOptionIds: opts } : action === "full_refund" ? { action, reason } : { action, amount: amountNum, reason };
    try {
      const result = await resolveAssistSupplemental(ticketId, chosen.id, input);
      setSent({ sup: chosen, action, result, phase: "" });
      setConfirming(false);
      setOpts([]);
      setReason("");
      setAmount("");
      onDone();
    } catch (e) {
      if (onBlock(e)) setConfirming(false);
      else setConfirmErr(errText(e));
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  const optLabel = (id: string) => form.sections.flatMap((s) => s.options).find((o) => o.id === id)?.label || id;
  const confirmRows: InfoRow[] = chosen
    ? [
        { key: "req", label: t("request"), value: [chosen.workId, chosen.serviceTitle].filter(Boolean).join(" · ") || chosen.id },
        { key: "action", label: t("action"), value: t(`actions.${action}`) },
        ...(action === "replace_options" ? [{ key: "opts", label: t("newOptions"), value: opts.map(optLabel).join(", ") }] : []),
        ...(action === "partial_refund" ? [{ key: "amount", label: t("amount"), value: sumText(ta, amountNum) }] : []),
        ...(action !== "replace_options" ? [{ key: "reason", label: t("reason"), value: reason.trim() }] : []),
      ]
    : [];

  return (
    <div className="sasst__secin">
      <h4 className="sasst__h4">{t("heading")}</h4>
      <p className="sasst__lead">{t("lead")}</p>

      {sent ? (
        <ResultCard
          title={t(`sent.${sent.action}`)}
          rows={[
            { key: "req", label: t("request"), value: sent.sup.workId ? <span className="sasst__wid">{sent.sup.workId}</span> : sent.sup.id },
            { key: "status", label: ta("result.status"), value: <StatusChip status={sent.phase || sent.result.status} /> },
            ...(sent.result.amount ? [{ key: "amount", label: t("amount"), value: sumText(ta, sent.result.amount) }] : []),
            { key: "tg", label: ta("result.telegram"), value: sent.result.telegramSent ? ta("result.telegramSent") : t("telegramWait") },
          ]}
          note={sent.phase === "approved" ? t("approvedNote") : sent.phase === "rejected" ? t("rejectedNote") : t("waitNote")}
          warn={sent.phase === "rejected"}
          onDismiss={() => setSent(null)}
        />
      ) : null}

      <div className="sasst__f">
        <span className="sasst__lbl">{t("request")}</span>
        {list.length ? (
          <ul className="sasst__pick" aria-label={t("request")}>
            {list.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="sasst__opt"
                  aria-pressed={chosenId === s.id && !manualId.trim()}
                  onClick={() => {
                    setPickedId(s.id);
                    setManualId("");
                    setOpts([]);
                    setErr("");
                  }}
                  data-ai-id={ai("request", s.id)}
                >
                  <span>
                    <b>{[s.workId, s.serviceTitle].filter(Boolean).join(" · ") || s.id}</b>
                    <small>
                      {[s.options.map((o) => o.label || o.id).join(", "), s.lawyerName, s.expiresAt ? t("expires", { at: s.expiresAt.slice(0, 16).replace("T", " ") }) : ""].filter(Boolean).join(" · ")}
                    </small>
                  </span>
                  <em>
                    <StatusChip status={s.status} />
                    {s.amount ? ` ${sumText(ta, s.amount)}` : ""}
                  </em>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sasst__muted">{t("none")}</p>
        )}
        <label className="sasst__f sasst__manual">
          <span className="sasst__lbl">{t("manual")}</span>
          <input value={manualId} onChange={(e) => setManualId(e.target.value.trim().slice(0, 80))} placeholder={t("manualPh")} data-ai-id={ai("request-id")} />
        </label>
      </div>

      <div className="sasst__f">
        <span className="sasst__lbl">{t("action")}</span>
        <div className="sasst__chips" role="group" aria-label={t("action")}>
          {ACTIONS.map((a) => (
            <button
              key={a}
              type="button"
              className="supchip"
              aria-pressed={action === a}
              onClick={() => {
                setAction(a);
                setErr("");
              }}
              disabled={busy}
              data-ai-id={ai("action", a)}
            >
              {t(`actions.${a}`)}
            </button>
          ))}
        </div>
        <p className="sasst__muted">{t(`hints.${action}`)}</p>
      </div>

      {action === "replace_options" ? (
        <div className="sasst__f">
          <span className="sasst__lbl">{t("newOptions")}</span>
          {!targetId ? (
            <p className="sasst__muted">{t("noTarget")}</p>
          ) : form.key !== formKey ? (
            <p className="sasst__muted">{t("optionsLoading")}</p>
          ) : form.status === "error" ? (
            <div className="sasst__errbox">
              <p className="sasst__err">{t("optionsError")}</p>
              <button type="button" className="btn btn--line btn--sm" onClick={() => setFormTick((n) => n + 1)}>
                <IconRefresh />
                {tc("retry")}
              </button>
            </div>
          ) : sections.length ? (
            <OptionGroups sections={sections} picked={opts} onToggle={(id) => setOpts((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))} disabled={busy} />
          ) : (
            <p className="sasst__muted">{t("noOptions")}</p>
          )}
        </div>
      ) : (
        <>
          {action === "partial_refund" ? (
            <label className="sasst__f">
              <span className="sasst__lbl">{t("amount")}</span>
              <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d\s]/g, "").slice(0, 14))} placeholder={t("amountPh")} data-ai-id={ai("amount")} />
              {chosen?.paidTotal ? <em>{t("paidTotal", { sum: sumText(ta, chosen.paidTotal) })}</em> : null}
            </label>
          ) : null}
          <label className="sasst__f" data-ai-private>
            <span className="sasst__lbl">{t("reason")}</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))} placeholder={t("reasonPh")} rows={3} maxLength={REASON_MAX} data-ai-id={ai("reason")} />
            <em>
              {reason.length}/{REASON_MAX}
            </em>
          </label>
        </>
      )}

      {err ? (
        <p className="sasst__err" role="alert">
          {err}
        </p>
      ) : null}
      <div className="sasst__acts">
        <button type="button" className="btn btn--grad btn--sm" onClick={review} disabled={busy} data-ai-id={ai("next")}>
          {t("next")}
        </button>
      </div>

      <ConfirmModal
        open={confirming && Boolean(chosen)}
        title={t("confirmTitle")}
        rows={confirmRows}
        note={action === "replace_options" ? t("confirmReplace") : t("confirmRefund")}
        busy={busy}
        error={confirmErr}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void submit()}
        aiId={ai("confirm-modal")}
      />
    </div>
  );
}

function emptySup(): Sup {
  return { id: "", orderId: "", workId: "", status: "pending", amount: 0, newTotal: 0, paidTotal: 0, note: "", expiresAt: "", options: [], paidOptionIds: [], serviceId: "", packageId: "", serviceTitle: "", lawyerUserId: "", lawyerName: "" };
}
