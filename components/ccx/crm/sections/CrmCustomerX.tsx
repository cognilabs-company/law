"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { shortDateTime } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { statusColorVars } from "@/components/crm/bits";
import {
  activeContacts,
  archiveCrmContact,
  crmCan,
  getCrmCustomer,
  getCustomerTimeline,
  isCrmDenied,
  isFinalStatus,
  updateCrmContact,
  updateCrmCustomer,
  type CrmActivity,
  type CrmCustomerDetail,
  type CrmLead,
  type CrmMeta,
} from "@/lib/services/crm";
import { useCrmEvents, useNow, minutesUntil } from "@/lib/crm/useCrm";
import { prettyPhone } from "../../now/feed";
import { CopyButton } from "../../now/NowFocus";
import { Note } from "../../panel/bits";
import { IcArrowLeft, IcArrowRight, IcDoc, IcPhone, IcShield, IcTimeline } from "../../icons";
import { crmHref, leadHref, type CrmSectionProps } from "../nav";
import { useCrmErr, useRegionName } from "../leads/util";
import { AddContactSheet, EditCustomerSheet, MergeSheet, NewLeadSheet } from "../detail/customerSheets";
import { DetailBlocks } from "../detail/detailList";
import { ContactRow } from "../detail/leadCards";
import { ActivityList } from "../detail/leadFeed";
import { IcAlert, IcCart, IcChat, IcEdit, IcInfo, IcLink, IcPin, IcPlus, IcUsers } from "../detail/glyphs";
import { Avatar, Card, ContactGlyph, Empty, Pill, Shim, StatusChip, TextArea, contactHref, telOf } from "../detail/kit";

type Tab = "leads" | "orders" | "timeline";
type Sheet = "" | "edit" | "contact" | "merge" | "lead";

export default function CrmCustomerX({ meta }: CrmSectionProps) {
  const params = useSearchParams();
  const id = params.get("customer") ?? "";
  return <Profile key={id} meta={meta} customerId={id} />;
}

