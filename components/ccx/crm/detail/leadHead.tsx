"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { claimCrmLead, crmNextStatuses, isFinalStatus, journeyOf, leadCan, removeLeadWatcher, type CrmLead, type CrmMeta } from "@/lib/services/crm";
import { IcArrowLeft, IcArrowRight, IcCheck, IcChevron, IcClose, IcDoc, IcRefresh } from "../../icons";
import { IcLock } from "../../support/icons";
import { crmHref } from "../nav";
import { useCategoryName, useStatusName } from "../leads/util";
import { IcAlert, IcGlobe, IcSpark, IcUserPlus, IcUsers } from "./glyphs";
import { Avatar, Pill, StatusGlyph, statusTone, useDismiss, type Tone } from "./kit";
import { forwardOf, wonLocked, type LeadStep } from "./nextStep";
import type { LeadSheetKind, LeadWrite } from "./types";

type Menu = "" | "op" | "watch" | "moves";

export function LeadHead({ meta, lead, step, write, onSheet, onStatus, onAi }: { meta: CrmMeta; lead: CrmLead; step: LeadStep; write: LeadWrite; onSheet: (k: LeadSheetKind) => void; onStatus: (to: string) => void; onAi?: () => void }) {
  const t = useTranslations("crm.glance");
  const tl = useTranslations("crm.lead");
  const ts = useTranslations("crm.side");
  const tsc = useTranslations("crm.score");
  const tsrc = useTranslations("crm.source");
  const tx = useTranslations("admin.ccx.crmDetail");
  const categoryName = useCategoryName();
  const label = useStatusName();
  const me = useAuth().session?.id ?? "";
  const [claiming, setClaiming] = useState(false);
  const [menu, setMenu] = useState<Menu>("");
  const opRef = useRef<HTMLDivElement>(null);
  const watchRef = useRef<HTMLDivElement>(null);
  const movesRef = useRef<HTMLDivElement>(null);
  const pipeRef = useRef<HTMLOListElement>(null);
  const close = useCallback(() => setMenu(""), []);
  useDismiss(menu === "op", close, opRef);
  useDismiss(menu === "watch", close, watchRef);
  useDismiss(menu === "moves", close, movesRef);
  useEffect(() => {
    const ol = pipeRef.current;
    const cur = ol?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!ol || !cur || ol.scrollWidth <= ol.clientWidth) return;
    const left = cur.getBoundingClientRect().left - ol.getBoundingClientRect().left + ol.scrollLeft;
    ol.scrollLeft = Math.max(0, left - (ol.clientWidth - cur.offsetWidth) / 2);
  }, [lead.status]);

  const journey = journeyOf(meta, lead.status);
  const at = journey.indexOf(lead.status);
  const ended = isFinalStatus(meta, lead.status);
  const moves = leadCan(lead, "change_status") ? crmNextStatuses(meta, lead.status) : [];
  const canReject = moves.includes("rejected");
  const forward = forwardOf(meta, lead);
  const locked = wonLocked(lead);
  const claimable = !lead.operatorId && leadCan(lead, "claim");
  const reopenable = ended && (leadCan(lead, "reopen") || leadCan(lead, "edit"));
  const primary = claimable ? "claim" : reopenable ? "reopen" : forward ? "forward" : "";
  const others = moves.filter((s) => s !== "rejected" && !(primary === "forward" && s === forward));
  const urgent = lead.urgency === "urgent" || lead.urgency === "high" || lead.urgency === "critical";
  const urgLabel = lead.urgency && lead.urgency !== "normal" ? (tl.has(`urg.${lead.urgency}`) ? tl(`urg.${lead.urgency}`) : t("urgOther")) : "";
  const scoreTone: Tone = lead.score === "hot" ? "warn" : lead.score === "warm" ? "info" : "mute";
  const mine = !!me && lead.operatorId === me;
  const canAssign = leadCan(lead, "assign");
  const canTransfer = leadCan(lead, "transfer") && !!lead.operatorId;
  const canWatch = leadCan(lead, "manage_watchers");

  const bright = (s: LeadStep) => `opx-pbtn${step === s ? " opx-pbtn--main" : ""}`;

  const claim = async () => {
    if (claiming) return;
    setClaiming(true);
    await write(() => claimCrmLead(lead.id), t("claimed"));
    setClaiming(false);
  };

  return (
    <header className="opx-cd-head">
      <div className="opx-cd-head__top">
        <Link href={crmHref("leads")} className="opx-cd-back">
          <IcArrowLeft size={16} />
          {tl("back")}
        </Link>
        <h2 className="opx-cd-head__code opx-num">{lead.workId || tl("title")}</h2>
        <div className="opx-cd-head__tags">
          {lead.category ? (
            <span className="opx-cd-tag">
              <IcDoc size={15} />
              {categoryName(lead.category)}
            </span>
          ) : null}
          {lead.source ? (
            <span className="opx-cd-tag">
              <IcGlobe size={15} />
              {tsrc.has(lead.source) ? tsrc(lead.source) : tsrc("other")}
            </span>
          ) : null}
          {lead.score ? <Pill tone={scoreTone}>{tsc.has(lead.score) ? tsc(lead.score) : t("scoreOther")}</Pill> : null}
          {urgLabel ? (
            <Pill tone={urgent ? "hot" : "info"}>
              <IcAlert size={13} />
              {urgLabel}
            </Pill>
          ) : null}
          {lead.cycleNumber > 1 ? <Pill tone="mute">{t("cycleN", { n: lead.cycleNumber })}</Pill> : null}
        </div>
        <div className="opx-cd-head__people">
          <div className="opx-cd-menu" ref={opRef}>
            {canAssign || canTransfer ? (
              <button type="button" className="opx-cd-who" aria-haspopup="menu" aria-expanded={menu === "op"} onClick={() => setMenu((m) => (m === "op" ? "" : "op"))}>
                <Avatar name={lead.operator?.name ?? ""} size="sm" />
                <span>{lead.operator?.name || ts("unassigned")}</span>
                <IcChevron size={15} />
              </button>
            ) : (
              <span className="opx-cd-who" title={mine ? ts("you") : ts("owner")}>
                <Avatar name={lead.operator?.name ?? ""} size="sm" />
                <span>{lead.operator?.name || ts("unassigned")}</span>
              </span>
            )}
            {menu === "op" ? (
              <div className="opx-cd-pop" role="menu" aria-label={ts("people")}>
                <p className="opx-cd-pop__cap">
                  <b>{lead.operator?.name || ts("unassigned")}</b>
                  <small>{mine ? ts("you") : ts("owner")}</small>
                </p>
                {canAssign ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu("");
                      onSheet("assign");
                    }}
                  >
                    <IcUserPlus size={16} />
                    {ts("assign")}
                  </button>
                ) : null}
                {canTransfer ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu("");
                      onSheet("transfer");
                    }}
                  >
                    <IcArrowRight size={16} />
                    {ts("transfer")}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="opx-cd-menu" ref={watchRef}>
            <button type="button" className="opx-cd-who" aria-haspopup="menu" aria-expanded={menu === "watch"} onClick={() => setMenu((m) => (m === "watch" ? "" : "watch"))}>
              <IcUsers size={17} />
              <span>{ts("watchers")}</span>
              <b className="opx-cd-count opx-num">{lead.watchers.length}</b>
              <IcChevron size={15} />
            </button>
            {menu === "watch" ? (
              <div className="opx-cd-pop opx-cd-pop--wide" role="menu" aria-label={ts("watchers")}>
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
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu("");
                      onSheet("watchers");
                    }}
                  >
                    <IcUserPlus size={16} />
                    {ts("addWatcher")}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          {onAi ? (
            <button type="button" className="opx-pbtn opx-cd-ai" onClick={onAi}>
              <IcSpark size={16} />
              {t("ai")}
            </button>
          ) : null}
        </div>
      </div>

      <div className="opx-cd-head__flow">
        <ol ref={pipeRef} className="opx-cd-pipe" aria-label={t("track")}>
          {journey.map((s, i) => {
            const state = i < at ? "done" : i === at ? (ended ? "end" : "now") : "todo";
            const can = moves.includes(s);
            const inner = (
              <>
                <span className="opx-cd-pipe__ic" aria-hidden="true">
                  {state === "done" ? <IcCheck size={16} /> : state === "todo" && s === "won" && locked ? <IcLock size={16} /> : <StatusGlyph status={s} size={16} />}
                </span>
                <span className="opx-cd-pipe__t">{label(s)}</span>
              </>
            );
            return (
              <li key={s} data-state={state} data-tone={statusTone(meta, s)} aria-current={i === at ? "step" : undefined}>
                {can ? (
                  <button type="button" onClick={() => onStatus(s)} title={t("moveTo", { status: label(s) })}>
                    {inner}
                  </button>
                ) : (
                  <span>{inner}</span>
                )}
              </li>
            );
          })}
        </ol>
        <div className="opx-cd-head__acts">
          {canReject ? (
            <button type="button" className="opx-pbtn opx-cd-btn-reject" onClick={() => onStatus("rejected")}>
              <IcClose size={16} />
              {tx("reject")}
            </button>
          ) : null}
          {others.length ? (
            <div className="opx-cd-menu" ref={movesRef}>
              <button type="button" className="opx-pbtn" aria-haspopup="menu" aria-expanded={menu === "moves"} onClick={() => setMenu((m) => (m === "moves" ? "" : "moves"))}>
                {t("otherStatus")}
                <IcChevron size={15} />
              </button>
              {menu === "moves" ? (
                <div className="opx-cd-pop opx-cd-pop--end" role="menu" aria-label={t("otherStatus")}>
                  {others.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="menuitem"
                      data-tone={statusTone(meta, s)}
                      onClick={() => {
                        setMenu("");
                        onStatus(s);
                      }}
                    >
                      <StatusGlyph status={s} size={16} />
                      {label(s)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {primary === "claim" ? (
            <button type="button" className={bright("claim")} onClick={() => void claim()} disabled={claiming} aria-busy={claiming || undefined}>
              <IcCheck size={16} />
              {t("claim")}
            </button>
          ) : primary === "reopen" ? (
            <button type="button" className={bright("reopen")} onClick={() => onSheet("reopen")}>
              <IcRefresh size={16} />
              {t("reopen")}
            </button>
          ) : primary === "forward" ? (
            <button type="button" className={bright("forward")} onClick={() => onStatus(forward)}>
              {forward === "won" && locked ? <IcLock size={16} /> : <IcArrowRight size={16} />}
              {tx("nextStage", { status: label(forward) })}
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
