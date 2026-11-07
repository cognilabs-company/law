"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { claimCrmLead, crmNextStatuses, isFinalStatus, journeyOf, leadCan, removeLeadWatcher, type CrmLead, type CrmMeta } from "@/lib/services/crm";
import { IcArrowLeft, IcArrowRight, IcCheck, IcClock, IcClose, IcPhone, IcRefresh } from "../../icons";
import { Journey } from "../../panel/Journey";
import { IcLock } from "../../support/icons";
import { IcDots } from "../leads/icons";
import { crmHref } from "../nav";
import { useStatusName } from "../leads/util";
import { IcAlert, IcCart, IcEdit, IcSpark, IcUserPlus, IcUsers } from "./glyphs";
import { Avatar, Pill, StatusGlyph, statusTone, telOf, useDismiss } from "./kit";
import { forwardOf, wonLocked, type LeadStep } from "./nextStep";
import type { LeadSheetKind, LeadWrite } from "./types";

type HeadProps = {
  meta: CrmMeta;
  lead: CrmLead;
  step: LeadStep;
  loading: boolean;
  write: LeadWrite;
  onSheet: (k: LeadSheetKind) => void;
  onStatus: (to: string) => void;
  onAi?: () => void;
  onDial: () => void;
  onCallResult: () => void;
  onOrder: () => void;
  onSubmitDraft: () => void;
};

export function LeadHead({ meta, lead, step, loading, write, onSheet, onStatus, onAi, onDial, onCallResult, onOrder, onSubmitDraft }: HeadProps) {
  const t = useTranslations("crm.glance");
  const tl = useTranslations("crm.lead");
  const label = useStatusName();
  const journey = journeyOf(meta, lead.status);
  const at = journey.indexOf(lead.status);
  const ended = isFinalStatus(meta, lead.status);
  const moves = leadCan(lead, "change_status") ? crmNextStatuses(meta, lead.status) : [];
  const locked = wonLocked(lead);
  const urgent = lead.urgency === "urgent" || lead.urgency === "high" || lead.urgency === "critical";
  const urgLabel = urgent ? (tl.has(`urg.${lead.urgency}`) ? tl(`urg.${lead.urgency}`) : t("urgOther")) : "";

  return (
    <header className="opx-cd-head opx-jr-head">
      <div className="opx-jr-head__top">
        <Link href={crmHref("leads")} className="opx-cd-back">
          <IcArrowLeft size={16} />
          {tl("back")}
        </Link>
        <h2 className="opx-jr-head__title">{lead.title || lead.workId || tl("title")}</h2>
        {urgLabel ? (
          <Pill tone="hot">
            <IcAlert size={13} />
            {urgLabel}
          </Pill>
        ) : null}
        <LeadMenu meta={meta} lead={lead} step={step} moves={moves} write={write} onSheet={onSheet} onStatus={onStatus} onAi={onAi} onOrder={onOrder} />
      </div>
      <Journey
        label={t("track")}
        at={at}
        ended={ended ? (statusTone(meta, lead.status) === "hot" ? "hot" : statusTone(meta, lead.status) === "ok" ? "" : "mute") : ""}
        steps={journey.map((s, i) => {
          const canPick = moves.includes(s) && s !== "rejected" && !(s === "won" && locked);
          return {
            key: s,
            label: label(s),
            icon: s === "won" && locked && i > at ? <IcLock size={16} /> : <StatusGlyph status={s} size={16} />,
            locked: s === "won" && locked && i > at,
            onPick: canPick ? () => onStatus(s) : undefined,
            pickLabel: canPick ? t("moveTo", { status: label(s) }) : undefined,
          };
        })}
      />
      <DoNow meta={meta} lead={lead} step={step} loading={loading} write={write} onSheet={onSheet} onStatus={onStatus} onDial={onDial} onCallResult={onCallResult} onOrder={onOrder} onSubmitDraft={onSubmitDraft} />
    </header>
  );
}