function Profile({ meta, customerId }: { meta: CrmMeta; customerId: string }) {
  const t = useTranslations("crm.customer");
  const tl = useTranslations("admin.ccx.crm.lang");
  const tf = useTranslations("crm.detail.f");
  const tp = useTranslations("admin.ccx.panel");
  const regionName = useRegionName();
  const locale = useLocale();
  const now = useNow();
  const crmErr = useCrmErr();
  const [c, setC] = useState<CrmCustomerDetail | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [tl2, setTl] = useState<CrmActivity[] | null>(null);
  const [sheet, setSheet] = useState<Sheet>("");
  const [tab, setTab] = useState<Tab>("leads");
  const [contactBusy, setContactBusy] = useState("");
  const canManage = crmCan(meta, "crm.customers.manage");

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setC(await getCrmCustomer(customerId, signal));
        setErr(null);
      } catch (e) {
        if (!isAborted(e)) {
          logApiError("crm.customer", e);
          setErr(e);
        }
      }
      try {
        setTl(await getCustomerTimeline(customerId, signal));
      } catch (e) {
        if (!isAborted(e)) logApiError("crm.customer.timeline", e);
        setTl((cur) => cur ?? []);
      }
    },
    [customerId],
  );
  useEffect(() => {
    const ctl = new AbortController();
    const id = window.setTimeout(() => void load(ctl.signal), 0);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [load]);
  useCrmEvents((ev) => {
    if (ev.invalidate.includes("all") || ev.customerId === customerId || (ev.leadId && c?.leads.some((l) => l.id === ev.leadId))) void load();
  });

  if (err && !c) {
    return (
      <div className="opx-cd">
        <Empty
          icon={<IcAlert size={22} />}
          title={isCrmDenied(err) ? t("denied") : t("loadFailed")}
          text={crmErr(err)}
          action={
            <Link href={crmHref("customers")} className="opx-pbtn">
              <IcArrowLeft size={16} />
              {t("back")}
            </Link>
          }
        />
      </div>
    );
  }
  if (!c) {
    return (
      <div className="opx-cd" aria-busy="true">
        <Shim h={190} />
        <div className="opx-cd-grid">
          <div className="opx-cd-col">
            <Shim h={300} />
          </div>
          <div className="opx-cd-col">
            <Shim h={220} />
          </div>
        </div>
      </div>
    );
  }

  const current = c.leads.filter((l) => !isFinalStatus(meta, l.status));
  const past = c.leads.filter((l) => isFinalStatus(meta, l.status));
  const contacts = [...c.contacts].sort((a, b) => Number(b.primary) - Number(a.primary) || Number(a.status === "archived") - Number(b.status === "archived"));
  const live = activeContacts(c.contacts);
  const onlyOne = live.length <= 1;
  const phone = c.phone || live.find((x) => x.type === "phone")?.value || "";
  const tel = telOf(phone);

  const setPrimary = async (id: string) => {
    if (contactBusy) return;
    setContactBusy(id);
    try {
      await updateCrmContact(c.id, id, { primary: true });
      toast(t("primarySet"), { tone: "ok" });
      void load();
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setContactBusy("");
    }
  };
  const archive = async (id: string) => {
    if (contactBusy) return;
    setContactBusy(id);
    try {
      await archiveCrmContact(c.id, id);
      toast(t("archived"), { tone: "ok" });
      void load();
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setContactBusy("");
    }
  };

  const tiles: [string, number][] = [
    [tf("lead_count"), c.leadCount],
    [tf("active_lead_count"), c.activeLeadCount],
    [tf("orders_count"), c.orders.length],
    [tf("activity_count"), c.activityCount],
  ];
  const tabs: { key: Tab; label: string; n?: number }[] = [
    { key: "leads", label: tf("lead_count"), n: c.leads.length },
    { key: "orders", label: t("orders"), n: c.orders.length },
    { key: "timeline", label: t("timeline") },
  ];

  return (
    <div className="opx-cd opx-cd--customer" style={statusColorVars(meta)}>
      <header className="opx-cd-head opx-cd-chead">
        <div className="opx-cd-head__top">
          <Link href={crmHref("customers")} className="opx-cd-back">
            <IcArrowLeft size={16} />
            {t("back")}
          </Link>
        </div>
        <div className="opx-cd-chead__main">
          <Avatar name={c.name} size="xl" />
          <div className="opx-cd-chead__id">
            <h2>{c.name || c.publicId}</h2>
            <div className="opx-cd-chead__tags">
              <span className="opx-cd-code opx-num">{c.publicId}</span>
              <Pill tone={c.isLexgoUser ? "ok" : "mute"}>
                <IcLink size={13} />
                {c.isLexgoUser ? t("linked") : t("notLinked")}
              </Pill>
              <Pill tone={c.lifecycle === "customer" ? "ok" : "info"}>{t(`life.${c.lifecycle === "customer" ? "customer" : "prospect"}`)}</Pill>
              {c.region ? (
                <span className="opx-cd-tag">
                  <IcPin size={14} />
                  {regionName(c.region)}
                </span>
              ) : null}
              {c.language ? <span className="opx-cd-tag">{tl.has(c.language) ? tl(c.language) : c.language}</span> : null}
            </div>
            {live.length ? (
              <ul className="opx-cd-cchips">
                {live.map((x) => {
                  const href = contactHref(x);
                  return (
                    <li key={x.id} data-primary={x.primary || undefined}>
                      <ContactGlyph type={x.type} size={14} />
                      <span className="opx-num" dir="ltr">
                        {x.type === "phone" ? prettyPhone(x.value) : x.value}
                      </span>
                      <CopyButton value={x.value} label={x.value} />
                      {href ? (
                        <a className="opx-cd-ibtn" href={href} target={x.type === "telegram" ? "_blank" : undefined} rel="noreferrer" aria-label={x.value} title={x.value}>
                          <IcArrowRight size={14} />
                        </a>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
          <div className="opx-cd-chead__acts">
            {tel ? (
              <a className="opx-pbtn opx-pbtn--call" href={tel} aria-label={`${tp("call")}: ${phone}`}>
                <IcPhone size={15} />
                {tp("call")}
              </a>
            ) : null}
            {crmCan(meta, "crm.leads.manage") ? (
              <button type="button" className="opx-pbtn opx-pbtn--main" onClick={() => setSheet("lead")}>
                <IcPlus size={16} />
                {t("newLead")}
              </button>
            ) : null}
            {canManage ? (
              <button type="button" className="opx-pbtn" onClick={() => setSheet("edit")}>
                <IcEdit size={16} />
                {t("edit")}
              </button>
            ) : null}
            {crmCan(meta, "crm.customers.merge") ? (
              <button type="button" className="opx-pbtn" onClick={() => setSheet("merge")}>
                <IcUsers size={16} />
                {t("merge")}
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <dl className="opx-cd-tiles">
        {tiles.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="opx-num">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="opx-cd-grid">
        <div className="opx-cd-col opx-cd-col--main">
          <section className="opx-cd-card opx-cd-feed" aria-label={c.name || c.publicId}>
            <div className="opx-cd-tabs" role="tablist">
              {tabs.map((x) => (
                <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} onClick={() => setTab(x.key)}>
                  {x.key === "leads" ? <IcTimeline size={16} /> : x.key === "orders" ? <IcCart size={16} /> : <IcChat size={16} />}
                  {x.label}
                  {x.n != null ? <b className="opx-cd-count opx-num">{x.n}</b> : null}
                </button>
              ))}
            </div>
            <div className="opx-cd-feed__body" role="tabpanel">
              {tab === "leads" ? (
                c.leads.length ? (
                  <>
                    {current.length ? (
                      <div className="opx-cd-leads">
                        {current.map((l) => (
                          <LeadCard key={l.id} meta={meta} lead={l} now={now} />
                        ))}
                      </div>
                    ) : (
                      <p className="opx-cd-sub">{t("noCurrent")}</p>
                    )}
                    {past.length ? (
                      <>
                        <h4 className="opx-cd-subh">
                          {t("past")}
                          <b className="opx-cd-count opx-num">{past.length}</b>
                        </h4>
                        <div className="opx-cd-leads">
                          {past.map((l) => (
                            <LeadCard key={l.id} meta={meta} lead={l} now={now} past />
                          ))}
                        </div>
                      </>
                    ) : null}
                  </>
                ) : (
                  <Empty icon={<IcTimeline size={22} />} title={t("noCurrent")} />
                )
              ) : tab === "orders" ? (
                c.orders.length ? (
                  <OrderList c={c} />
                ) : (
                  <Empty icon={<IcCart size={22} />} title={c.isLexgoUser ? t("noOrders") : t("ordersNeedLink")} />
                )
              ) : tl2 === null ? (
                <Shim h={120} />
              ) : (
                <ActivityList items={tl2} />
              )}
            </div>
          </section>
        </div>

        <div className="opx-cd-col opx-cd-col--side">
          <Card
            icon={<IcPhone size={17} />}
            title={t("contacts")}
            aside={
              canManage ? (
                <button type="button" className="opx-pbtn opx-cd-btn-sm" onClick={() => setSheet("contact")}>
                  <IcPlus size={15} />
                  {t("addContact")}
                </button>
              ) : null
            }
          >
            {canManage && onlyOne && contacts.length ? <Note tone="info">{t("lastContact")}</Note> : null}
            {contacts.length ? (
              <ul className="opx-cd-contacts">
                {contacts.map((x) => (
                  <ContactRow
                    key={x.id}
                    c={x}
                    busy={!!contactBusy}
                    onPrimary={canManage ? () => void setPrimary(x.id) : undefined}
                    onArchive={canManage ? () => void archive(x.id) : undefined}
                    archiveBlocked={onlyOne && x.status !== "archived" ? t("lastContact") : undefined}
                  />
                ))}
              </ul>
            ) : (
              <p className="opx-cd-sub">{t("noContacts")}</p>
            )}
          </Card>

          <NotesCard c={c} canManage={canManage} onSaved={() => void load()} />

          <Card icon={<IcShield size={17} />} title={t("linkTitle")} className="opx-cd-linkcard" tone={c.linking.linked ? undefined : "warn"}>
            <p className="opx-cd-linkstate" data-on={c.linking.linked || undefined}>
              {c.linking.linked ? <IcLink size={16} /> : <IcInfo size={16} />}
              <b>{c.linking.linked ? t("linked") : t("notLinked")}</b>
            </p>
            {!c.linking.linked ? <p className="opx-cd-sub">{c.linking.requiredAction || (c.linking.automatic ? t("linkAuto") : t("linkManual"))}</p> : null}
            <p className="opx-cd-sub">{c.lifecycle === "customer" ? t("lifeCustomerSince", { date: c.becameCustomerAt ? shortDateTime(c.becameCustomerAt, locale) : "—" }) : t("lifeProspect")}</p>
          </Card>

          {c.sections.length ? (
            <Card icon={<IcDoc size={17} />} title={t("details")}>
              <DetailBlocks sections={c.sections} />
            </Card>
          ) : null}
        </div>
      </div>

      {sheet === "edit" ? <EditCustomerSheet c={c} meta={meta} onClose={() => setSheet("")} onSaved={() => void load()} /> : null}
      {sheet === "contact" ? <AddContactSheet c={c} meta={meta} onClose={() => setSheet("")} onSaved={() => void load()} /> : null}
      {sheet === "merge" ? <MergeSheet target={c} onClose={() => setSheet("")} onMerged={() => void load()} /> : null}
      {sheet === "lead" ? <NewLeadSheet meta={meta} customer={c} onClose={() => setSheet("")} /> : null}
    </div>
  );
}

function LeadCard({ meta, lead, now, past }: { meta: CrmMeta; lead: CrmLead; now: number; past?: boolean }) {
  const t = useTranslations("crm.customer");
  const tw = useTranslations("crm.when");
  const regionName = useRegionName();
  const locale = useLocale();
  const m = past ? null : minutesUntil(lead.nextActionAt, now);
  const abs = m === null ? 0 : Math.abs(m);
  const span = abs < 60 ? tw("min", { n: abs }) : abs < 60 * 48 ? tw("h", { n: Math.round(abs / 60) }) : tw("d", { n: Math.round(abs / 1440) });
  const when = m === null ? "" : m < 0 ? tw("overdue", { span }) : abs < 1 ? tw("now") : tw("in", { span });
  const sub = past ? [lead.workId, lead.closedAt ? shortDateTime(lead.closedAt, locale) : lead.createdAt ? shortDateTime(lead.createdAt, locale) : ""] : [lead.workId, regionName(lead.region), lead.operator?.name || t("unassigned")];
  return (
    <Link href={leadHref(lead.id)} className="opx-cd-lcard" data-past={past || undefined}>
      <b>{lead.title || lead.workId}</b>
      <span className="opx-cd-lcard__row">
        <StatusChip meta={meta} status={lead.status} />
        {when ? (
          <Pill tone={m !== null && m < 0 ? "hot" : m !== null && m <= 60 ? "warn" : "mute"} title={lead.nextActionAt}>
            {when}
          </Pill>
        ) : null}
      </span>
      <small className="opx-num">{sub.filter(Boolean).join(" · ")}</small>
      <IcArrowRight size={16} className="opx-cd-lcard__go" />
    </Link>
  );
}

function OrderList({ c }: { c: CrmCustomerDetail }) {
  const t = useTranslations("crm.customer");
  const tos = useTranslations("crm.customer.orderStatus");
  const tps = useTranslations("crm.customer.payStatus");
  const locale = useLocale();
  return (
    <ul className="opx-cd-orders">
      {c.orders.map((o) => (
        <li key={o.id}>
          <span className="opx-cd-orders__ic" aria-hidden="true">
            <IcCart size={16} />
          </span>
          <span className="opx-cd-orders__txt">
            <b>{o.serviceTitle || o.workId || t("order")}</b>
            <small className="opx-num">{[o.serviceTitle ? o.workId : "", o.createdAt ? shortDateTime(o.createdAt, locale) : ""].filter(Boolean).join(" · ")}</small>
          </span>
          <span className="opx-cd-orders__st">
            {tos.has(o.status) ? <Pill tone="info">{tos(o.status)}</Pill> : null}
            {tps.has(o.paymentStatus) ? <Pill tone={o.paymentStatus === "paid" ? "ok" : o.paymentStatus === "failed" ? "hot" : "warn"}>{tps(o.paymentStatus)}</Pill> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function NotesCard({ c, canManage, onSaved }: { c: CrmCustomerDetail; canManage: boolean; onSaved: () => void }) {
  const tn = useTranslations("crm.newCustomer");
  const t = useTranslations("crm.customer");
  const ts = useTranslations("crm.side");
  const tsh = useTranslations("crm.sheet");
  const tx = useTranslations("admin.ccx.crmDetail");
  const crmErr = useCrmErr();
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(c.notes);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await updateCrmCustomer(c.id, { notes: text });
      toast(t("saved"), { tone: "ok" });
      setEdit(false);
      onSaved();
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card
      icon={<IcChat size={17} />}
      title={tn("notes")}
      className="opx-cd-notes"
      aside={
        canManage && !edit ? (
          <button
            type="button"
            className="opx-cd-ibtn"
            onClick={() => {
              setText(c.notes);
              setEdit(true);
            }}
            aria-label={ts("edit")}
            title={ts("edit")}
          >
            <IcEdit size={16} />
          </button>
        ) : null
      }
    >
      {edit ? (
        <>
          <TextArea label={tn("notes")} value={text} onChange={setText} rows={5} autoFocus />
          <div className="opx-cd-row">
            <button type="button" className="opx-pbtn opx-cd-btn-sm" onClick={() => setEdit(false)} disabled={busy}>
              {tsh("cancel")}
            </button>
            <button type="button" className="opx-pbtn opx-pbtn--main opx-cd-btn-sm" onClick={() => void save()} disabled={busy || text === c.notes} aria-busy={busy || undefined}>
              {tsh("save")}
            </button>
          </div>
        </>
      ) : c.notes ? (
        <p className="opx-cd-notes__text">{c.notes}</p>
      ) : (
        <p className="opx-cd-sub">{tx("noNotes")}</p>
      )}
    </Card>
  );
}
