"use client";

import { useEffect, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import CheckBox from "@/components/CheckBox";
import { IconAlert, IconCheck, IconClock, IconCopy, IconEdit, IconMail, IconPhone, IconSend, IconShieldCheck, IconStar, IconUserPlus, IconUsers, IconClose, IconFileText, IconArrowRight } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { shortDateTime } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { claimCrmLead, getCrmCustomer, isClaimRace, leadCan, listLeadCalls, removeLeadWatcher, startLeadCall, type CrmCall, type CrmContact, type CrmLead, type CrmMeta } from "@/lib/services/crm";
import { Avatar, useCrmError } from "./bits";
import { Telephony } from "./CrmOverview";
import type { LeadWrite } from "./CrmLeadPage";
import { AssignSheet, ConversionSheet, DuplicateSheet, EditSheet, NextActionSheet, WatcherSheet } from "./LeadSheets";
import { DetailSections } from "./DetailSections";

type Sheet = "" | "edit" | "next" | "assign" | "transfer" | "watchers" | "dup" | "conv";

export function copyText(text: string, done: string): void {
  void navigator.clipboard?.writeText(text).then(
    () => toast(done, { tone: "ok" }),
    () => undefined,
  );
}

// `archiveBlocked`: why this contact cannot be archived (the last active
// one); the button then stays visible but disabled, with the reason.
export function ContactRow({ c, onPrimary, onArchive, archiveBlocked, busy }: { c: CrmContact; onPrimary?: () => void; onArchive?: () => void; archiveBlocked?: string; busy?: boolean }): ReactElement {
  const t = useTranslations("crm.contact");
  const Icon = c.type === "phone" ? IconPhone : c.type === "email" ? IconMail : IconSend;
  const href = c.type === "phone" ? `tel:${c.value.replace(/\s+/g, "")}` : c.type === "email" ? `mailto:${c.value}` : c.type === "telegram" ? `https://t.me/${c.value.replace(/^@/, "")}` : "";
  return (
    <li data-archived={c.status === "archived" || undefined}>
      <Icon aria-hidden="true" />
      <span title={c.label || undefined}>
        {c.value}
        {c.label ? <small className="crm-muted"> · {c.label}</small> : null}
      </span>
      {c.primary ? <IconStar className="crm-star" aria-label={t("primary")} style={{ width: 14, height: 14 }} /> : onPrimary && c.status !== "archived" ? (
        <button type="button" className="crm-icobtn" onClick={onPrimary} aria-label={t("makePrimary")} title={t("makePrimary")} disabled={busy}>
          <IconStar aria-hidden="true" />
        </button>
      ) : null}
      {c.verified ? <IconShieldCheck aria-label={t("verified")} style={{ width: 14, height: 14, color: "var(--crm-ok)" }} /> : null}
      <button type="button" className="crm-icobtn" onClick={() => copyText(c.value, t("copied"))} aria-label={t("copy")} title={t("copy")}>
        <IconCopy aria-hidden="true" />
      </button>
      {href && c.status !== "archived" ? (
        <a className="crm-icobtn" href={href} target={c.type === "telegram" ? "_blank" : undefined} rel="noreferrer" aria-label={t(`open.${c.type}`)} title={t(`open.${c.type}`)}>
          <IconArrowRight aria-hidden="true" />
        </a>
      ) : null}
      {onArchive && c.status !== "archived" ? (
        <button type="button" className="crm-icobtn" onClick={onArchive} aria-label={archiveBlocked ? `${t("archive")}: ${archiveBlocked}` : t("archive")} title={archiveBlocked || t("archive")} disabled={busy || !!archiveBlocked}>
          <IconClose aria-hidden="true" />
        </button>
      ) : null}
    </li>
  );
}

export function LeadSide({ meta, lead, write }: { meta: CrmMeta; lead: CrmLead; write: LeadWrite }): ReactElement {
  const t = useTranslations("crm.side");
  const tl = useTranslations("crm.lang");
  const tsrc = useTranslations("crm.source");
  const tps = useTranslations("crm.customer.payStatus");
  const locale = useLocale();
  const me = useAuth().session?.id ?? "";
  const crmErr = useCrmError();
  const [sheet, setSheet] = useState<Sheet>("");
  const [contacts, setContacts] = useState<CrmContact[] | null>(null);
  const [claiming, setClaiming] = useState(false);
  const c = lead.customer;
  useEffect(() => {
    if (!lead.customerId) return;
    const ctl = new AbortController();
    getCrmCustomer(lead.customerId, ctl.signal).then(
      (d) => setContacts(d.contacts.filter((x) => x.status !== "archived")),
      (e) => {
        if (!isAborted(e)) logApiError("crm.lead.customer", e);
        setContacts([]);
      },
    );
    return () => ctl.abort();
  }, [lead.customerId]);

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
  const fallbackContacts: CrmContact[] = c
    ? [
        c.phone ? { id: "p", type: "phone", value: c.phone, label: "", primary: true, verified: false, status: "active", source: "", createdAt: "" } : null,
        c.telegram ? { id: "t", type: "telegram", value: c.telegram, label: "", primary: !c.phone, verified: false, status: "active", source: "", createdAt: "" } : null,
        c.email ? { id: "e", type: "email", value: c.email, label: "", primary: !c.phone && !c.telegram, verified: false, status: "active", source: "", createdAt: "" } : null,
      ].filter((x): x is CrmContact => !!x)
    : [];
  const shown = contacts ?? fallbackContacts;
  const mine = !!me && lead.operatorId === me;

  return (
    <>
      {lead.duplicateStatus === "needs_review" ? (
        <div className="crm-banner crm-banner--warn" role="status">
          <IconAlert aria-hidden="true" />
          <span>
            <b>{t("dup")}</b>
            {t("dupText")}
          </span>
          {leadCan(lead, "resolve_duplicate") || leadCan(lead, "edit") ? (
            <button type="button" className="crm-btn crm-btn--sm" onClick={() => setSheet("dup")}>
              {t("compare")}
            </button>
          ) : null}
        </div>
      ) : null}

      <section className="crm-card crm-cust" aria-labelledby="crm-cust-t">
        <div className="crm-cust__head">
          <Avatar name={c?.name ?? ""} large />
          <span style={{ minWidth: 0 }}>
            {c ? (
              <Link href={`/admin/crm/customers/${encodeURIComponent(c.id)}`}>
                <b id="crm-cust-t">{c.name || c.publicId}</b>
              </Link>
            ) : (
              <b id="crm-cust-t">{t("noCustomer")}</b>
            )}
            <span className="crm-code">{c?.publicId}</span>
            {c?.isLexgoUser ? (
              <span className="crm-badge" style={{ marginTop: 4 }}>
                <IconCheck aria-hidden="true" />
                {c.lexgoLabel || t("linked")}
              </span>
            ) : (
              <span className="crm-badge crm-badge--muted" style={{ marginTop: 4 }}>
                {t("notLinked")}
              </span>
            )}
          </span>
        </div>
        {shown.length ? (
          <ul className="crm-contacts">
            {shown.map((x) => (
              <ContactRow key={x.id} c={x} />
            ))}
          </ul>
        ) : contacts === null && lead.customerId ? (
          <span className="crm-sk" />
        ) : (
          <p className="crm-sub">{t("noContacts")}</p>
        )}
        {c?.language ? <p className="crm-sub">{t("speaks", { lang: tl.has(c.language) ? tl(c.language) : c.language })}</p> : null}
      </section>

      <section className="crm-card" aria-labelledby="crm-facts-t">
        <h3 className="crm-card__h" id="crm-facts-t">
          <IconFileText aria-hidden="true" />
          {t("facts")}
          {leadCan(lead, "edit") ? (
            <button type="button" className="crm-icobtn" style={{ marginLeft: "auto" }} onClick={() => setSheet("edit")} aria-label={t("edit")} title={t("edit")}>
              <IconEdit aria-hidden="true" />
            </button>
          ) : null}
        </h3>
        {lead.problem ? <p style={{ margin: 0, fontSize: ".86rem", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{lead.problem}</p> : null}
        <dl className="crm-facts">
          <div>
            <dt>{t("source")}</dt>
            <dd>{lead.source ? (tsrc.has(lead.source) ? tsrc(lead.source) : tsrc("other")) : "—"}</dd>
          </div>
          <div>
            <dt>{t("created")}</dt>
            <dd>{lead.createdAt ? shortDateTime(lead.createdAt, locale) : "—"}</dd>
          </div>
          <div>
            <dt>{t("claimedAt")}</dt>
            <dd>{lead.claimedAt ? shortDateTime(lead.claimedAt, locale) : "—"}</dd>
          </div>
          <div>
            <dt>{t("cycle")}</dt>
            <dd>{t("cycleN", { n: lead.cycleNumber })}</dd>
          </div>
          {lead.order ? (
            // §9/§12: the prepared order and its payment state, by its work ID.
            <div style={{ gridColumn: "1 / -1" }}>
              <dt>{t("order")}</dt>
              <dd className="crm-orderstate" data-paid={lead.order.paymentStatus === "paid" || undefined}>
                {lead.order.workId ? <span className="crm-code">{lead.order.workId}</span> : null}
                <span>{tps.has(lead.order.paymentStatus) ? tps(lead.order.paymentStatus) : t("orderPrepared")}</span>
              </dd>
            </div>
          ) : null}
          {lead.lostReason ? (
            <div style={{ gridColumn: "1 / -1" }}>
              <dt>{t("lost")}</dt>
              <dd>{lead.lostReason}</dd>
            </div>
          ) : null}
        </dl>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {leadCan(lead, "claim") && !lead.operatorId ? (
            <button type="button" className="crm-btn crm-btn--pri crm-btn--sm" onClick={() => void claim()} aria-busy={claiming || undefined} disabled={claiming}>
              {t("claim")}
            </button>
          ) : null}
          {leadCan(lead, "set_next_action") ? (
            <button type="button" className="crm-btn crm-btn--sm" onClick={() => setSheet("next")}>
              <IconClock aria-hidden="true" />
              {t("next")}
            </button>
          ) : null}
          {leadCan(lead, "prepare_conversion") ? (
            <button type="button" className="crm-btn crm-btn--sm" onClick={() => setSheet("conv")}>
              <IconFileText aria-hidden="true" />
              {t("convert")}
            </button>
          ) : null}
        </div>
      </section>
      {lead.sections.some((sec) => sec.key === "additional") ? (
        <section className="crm-card" aria-labelledby="crm-more-t">
          <h3 className="crm-card__h" id="crm-more-t">
            {t("more")}
          </h3>
          <DetailSections sections={lead.sections} only={["additional"]} compact />
        </section>
      ) : null}

      <section className="crm-card" aria-labelledby="crm-owner-t">
        <h3 className="crm-card__h" id="crm-owner-t">
          <IconUsers aria-hidden="true" />
          {t("people")}
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar name={lead.operator?.name ?? ""} />
          <span style={{ display: "grid", gap: 2 }}>
            <b style={{ fontSize: ".88rem" }}>{lead.operator?.name || t("unassigned")}</b>
            <small className="crm-muted">{mine ? t("you") : t("owner")}</small>
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {leadCan(lead, "assign") ? (
            <button type="button" className="crm-btn crm-btn--sm" onClick={() => setSheet("assign")}>
              {t("assign")}
            </button>
          ) : null}
          {leadCan(lead, "transfer") && lead.operatorId ? (
            <button type="button" className="crm-btn crm-btn--sm" onClick={() => setSheet("transfer")}>
              {t("transfer")}
            </button>
          ) : null}
        </div>
        <div>
          <p className="crm-sub" style={{ marginBottom: 6 }}>
            {t("watchers")}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {lead.watchers.length ? (
              <span className="crm-stack">
                {lead.watchers.slice(0, 6).map((w) => (
                  <Avatar key={w.id} name={w.name} title={w.name} />
                ))}
              </span>
            ) : (
              <span className="crm-muted" style={{ fontSize: ".8rem" }}>
                {t("noWatchers")}
              </span>
            )}
            {leadCan(lead, "manage_watchers") ? (
              <>
                <button type="button" className="crm-icobtn" onClick={() => setSheet("watchers")} aria-label={t("addWatcher")} title={t("addWatcher")}>
                  <IconUserPlus aria-hidden="true" />
                </button>
                {lead.watchers.map((w) => (
                  <button key={w.id} type="button" className="crm-chip" onClick={() => void write(() => removeLeadWatcher(lead.id, w.id), t("watcherRemoved"))} aria-label={t("removeWatcher", { name: w.name })}>
                    {w.name}
                    <IconClose aria-hidden="true" />
                  </button>
                ))}
              </>
            ) : null}
          </div>
        </div>
      </section>

      <Calls meta={meta} lead={lead} />

      {sheet === "edit" ? <EditSheet meta={meta} lead={lead} write={write} onClose={() => setSheet("")} /> : null}
      {sheet === "next" ? <NextActionSheet lead={lead} write={write} onClose={() => setSheet("")} /> : null}
      {sheet === "assign" || sheet === "transfer" ? <AssignSheet lead={lead} mode={sheet} write={write} onClose={() => setSheet("")} /> : null}
      {sheet === "watchers" ? <WatcherSheet lead={lead} write={write} onClose={() => setSheet("")} /> : null}
      {sheet === "dup" ? <DuplicateSheet lead={lead} write={write} onClose={() => setSheet("")} /> : null}
      {sheet === "conv" ? <ConversionSheet lead={lead} onClose={() => setSheet("")} onDone={() => void write(async () => null)} /> : null}
    </>
  );
}

// Calls: the honest disabled card, or the provider's call log (§7).
function Calls({ meta, lead }: { meta: CrmMeta; lead: CrmLead }): ReactElement {
  const t = useTranslations("crm.calls");
  const locale = useLocale();
  const crmErr = useCrmError();
  const tel = meta.telephony;
  const [calls, setCalls] = useState<CrmCall[] | null>(null);
  const [consent, setConsent] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);
  const enabled = tel.enabled;
  useEffect(() => {
    if (!enabled) return;
    const ctl = new AbortController();
    listLeadCalls(lead.id, tel.recordingAccess, ctl.signal).then(setCalls, (e) => {
      if (!isAborted(e)) logApiError("crm.calls", e);
      setCalls([]);
    });
    return () => ctl.abort();
  }, [enabled, lead.id, tel.recordingAccess]);
  if (!enabled) return <Telephony meta={meta} />;
  const start = async () => {
    if (busy || (tel.recordingConsentRequired && !consent)) return;
    setBusy(true);
    try {
      const c = await startLeadCall(lead.id, { purpose }, tel.recordingAccess);
      setCalls((cur) => [c, ...(cur ?? []).filter((x) => x.id !== c.id)]);
      setPurpose("");
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="crm-card" aria-labelledby="crm-calls-t">
      <h3 className="crm-card__h" id="crm-calls-t">
        <IconPhone aria-hidden="true" />
        {t("title")}
      </h3>
      {leadCan(lead, "start_call") ? (
        <div style={{ display: "grid", gap: 8 }}>
          <input className="crm-input" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder={t("purpose")} aria-label={t("purpose")} />
          {tel.recordingConsentRequired ? (
            <CheckBox checked={consent} onChange={setConsent}>
              {t("consent")}
            </CheckBox>
          ) : null}
          <button type="button" className="crm-btn crm-btn--pri crm-btn--sm" onClick={() => void start()} disabled={busy || (tel.recordingConsentRequired && !consent)} aria-busy={busy || undefined}>
            <IconPhone aria-hidden="true" />
            {t("start")}
          </button>
        </div>
      ) : null}
      {calls === null ? (
        <span className="crm-sk" />
      ) : calls.length ? (
        <ul className="crm-contacts">
          {calls.map((c) => (
            <li key={c.id}>
              <IconPhone aria-hidden="true" />
              <span>
                {t.has(`s.${c.status}`) ? t(`s.${c.status}`) : c.status} · {c.createdAt ? shortDateTime(c.createdAt, locale) : ""}
                {c.summary ? <small className="crm-muted"> · {c.summary}</small> : null}
              </span>
              {tel.recordingAccess && c.recordingUrl ? (
                <a className="crm-icobtn" href={c.recordingUrl} target="_blank" rel="noreferrer" aria-label={t("recording")}>
                  <IconArrowRight aria-hidden="true" />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="crm-sub">{t("none")}</p>
      )}
    </section>
  );
}