// The one thing to do now: a large icon and a full-width pill button.
function DoNow({ meta, lead, step, loading, write, onSheet, onStatus, onDial, onCallResult, onOrder, onSubmitDraft }: Pick<HeadProps, "meta" | "lead" | "step" | "loading" | "write" | "onSheet" | "onStatus" | "onDial" | "onCallResult" | "onOrder" | "onSubmitDraft">) {
  const t = useTranslations("crm.glance");
  const tl = useTranslations("crm.tl");
  const tx = useTranslations("admin.ccx.crmDetail");
  const label = useStatusName();
  const [claiming, setClaiming] = useState(false);
  const claim = async () => {
    if (claiming) return;
    setClaiming(true);
    await write(() => claimCrmLead(lead.id), t("claimed"));
    setClaiming(false);
  };
  if (loading) return <div className="opx-jr-do opx-jr-do--wait" aria-hidden="true"><i className="opx-shim" /></div>;
  if (!step) return null;
  const phone = lead.customer?.phone ?? "";
  const forward = forwardOf(meta, lead);
  const shape = (icon: ReactNode, control: ReactNode, tone = "") => (
    <section className="opx-jr-do" data-tone={tone || undefined} data-step={step} aria-label={t("now")}>
      <span className="opx-jr-do__ic" aria-hidden="true">
        {icon}
      </span>
      {control}
    </section>
  );
  if (step === "call") {
    return shape(
      <IcPhone size={30} />,
      <a className="opx-pbtn opx-pbtn--call opx-jr-do__btn" href={telOf(phone)} aria-label={`${t("call")}: ${phone}`} onClick={onDial}>
        {t("call")}
      </a>,
      "call",
    );
  }
  const button = (icon: ReactNode, text: string, onClick: () => void, busy = false) =>
    shape(
      icon,
      <button type="button" className="opx-pbtn opx-pbtn--main opx-jr-do__btn" onClick={onClick} disabled={busy} aria-busy={busy || undefined}>
        {text}
      </button>,
    );
  switch (step) {
    case "claim":
      return button(<IcCheck size={30} />, t("claim"), () => void claim(), claiming);
    case "callResult":
      return button(<IcEdit size={30} />, t("callResult"), onCallResult);
    case "nextAction":
      return button(<IcClock size={30} />, t("setNext"), () => onSheet("next"));
    case "forward":
      return button(<IcArrowRight size={30} />, tx("nextStage", { status: label(forward) }), () => onStatus(forward));
    case "order":
      return button(<IcCart size={30} />, lead.order ? t("doOrderOpen") : t("doOrder"), onOrder);
    case "reopen":
      return button(<IcRefresh size={30} />, t("reopen"), () => onSheet("reopen"));
    case "compose":
      return button(<IcEdit size={30} />, tl("add"), onSubmitDraft);
    default:
      return null;
  }
}

