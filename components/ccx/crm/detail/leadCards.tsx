"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { shortDateTime } from "@/lib/date";
import { asDict, asStr, isAborted, logApiError } from "@/lib/http";
import { getLeadHistory, type CrmContact, type CrmHistory, type CrmLead } from "@/lib/services/crm";
import { minutesUntil, useCrmEvents } from "@/lib/crm/useCrm";
import { prettyPhone } from "../../now/feed";
import { CopyButton } from "../../now/NowFocus";
import { Note } from "../../panel/bits";
import { IcArrowRight, IcChevron, IcClock } from "../../icons";
import { customerHref } from "../nav";
import { useCategoryName, useCrmErr, useRegionName } from "../leads/util";
import { DetailBlocks } from "./detailList";
import { IcAlert, IcArchive, IcChat, IcHistory, IcLink, IcStar, IcVerified } from "./glyphs";
import { Avatar, Card, ContactGlyph, Failed, Shim, contactHref, telOf } from "./kit";

export type LeadHistoryState = { h: CrmHistory | null; err: string; load: (signal?: AbortSignal) => Promise<void> };

export function useLeadHistory(leadId: string, lockVersion: number): LeadHistoryState {
  const crmErr = useCrmErr();
  const [h, setH] = useState<CrmHistory | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setH(await getLeadHistory(leadId, signal));
        setErr("");
      } catch (e) {
        if (isAborted(e)) return;
        logApiError("crm.history", e);
        setErr(crmErr(e));
      }
    },
    [leadId, crmErr],
  );
  useEffect(() => {
    if (!leadId) return;
    const ctl = new AbortController();
    const id = window.setTimeout(() => void load(ctl.signal), 0);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [load, leadId, lockVersion]);
  useCrmEvents((ev) => {
    if (leadId && (ev.invalidate.includes("all") || (ev.leadId === leadId && ev.invalidate.includes("lead")))) void load();
  });
  return { h, err, load };
}

export function ContactRow({ c, onPrimary, onArchive, archiveBlocked, busy }: { c: CrmContact; onPrimary?: () => void; onArchive?: () => void; archiveBlocked?: string; busy?: boolean }) {
  const t = useTranslations("crm.contact");
  const tc = useTranslations("crm.customer");
  const [ask, setAsk] = useState(false);
  const href = contactHref(c);
  const archived = c.status === "archived";
  return (
    <li className="opx-cd-contact" data-archived={archived || undefined}>
      <span className="opx-cd-contact__ic" aria-hidden="true">
        <ContactGlyph type={c.type} />
      </span>
      <span className="opx-cd-contact__v">
        <span className="opx-num" dir="ltr">
          {c.type === "phone" ? prettyPhone(c.value) : c.value}
        </span>
        {c.label ? <small>{c.label}</small> : null}
      </span>
      {c.primary ? (
        <span className="opx-cd-star" role="img" aria-label={t("primary")} title={t("primary")}>
          <IcStar size={14} />
        </span>
      ) : onPrimary && !archived ? (
        <button type="button" className="opx-cd-ibtn" onClick={onPrimary} aria-label={t("makePrimary")} title={t("makePrimary")} disabled={busy}>
          <IcStar size={15} />
        </button>
      ) : null}
      {c.verified ? (
        <span className="opx-cd-ver" role="img" aria-label={t("verified")} title={t("verified")}>
          <IcVerified size={15} />
        </span>
      ) : null}
      <CopyButton value={c.value} label={c.value} />
      {href && !archived ? (
        <a className="opx-cd-ibtn" href={href} target={c.type === "telegram" ? "_blank" : undefined} rel="noreferrer" aria-label={t(`open.${c.type}`)} title={t(`open.${c.type}`)}>
          <IcArrowRight size={15} />
        </a>
      ) : null}
      {onArchive && !archived ? (
        <button type="button" className="opx-cd-ibtn" onClick={() => setAsk(true)} aria-label={archiveBlocked ? `${t("archive")}: ${archiveBlocked}` : t("archive")} title={archiveBlocked || t("archive")} disabled={busy || !!archiveBlocked}>
          <IcArchive size={15} />
        </button>
      ) : null}
      {ask ? (
        <span className="opx-cd-ask" role="alert">
          <span>{tc("archiveAsk")}</span>
          <button
            type="button"
            className="opx-pbtn opx-pbtn--rose opx-cd-btn-sm"
            onClick={() => {
              setAsk(false);
              onArchive?.();
            }}
          >
            {tc("archiveYes")}
          </button>
          <button type="button" className="opx-pbtn opx-pbtn--ghost opx-cd-btn-sm" onClick={() => setAsk(false)}>
            {tc("cancel")}
          </button>
        </span>
      ) : null}
    </li>
  );
}

