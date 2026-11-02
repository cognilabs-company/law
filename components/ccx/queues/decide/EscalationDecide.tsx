"use client";

import "./WcDecide.css";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ApiError, errDetail, logApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { shortDateTime } from "@/lib/date";
import PersonName from "@/components/ui/PersonName";
import { useSameTickGuard } from "@/lib/useSameTickGuard";
import {
  ESCALATION_ACTIONS,
  escalationClosed,
  idemKeyFor,
  idemLost,
  idemSettle,
  refundFinal,
  refundStepOf,
  resolveAssignmentEscalation,
  type AssignmentEscalation,
  type EscalationAction,
  type EscalationInput,
  type IdemSlot,
} from "@/lib/services/resolution";
import { CaseBox, Choice, FactStrip, Field, Note, PanelFoot, Section, type Fact } from "../../panel/bits";
import { IcArrowRight, IcCheck, IcChevron, IcClock, IcClose, IcCoins, IcDoc, IcFlag, IcLayers, IcScale, IcShield, IcTimeline, IcUser } from "../../icons";
import Party from "./Party";
import { focusFirstError } from "./focus";
import type { DecideProps } from "./types";

const MESSAGE_MAX = 1000;
const NEEDS_REASON = new Set<EscalationAction>(["cancel", "full_refund"]);
const STACK: CSSProperties = { display: "grid", gap: 12, alignContent: "start", minWidth: 0 };
const FLOW: CSSProperties = { alignItems: "center", margin: 0, padding: 0, listStyle: "none" };
const FLOW_STEP: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 };
const PILL: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "normal" };
const SEP: CSSProperties = { transform: "rotate(-90deg)", color: "var(--opx-ink-3)" };
const OFFERED = new Set(["resolution_offered", "offer_resolution"]);
const byTime = (a: { at: string }, b: { at: string }) => (a.at && b.at ? a.at.localeCompare(b.at) : 0);

const STATUS_TONE: Record<string, string> = { open: "warn", waiting_client_choice: "info", expired: "hot", resolved: "ok" };
const PAY_TONE: Record<string, string> = {
  paid: "ok",
  refunded: "info",
  failed: "hot",
  cancelled: "mute",
  not_charged: "mute",
  unpaid: "warn",
  pending: "warn",
  partially_paid: "warn",
  awaiting_seller_acceptance: "warn",
};

type T = ReturnType<typeof useTranslations>;
type FlowState = "done" | "now" | "todo" | "bad";
type FlowStep = { key: string; label: string; state: FlowState };
const FLOW_TONE: Record<FlowState, string> = { done: "ok", now: "info", todo: "mute", bad: "hot" };

function offerFlow(esc: AssignmentEscalation, t: T): FlowStep[] | null {
  const offer = esc.resolution?.offer ?? null;
  const refund = esc.resolution?.refund ?? null;
  if (!offer && !refund) return null;
  const choice = offer?.selectedChoice || (refund ? "refund" : "");
  const expired = offer?.status === "expired" && !choice;
  const steps: FlowStep[] = [{ key: "sent", label: t("flow.sent"), state: "done" }];
  if (expired) {
    steps.push({ key: "expired", label: t("flow.expired"), state: "bad" });
    return steps;
  }
  steps.push({ key: "chose", label: choice ? t("flow.chose", { choice: t(`choice.${choice}`) }) : t("flow.waiting"), state: choice ? "done" : "now" });
  if (choice === "reassign") {
    const moved = esc.status === "resolved" || esc.order.status !== "resolution_required";
    steps.push({ key: "moved", label: moved ? t("flow.reassigned") : t("flow.reassigning"), state: moved ? "done" : "now" });
  } else {
    const step = refund ? refundStepOf(refund.status) : "requested";
    steps.push({ key: "refund", label: t("flow.refunding"), state: !choice ? "todo" : refund && refundFinal(step) ? "done" : "now" });
    steps.push({ key: "end", label: step === "rejected" ? t("flow.rejected") : step === "none" ? t("flow.notCharged") : t("flow.refunded"), state: step === "rejected" ? "bad" : refund && refundFinal(step) ? "done" : "todo" });
  }
  return steps;
}