// Everything secondary, in one place, so the page shows only what the step needs.
function LeadMenu({ meta, lead, step, moves, write, onSheet, onStatus, onAi, onOrder }: Pick<HeadProps, "meta" | "lead" | "step" | "write" | "onSheet" | "onStatus" | "onAi" | "onOrder"> & { moves: string[] }) {
  const t = useTranslations("crm.glance");
  const ts = useTranslations("crm.side");
  const tc = useTranslations("crm.conv");
  const tx = useTranslations("admin.ccx.crmDetail");
  const label = useStatusName();
  const me = useAuth().session?.id ?? "";
  const [open, setOpen] = useState(false);
  const [watchOpen, setWatchOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setWatchOpen(false);
  }, []);
  useDismiss(open, close, box);
  const forward = forwardOf(meta, lead);
  const locked = wonLocked(lead);
  const others = moves.filter((s) => s !== "rejected" && !(step === "forward" && s === forward) && !(s === "won" && locked));
  const claimable = !lead.operatorId && leadCan(lead, "claim");
  const canReject = moves.includes("rejected") && !claimable;
  const canAssign = leadCan(lead, "assign");
  const canTransfer = leadCan(lead, "transfer") && !!lead.operatorId;
  const canWatch = leadCan(lead, "manage_watchers");
  const canNext = leadCan(lead, "set_next_action") && step !== "nextAction" && !isFinalStatus(meta, lead.status);
  const canEdit = leadCan(lead, "edit");
  const canOrder = !lead.order && leadCan(lead, "prepare_conversion") && step !== "order";
  const mine = !!me && lead.operatorId === me;
  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  return (
    <div className="opx-cd-menu opx-jr-head__more" ref={box}>
      <button type="button" className="opx-cd-ibtn opx-jr-more" aria-haspopup="menu" aria-expanded={open} aria-label={t("more")} title={t("more")} onClick={() => (open ? close() : setOpen(true))}>
        <IcDots size={20} />
      </button>
      {open ? (
        <div className="opx-cd-pop opx-cd-pop--end opx-jr-pop" role="menu" aria-label={t("more")}>
          <p className="opx-cd-pop__cap">
            <b>{lead.operator?.name || ts("unassigned")}</b>
            <small>{lead.operator ? (mine ? ts("you") : ts("owner")) : ts("people")}</small>
          </p>
          {canAssign ? (
            <button type="button" role="menuitem" onClick={run(() => onSheet("assign"))}>
              <IcUserPlus size={16} />
              {ts("assign")}
            </button>
          ) : null}
          {canTransfer ? (
            <button type="button" role="menuitem" onClick={run(() => onSheet("transfer"))}>
              <IcArrowRight size={16} />
              {ts("transfer")}
            </button>
          ) : null}
          {canNext ? (
            <button type="button" role="menuitem" onClick={run(() => onSheet("next"))}>
              <IcClock size={16} />
              {lead.nextActionAt ? t("changeNext") : t("setNext")}
            </button>
          ) : null}
          {canOrder ? (
            <button type="button" role="menuitem" onClick={run(onOrder)}>
              <IcCart size={16} />
              {tc("title")}
            </button>
          ) : null}
          {canEdit ? (
            <button type="button" role="menuitem" onClick={run(() => onSheet("edit"))}>
              <IcEdit size={16} />
              {ts("edit")}
            </button>
          ) : null}
          {onAi ? (
            <button type="button" role="menuitem" onClick={run(onAi)}>
              <IcSpark size={16} />
              {t("ai")}
            </button>
          ) : null}
          <button type="button" role="menuitem" aria-expanded={watchOpen} onClick={() => setWatchOpen((o) => !o)}>
            <IcUsers size={16} />
            {ts("watchers")}
            <b className="opx-cd-count opx-num">{lead.watchers.length}</b>
          </button>
          {watchOpen ? (
            <div className="opx-jr-pop__sub">
              {lead.watchers.length ? (
                <ul className="opx-cd-pop__list">
                  {lead.watchers.map((w) => (
                    <li key={w.id}>
                      <Avatar name={w.name} size="sm" />
                      <span>{w.name}</span>
                      {canWatch ? (
                        <button type="button" className="opx-cd-ibtn" role="menuitem" onClick={() => void write(() => removeLeadWatcher(lead.id, w.id), ts("watcherRemoved"))} aria-label={ts("removeWatcher", { name: w.name })} title={ts("removeWatcher", { name: w.name })}>
                          <IcClose size={14} />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="opx-cd-pop__cap">
                  <small>{ts("noWatchers")}</small>
                </p>
              )}
              {canWatch ? (
                <button type="button" role="menuitem" onClick={run(() => onSheet("watchers"))}>
                  <IcUserPlus size={16} />
                  {ts("addWatcher")}
                </button>
              ) : null}
            </div>
          ) : null}
          {others.length ? <p className="opx-jr-pop__cap">{t("otherStatus")}</p> : null}
          {others.map((s) => (
            <button key={s} type="button" role="menuitem" data-tone={statusTone(meta, s)} onClick={run(() => onStatus(s))}>
              <StatusGlyph status={s} size={16} />
              {label(s)}
            </button>
          ))}
          {canReject ? (
            <button type="button" role="menuitem" className="opx-jr-pop__quiet" onClick={run(() => onStatus("rejected"))}>
              <IcClose size={16} />
              {tx("reject")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