export function NeedCard({ lead }: { lead: CrmLead }) {
  const t = useTranslations("crm.glance");
  const ts = useTranslations("crm.side");
  const tsrc = useTranslations("crm.source");
  const tsc = useTranslations("crm.score");
  const tl = useTranslations("admin.ccx.crm.lang");
  const regionName = useRegionName();
  const categoryName = useCategoryName();
  const locale = useLocale();
  const [more, setMore] = useState(false);
  const need = (lead.problem || lead.title).trim();
  const facts: [string, string][] = [
    lead.workId ? [t("f.code"), lead.workId] : null,
    lead.category ? [ts("category"), categoryName(lead.category)] : null,
    lead.source ? [t("f.source"), tsrc.has(lead.source) ? tsrc(lead.source) : tsrc("other")] : null,
    lead.region ? [t("f.region"), regionName(lead.region)] : null,
    lead.language ? [t("f.language"), tl.has(lead.language) ? tl(lead.language) : t("f.other")] : null,
    lead.score ? [t("f.score"), tsc.has(lead.score) ? tsc(lead.score) : t("scoreOther")] : null,
    [t("f.operator"), lead.operator?.name || t("f.nobody")],
    [t("f.cycle"), t("cycleN", { n: lead.cycleNumber })],
    lead.createdAt ? [t("f.created"), shortDateTime(lead.createdAt, locale)] : null,
    lead.claimedAt ? [t("f.claimed"), shortDateTime(lead.claimedAt, locale)] : null,
  ].filter((x): x is [string, string] => !!x);
  return (
    <Card icon={<IcChat size={17} />} title={t("need")} className="opx-cd-needcard">
      <p className="opx-cd-need">{need || t("noNeed")}</p>
      {lead.lostReason ? (
        <Note tone="warn">
          <b>{ts("lost")}: </b>
          {lead.lostReason}
        </Note>
      ) : null}
      <button type="button" className="opx-jr-toggle" aria-expanded={more} onClick={() => setMore((o) => !o)}>
        {t("details")}
        <IcChevron size={15} />
      </button>
      {more ? (
        <dl className="opx-cd-facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </Card>
  );
}

export function CustomerCard({ lead, contacts, onDial }: { lead: CrmLead; contacts: CrmContact[] | null; onDial: () => void }) {
  const t = useTranslations("crm.side");
  const tg = useTranslations("crm.glance");
  const tx = useTranslations("admin.ccx.crmDetail");
  const c = lead.customer;
  const phone = c?.phone ?? "";
  const tel = telOf(phone);
  const other = phone ? "" : (contacts?.find((x) => x.status !== "archived")?.value ?? c?.telegram ?? c?.email ?? "");
  return (
    <section className="opx-cd-card opx-jr-who" aria-label={tg("who")}>
      {c ? (
        <>
          <Avatar name={c.name} size="lg" />
          <span className="opx-jr-who__txt">
            <b>{c.name || c.publicId || tg("noName")}</b>
            {tel ? (
              <a className="opx-num" dir="ltr" href={tel} aria-label={`${tg("call")}: ${phone}`} onClick={onDial}>
                {prettyPhone(phone)}
              </a>
            ) : other ? (
              <small>{other}</small>
            ) : contacts === null && lead.customerId ? (
              <Shim h={18} />
            ) : (
              <small>{t("noContacts")}</small>
            )}
          </span>
          <Link href={customerHref(c.id)} className="opx-pbtn opx-jr-who__go">
            {tx("openProfile")}
          </Link>
        </>
      ) : (
        <p className="opx-cd-sub">{t("noCustomer")}</p>
      )}
    </section>
  );
}

export function NextCard({ lead, now, onChange }: { lead: CrmLead; now: number; onChange?: () => void }) {
  const t = useTranslations("crm.glance");
  const ts = useTranslations("crm.side");
  const locale = useLocale();
  const nextNote = asStr(asDict(lead.details.next_action).note ?? lead.details.next_action_note).trim();
  const mins = minutesUntil(lead.nextActionAt, now);
  const tone = !lead.nextActionAt ? "none" : mins !== null && mins < 0 ? "bad" : mins !== null && mins <= 60 ? "soon" : "ok";
  const span = (m: number) => {
    const a = Math.abs(m);
    return a < 60 ? t("min", { n: Math.max(1, a) }) : a < 60 * 48 ? t("h", { n: Math.round(a / 60) }) : t("d", { n: Math.round(a / 1440) });
  };
  const when = mins === null ? "" : mins < 0 ? t("late", { span: span(mins) }) : Math.abs(mins) < 1 ? t("nowDue") : t("inSpan", { span: span(mins) });
  if (!lead.nextActionAt) return null;
  return (
    <Card
      icon={<IcClock size={17} />}
      title={ts("next")}
      className="opx-cd-nextcard"
      aside={
        onChange ? (
          <button type="button" className="opx-cd-link" onClick={onChange}>
            {t("changeNext")}
          </button>
        ) : null
      }
    >
      <div className="opx-cd-next" data-tone={tone}>
        <span className="opx-cd-next__when opx-num" role={tone === "bad" ? "alert" : undefined}>
          <IcClock size={15} />
          {when || shortDateTime(lead.nextActionAt, locale)}
        </span>
        <span className="opx-cd-next__txt">
          <b>{nextNote || t("nextDefault")}</b>
          <small className="opx-num">{shortDateTime(lead.nextActionAt, locale)}</small>
        </span>
      </div>
    </Card>
  );
}

export function DupCard({ onDecide }: { onDecide?: (d: "duplicate" | "not_duplicate") => void }) {
  const t = useTranslations("crm.side");
  const td = useTranslations("crm.dup");
  return (
    <Card icon={<IcAlert size={17} />} title={t("dup")} tone="warn" className="opx-cd-dupcard">
      <div className="opx-cd-dupcard__row">
        {onDecide ? (
          <div className="opx-cd-dupcard__acts">
            <button type="button" className="opx-pbtn opx-cd-btn-warn" onClick={() => onDecide("duplicate")}>
              <IcLink size={15} />
              {td("is")}
            </button>
            <button type="button" className="opx-pbtn" onClick={() => onDecide("not_duplicate")}>
              {td("not")}
            </button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function StatusHistoryCard({ history }: { history: LeadHistoryState }) {
  const t = useTranslations("crm.history");
  const locale = useLocale();
  const { h, err, load } = history;
  const events = h ? [...h.events].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)) : [];
  if (!err && !events.length) return null;
  return (
    <Card icon={<IcHistory size={17} />} title={t("statusHistory")} className="opx-cd-shist" aside={h ? <b className="opx-cd-count opx-num">{h.events.length}</b> : null}>
      {!h && err ? (
        <Failed text={err} retry={t("retry")} onRetry={() => void load()} />
      ) : events.length ? (
        <ol className="opx-cd-rail">
          {events.map((e, i) => (
            <li key={e.id} data-first={i === 0 || undefined}>
              <time className="opx-num" dateTime={e.createdAt}>
                {e.createdAt ? shortDateTime(e.createdAt, locale) : ""}
              </time>
              <span>
                <b>{e.title || t("change")}</b>
                {e.body ? <small>{e.body}</small> : null}
                <small className="opx-cd-mute">{e.actor?.name || t("system")}</small>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {h && err ? <p className="opx-cd-err">{err}</p> : null}
    </Card>
  );
}

export function ExtraCard({ lead }: { lead: CrmLead }) {
  const t = useTranslations("crm.side");
  if (!lead.sections.some((s) => s.key === "additional")) return null;
  return (
    <Card icon={<IcChat size={17} />} title={t("more")}>
      <DetailBlocks sections={lead.sections} only={["additional"]} bare />
    </Card>
  );
}