function FlowIcon({ step }: { step: FlowStep }) {
  if (step.key === "sent") return <IcArrowRight size={14} />;
  if (step.key === "expired") return <IcClock size={14} />;
  if (step.key === "chose") return step.state === "done" ? <IcCheck size={14} /> : <IcClock size={14} />;
  if (step.key === "moved") return <IcUser size={14} />;
  if (step.key === "refund") return <IcCoins size={14} />;
  return step.state === "bad" ? <IcClose size={14} /> : <IcCheck size={14} />;
}

type Line = { id: string; at: string; title: ReactNode; sub?: ReactNode };

function Trail({ icon, title, lines, empty }: { icon: ReactNode; title: string; lines: Line[]; empty: string }) {
  const locale = useLocale();
  return (
    <Section icon={icon} title={title} count={lines.length}>
      {lines.length ? (
        <ol className="opx-tl">
          {lines.map((l, i) => (
            <li key={l.id} className={i === lines.length - 1 ? "is-last" : undefined}>
              <time className="opx-num" dateTime={l.at || undefined}>
                {l.at ? shortDateTime(l.at, locale) : ""}
              </time>
              <span>
                <b>{l.title}</b>
                {l.sub ? <small>{l.sub}</small> : null}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="opx-pnone">{empty}</p>
      )}
    </Section>
  );
}

export default function EscalationDecide({ job, item: esc, onDone, onClose, onDirty }: DecideProps<AssignmentEscalation>) {
  const t = useTranslations("callCenter.escalations");
  const tx = useTranslations("admin.ccx.panel");
  const tc = useTranslations("admin.ccx.cases");
  const none = useTranslations("common")("none");
  const locale = useLocale();
  const once = useSameTickGuard();
  const slot = useRef<IdemSlot["current"]>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [action, setAction] = useState<EscalationAction | "">("");
  const [offerMsg, setOfferMsg] = useState(() => t("offerDefault"));
  const [msg, setMsg] = useState("");
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [target, setTarget] = useState<"client" | "seller">("client");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lost, setLost] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const o = esc.order;
  const acts = esc.actions.filter((a) => (ESCALATION_ACTIONS as readonly string[]).includes(a));
  const act = action && acts.includes(action) ? action : "";
  const danger = act === "cancel" || act === "full_refund";
  const offer = esc.resolution?.offer ?? null;
  const refund = esc.resolution?.refund ?? null;
  const flow = offerFlow(esc, t);
  const when = (iso: string) => (iso ? shortDateTime(iso, locale) : "");
  const label = (group: string, v: string) => (v && t.has(`${group}.${v}`) ? t(`${group}.${v}`) : v ? t("other") : none);
  const sameSeller = Boolean(esc.previousSellerUserId) && esc.previousSellerUserId === o.lawyerUserId;
  const prevName = esc.previousSellerName || (sameSeller ? o.lawyerName : "");
  const prevPhone = sameSeller && o.lawyerPhoneVisible !== false ? o.lawyerPhone : "";
  const clientPhone = o.clientPhone || job.phone;
  const status = offer?.status === "pending_client_choice" ? "waiting_client_choice" : esc.status;
  const otherWork = Boolean(o.workId) && o.workId !== job.code;

  const mins = Number(minutes);
  const errs = {
    message: (act === "message" && !msg.trim()) || (act === "offer_resolution" && !offerMsg.trim()) ? t("err.message") : "",
    reason: act !== "" && NEEDS_REASON.has(act) && reason.trim().length < 5 ? t("err.reason") : "",
    minutes: act === "offer_resolution" && !(Number.isInteger(mins) && mins >= 5 && mins <= 1440) ? t("err.minutes") : "",
  };
  const shown = tried ? errs : { message: "", reason: "", minutes: "" };

  const edit = (set: (v: string) => void) => (v: string) => {
    if (lost) return;
    set(v);
    onDirty(true);
  };

  const pick = (v: string) => {
    if (lost || busy) return;
    const next = acts.find((a) => a === v);
    if (!next) return;
    setAction(next);
    setTried(false);
    setErr(null);
    onDirty(true);
  };

  const submit = async () => {
    if (busy || !act || !once()) return;
    setTried(true);
    if (errs.message || errs.reason || errs.minutes) {
      focusFirstError(scroller.current);
      return;
    }
    setBusy(true);
    setErr(null);
    const text = act === "offer_resolution" ? offerMsg : act === "message" ? msg : "";
    const input: EscalationInput = {
      action: act,
      message: text,
      reason: act === "offer_resolution" || act === "message" ? "" : reason,
      target: act === "message" ? target : undefined,
      deadlineMinutes: act === "offer_resolution" ? mins : undefined,
    };
    const box: IdemSlot = { current: slot.current };
    const key = idemKeyFor(box, JSON.stringify([esc.id, input]));
    slot.current = box.current;
    try {
      await resolveAssignmentEscalation(esc.id, input, key);
      idemSettle(box);
      slot.current = box.current;
      onDone(t(`done.${act}`));
    } catch (e) {
      idemSettle(box, e);
      slot.current = box.current;
      if (escalationClosed(e)) {
        onDone(t("alreadyClosed"));
        return;
      }
      logApiError("escalation.resolve", e);
      const gone = idemLost(e);
      setLost(gone);
      setErr(gone ? t("err.lost") : e instanceof ApiError && e.code === "no_eligible_marketplace_candidate" ? t("err.noCandidate") : errDetail(e));
    } finally {
      setBusy(false);
    }
  };

  const facts: Fact[] = [
    { icon: <IcDoc size={17} />, label: otherWork ? t("f.order") : tx("service"), value: [otherWork ? o.workId : "", o.serviceTitle].filter(Boolean).join(" · ") || none },
    { icon: <IcCoins size={17} />, label: t("f.price"), value: o.price ? `${fmtUzs(o.price)} ${t("som")}` : none },
    {
      icon: <IcShield size={17} />,
      label: t("f.payment"),
      value: o.paymentStatus ? (
        <i className="opx-pill opx-fpill" data-tone={PAY_TONE[o.paymentStatus] ?? "mute"}>
          {label("payment", o.paymentStatus)}
        </i>
      ) : (
        none
      ),
    },
    { icon: <IcClock size={17} />, label: tx("created"), value: when(esc.createdAt) || none },
  ];

  const offerLine = offer
    ? [label("offer", offer.status), offer.selectedChoice ? label("choice", offer.selectedChoice) : offer.deadlineAt && offer.status === "pending_client_choice" ? t("until", { time: when(offer.deadlineAt) }) : ""].filter(Boolean).join(" · ")
    : "";
  const refundLine = refund
    ? [
        label("refund", refundStepOf(refund.status)),
        refund.amount !== null ? `${fmtUzs(refund.amount)} ${refund.currency === "UZS" ? t("som") : refund.currency}` : "",
        !refund.providerEnabled && refund.status !== "not_charged" ? t("manual") : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const history: Line[] = esc.history.slice().sort(byTime).map((h, i) => {
    const who = Boolean(h.actor || h.actorId);
    return {
      id: h.id || `${h.at}-${i}`,
      at: h.at,
      title: `${OFFERED.has(h.type) ? tc("offered") : label("event", h.type || h.status)}${h.choice ? ` · ${label("choice", h.choice)}` : ""}`,
      sub:
        who || h.message ? (
          <>
            {who ? <PersonName id={h.actorId} name={h.actor} /> : null}
            {who && h.message ? " · " : ""}
            {h.message}
          </>
        ) : undefined,
    };
  });

  const attempts: Line[] = esc.attempts.slice().sort(byTime).map((a, i) => ({
    id: `${a.sellerUserId}-${a.at}-${i}`,
    at: a.at,
    title: <PersonName id={a.sellerUserId} name={a.sellerName} />,
    sub: [label("attempt", a.status), a.rank !== null ? t("rank", { n: a.rank }) : "", a.reason].filter(Boolean).join(" · "),
  }));

  return (
    <>
      <div className="opx-pscroll" ref={scroller}>
        <div className="opx-pgrid2">
          <Party role={t("f.client")} id={o.clientUserId} name={o.clientName} phone={clientPhone} empty={tc("notSet")} />
          <Party role={t("f.previous")} id={esc.previousSellerUserId} name={prevName} phone={prevPhone} empty={tc("notSet")} lookupPhone={false} />
        </div>
        <FactStrip facts={facts} />
        <CaseBox
          icon={<IcFlag size={18} />}
          label={tx("reason")}
          title={label("why", esc.reason)}
          aside={
            <i className="opx-pill" data-tone={STATUS_TONE[status] ?? "mute"}>
              {label("status", status)}
            </i>
          }
        />
        {flow ? (
          <Section icon={<IcLayers size={17} />} title={t("flow.title")}>
            <ol className="opx-files" style={FLOW} aria-live="polite">
              {flow.map((f, i) => (
                <li key={f.key} style={FLOW_STEP}>
                  {i ? <IcChevron size={14} style={SEP} /> : null}
                  <span className="opx-pill" data-tone={FLOW_TONE[f.state]} style={PILL}>
                    <FlowIcon step={f} />
                    {f.label}
                  </span>
                </li>
              ))}
            </ol>
            {offerLine || refundLine ? (
              <dl className="opx-cx-kv">
                {offerLine ? (
                  <div>
                    <dt>{t("f.offer")}</dt>
                    <dd>{offerLine}</dd>
                  </div>
                ) : null}
                {refundLine ? (
                  <div>
                    <dt>{t("f.refund")}</dt>
                    <dd className="opx-num">{refundLine}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </Section>
        ) : null}
        <div className="opx-pcols">
          <div style={STACK}>
            <Trail icon={<IcTimeline size={17} />} title={t("history")} lines={history} empty={tc("noHistory")} />
            {attempts.length ? <Trail icon={<IcUser size={17} />} title={t("attempts")} lines={attempts} empty={none} /> : null}
          </div>
          <Section icon={<IcScale size={17} />} title={tc("decision")}>
            {acts.length ? (
              <>
                <Choice
                  label={tc("pick")}
                  options={acts.map((a) => ({ value: a, label: t(`action.${a}`), danger: NEEDS_REASON.has(a), disabled: lost && a !== act }))}
                  value={act}
                  onChange={pick}
                />
                {act ? <Note tone={danger ? "warn" : "info"}>{t(`actionHint.${act}`)}</Note> : null}
                {act === "message" ? (
                  <>
                    <Choice
                      label={t("target")}
                      value={target}
                      onChange={(v) => {
                        if (lost) return;
                        setTarget(v === "seller" ? "seller" : "client");
                        onDirty(true);
                      }}
                      options={[
                        { value: "client", label: t("targetClient"), disabled: lost && target !== "client" },
                        { value: "seller", label: t("targetSeller"), disabled: lost && target !== "seller" },
                      ]}
                    />
                    <Field label={t("message")} value={msg} onChange={edit(setMsg)} max={MESSAGE_MAX} required multiline rows={4} error={shown.message} readOnly={lost} />
                  </>
                ) : null}
                {act === "offer_resolution" ? (
                  <>
                    <Field label={t("message")} value={offerMsg} onChange={edit(setOfferMsg)} max={MESSAGE_MAX} required multiline hint={t("messageHelp")} error={shown.message} readOnly={lost} />
                    <Field label={t("minutes")} value={minutes} onChange={edit((v) => setMinutes(v.replace(/\D/g, "").slice(0, 4)))} required inputMode="numeric" hint={t("minutesHelp")} error={shown.minutes} readOnly={lost} />
                  </>
                ) : null}
                {act === "reassign" || danger ? (
                  <Field label={t("reason")} value={reason} onChange={edit(setReason)} max={MESSAGE_MAX} required={danger} multiline hint={t("reasonHelp")} error={shown.reason} readOnly={lost} />
                ) : null}
                {err !== null ? (
                  <Note tone="bad">
                    <b>{t("err.failed")}</b>
                    {err ? (
                      <>
                        <br />
                        {err}
                      </>
                    ) : null}
                  </Note>
                ) : null}
              </>
            ) : (
              <p className="opx-pnone">{t("noActions")}</p>
            )}
          </Section>
        </div>
      </div>
      <PanelFoot
        onCancel={onClose}
        cancelLabel={acts.length ? undefined : tx("close")}
        primary={acts.length ? () => void submit() : undefined}
        primaryLabel={act === "cancel" ? tc("confirmCancel") : act ? t(`confirm.${act}`) : tc("pick")}
        busy={busy}
        disabled={!act}
        danger={danger}
      />
    </>
  );
}
