"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconAlert, IconCheck, IconChevronDown, IconClock, IconCopy, IconEdit, IconFlame, IconPhone, IconRefresh, IconSparkle } from "@/components/icons";
import { shortDateTime } from "@/lib/date";
import { asDict, asStr } from "@/lib/http";
import { toast } from "@/lib/toast";
import { claimCrmLead, crmNextStatuses, isClaimRace, isFinalStatus, journeyOf, leadCan, type CrmLead, type CrmMeta } from "@/lib/services/crm";
import { minutesUntil, useNow } from "@/lib/crm/useCrm";
import { Avatar, StatusIcon, StatusPill, statusVar, useCrmError, useStatusLabel } from "./bits";
import { copyText } from "./LeadSide";
import { NextActionSheet, ReopenSheet, StatusSheet } from "./LeadSheets";
import type { LeadWrite } from "./CrmLeadPage";

// The lead at one glance, for an operator on the phone: WHO (name, phone,
// one big Call button), WHAT they need (the request, as the main sentence),
// WHAT TO DO NOW (the next step and how late it is), WHERE it is (one
// status and a track with an icon per step) and ONE obvious next action.
// Every other status move sits behind "Another status", the AI behind "AI
// help", and the quiet facts behind "Details".
export function LeadGlance({ meta, lead, write, onCallResult, onAi }: { meta: CrmMeta; lead: CrmLead; write: LeadWrite; onCallResult: () => void; onAi?: () => void }): ReactElement {
  const t = useTranslations("crm.glance");
  const ts = useStatusLabel();
  const tsc = useTranslations("crm.score");
  const tu = useTranslations("crm.lead.urg");
  const tsrc = useTranslations("crm.source");
  const tl = useTranslations("crm.lang");
  const locale = useLocale();
  const now = useNow();
  const crmErr = useCrmError();
  const [more, setMore] = useState(false);
  const [menu, setMenu] = useState(false);
  const [to, setTo] = useState("");
  const [sheet, setSheet] = useState<"" | "next" | "reopen">("");
  const [claiming, setClaiming] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [menu]);

  const c = lead.customer;
  const name = c?.name || t("noName");
  const phone = c?.phone ?? "";
  const tel = phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : "";
  const need = (lead.problem || lead.title).trim();
  const journey = journeyOf(meta, lead.status);
  const at = journey.indexOf(lead.status);
  const ended = isFinalStatus(meta, lead.status);
  const moves = leadCan(lead, "change_status") ? crmNextStatuses(meta, lead.status) : [];
  const nextNote = asStr(asDict(lead.details.next_action).note ?? lead.details.next_action_note).trim();
  const mins = minutesUntil(lead.nextActionAt, now);
  const tone = !lead.nextActionAt ? "none" : mins !== null && mins < 0 ? "bad" : mins !== null && mins <= 60 ? "soon" : "ok";
  const span = (m: number) => {
    const a = Math.abs(m);
    return a < 60 ? t("min", { n: Math.max(1, a) }) : a < 60 * 48 ? t("h", { n: Math.round(a / 60) }) : t("d", { n: Math.round(a / 1440) });
  };
  const when = mins === null ? "" : mins < 0 ? t("late", { span: span(mins) }) : Math.abs(mins) < 1 ? t("nowDue") : t("inSpan", { span: span(mins) });
  const urgent = lead.urgency === "urgent" || lead.urgency === "high" || lead.urgency === "critical";
  const urgLabel = lead.urgency && lead.urgency !== "normal" ? (tu.has(lead.urgency) ? tu(lead.urgency) : t("urgOther")) : "";

  const claim = async () => {
    if (claiming) return;
    setClaiming(true);
    try {
      await write(() => claimCrmLead(lead.id), t("claimed"));
    } catch (e) {
      toast(isClaimRace(e) ? t("claimLost") : crmErr(e), { tone: "err" });
    } finally {
      setClaiming(false);
    }
  };
  // The one obvious next step for this lead.
  const primary =
    !lead.operatorId && leadCan(lead, "claim") ? (
      <button type="button" className="crm-btn crm-btn--pri crm-glance__primary" onClick={() => void claim()} disabled={claiming} aria-busy={claiming || undefined}>
        <IconCheck aria-hidden="true" />
        {t("claim")}
      </button>
    ) : ended && (leadCan(lead, "reopen") || leadCan(lead, "edit")) ? (
      <button type="button" className="crm-btn crm-btn--pri crm-glance__primary" onClick={() => setSheet("reopen")}>
        <IconRefresh aria-hidden="true" />
        {t("reopen")}
      </button>
    ) : leadCan(lead, "add_activity") ? (
      <button type="button" className="crm-btn crm-btn--pri crm-glance__primary" onClick={onCallResult}>
        <IconEdit aria-hidden="true" />
        {t("callResult")}
      </button>
    ) : moves[0] ? (
      <button type="button" className="crm-btn crm-btn--pri crm-glance__primary" onClick={() => setTo(moves[0])}>
        {t("moveTo", { status: ts(moves[0]) })}
      </button>
    ) : null;

  return (
    <section className="crm-glance" aria-labelledby="crm-lead-title" style={statusVar(lead.status)} data-menu={menu || undefined}>
      <div className="crm-glance__bar">
        <span className="crm-code">{lead.workId}</span>
        <StatusPill status={lead.status} />
        {lead.score ? (
          <span className="crm-glance__tag" data-score={lead.score}>
            <IconFlame aria-hidden="true" />
            {tsc.has(lead.score) ? tsc(lead.score) : t("scoreOther")}
          </span>
        ) : null}
        {lead.cycleNumber > 1 ? <span className="crm-glance__tag">{t("cycleN", { n: lead.cycleNumber })}</span> : null}
        {urgLabel ? (
          <span className="crm-glance__tag" data-urgent={urgent || undefined}>
            <IconAlert aria-hidden="true" />
            {urgLabel}
          </span>
        ) : null}
        <button type="button" className="crm-glance__more" aria-expanded={more} aria-controls="crm-glance-facts" onClick={() => setMore((v) => !v)}>
          {t("details")}
          <IconChevronDown aria-hidden="true" />
        </button>
      </div>

      <div className="crm-glance__grid">
        <div className="crm-glance__who">
          <Avatar name={c?.name ?? ""} large />
          <span className="crm-glance__id">
            <small>{t("who")}</small>
            <h1 id="crm-lead-title">{name}</h1>
            {phone ? (
              <span className="crm-glance__phone">
                <a href={tel} dir="ltr">
                  {phone}
                </a>
                <button type="button" className="crm-icobtn" onClick={() => copyText(phone, t("copied"))} aria-label={t("copy")} title={t("copy")}>
                  <IconCopy aria-hidden="true" />
                </button>
              </span>
            ) : (
              <span className="crm-muted">{t("noPhone")}</span>
            )}
          </span>
          {tel ? (
            <a className="crm-btn crm-glance__call" href={tel} aria-label={`${t("call")}: ${phone}`}>
              <IconPhone aria-hidden="true" />
              <span>{t("call")}</span>
            </a>
          ) : null}
        </div>

        <div className="crm-glance__need">
          <small>{t("need")}</small>
          <p>{need || t("noNeed")}</p>
          {lead.problem && lead.title && lead.title !== lead.problem ? <em>{lead.title}</em> : null}
        </div>

        <div className="crm-glance__now" data-tone={tone}>
          <small>
            <IconClock aria-hidden="true" />
            {t("now")}
          </small>
          {lead.nextActionAt ? (
            <>
              <b className="crm-glance__when" role={tone === "bad" ? "alert" : undefined}>
                {when}
              </b>
              <span className="crm-glance__task">{nextNote || t("nextDefault")}</span>
              <span className="crm-glance__at">{shortDateTime(lead.nextActionAt, locale)}</span>
            </>
          ) : (
            <b className="crm-glance__when">{t("noNext")}</b>
          )}
          {leadCan(lead, "set_next_action") ? (
            <button type="button" className="crm-btn crm-btn--sm" onClick={() => setSheet("next")}>
              <IconClock aria-hidden="true" />
              {lead.nextActionAt ? t("changeNext") : t("setNext")}
            </button>
          ) : null}
        </div>
      </div>

      <ol className="crm-glance__track" aria-label={t("track")}>
        {journey.map((s, i) => {
          const state = i < at ? "done" : i === at ? (ended ? "end" : "now") : "todo";
          return (
            <li key={s} data-state={state} style={statusVar(s)} aria-current={i === at ? "step" : undefined}>
              <i aria-hidden="true">
                <StatusIcon status={s} />
              </i>
              <span>{ts(s)}</span>
            </li>
          );
        })}
      </ol>

      <div className="crm-glance__acts">
        {primary}
        {moves.length ? (
          <div className="crm-glance__menu" ref={menuRef}>
            <button type="button" className="crm-btn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
              {t("otherStatus")}
              <IconChevronDown aria-hidden="true" />
            </button>
            {menu ? (
              <ul role="menu" aria-label={t("otherStatus")}>
                {moves.map((s) => (
                  <li key={s} role="none">
                    <button
                      type="button"
                      role="menuitem"
                      style={statusVar(s)}
                      onClick={() => {
                        setMenu(false);
                        setTo(s);
                      }}
                    >
                      <i aria-hidden="true">
                        <StatusIcon status={s} />
                      </i>
                      {ts(s)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {onAi ? (
          <button type="button" className="crm-btn crm-glance__ai" onClick={onAi}>
            <IconSparkle aria-hidden="true" />
            {t("ai")}
          </button>
        ) : null}
      </div>

      {more ? (
        <dl className="crm-glance__facts" id="crm-glance-facts">
          {lead.source ? (
            <div>
              <dt>{t("f.source")}</dt>
              <dd>{tsrc.has(lead.source) ? tsrc(lead.source) : tsrc("other")}</dd>
            </div>
          ) : null}
          {lead.region ? (
            <div>
              <dt>{t("f.region")}</dt>
              <dd>{lead.region}</dd>
            </div>
          ) : null}
          {lead.language ? (
            <div>
              <dt>{t("f.language")}</dt>
              <dd>{tl.has(lead.language) ? tl(lead.language) : t("f.other")}</dd>
            </div>
          ) : null}
          <div>
            <dt>{t("f.cycle")}</dt>
            <dd>{t("cycleN", { n: lead.cycleNumber })}</dd>
          </div>
          {lead.createdAt ? (
            <div>
              <dt>{t("f.created")}</dt>
              <dd>{shortDateTime(lead.createdAt, locale)}</dd>
            </div>
          ) : null}
          {lead.claimedAt ? (
            <div>
              <dt>{t("f.claimed")}</dt>
              <dd>{shortDateTime(lead.claimedAt, locale)}</dd>
            </div>
          ) : null}
          <div>
            <dt>{t("f.operator")}</dt>
            <dd>{lead.operator?.name || t("f.nobody")}</dd>
          </div>
        </dl>
      ) : null}

      {to ? <StatusSheet lead={lead} to={to} write={write} onClose={() => setTo("")} /> : null}
      {sheet === "next" ? <NextActionSheet lead={lead} write={write} onClose={() => setSheet("")} /> : null}
      {sheet === "reopen" ? <ReopenSheet meta={meta} lead={lead} write={write} onClose={() => setSheet("")} /> : null}
    </section>
  );
}
