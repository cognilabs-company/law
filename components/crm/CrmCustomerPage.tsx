"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import CheckBox from "@/components/CheckBox";
import { Link, useRouter } from "@/i18n/navigation";
import { IconAlert, IconArrowRight, IconCheck, IconEdit, IconHistory, IconLayers, IconPlus, IconUsers } from "@/components/icons";
import { IconShoppingBag } from "./icons";
import { shortDateTime } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import {
  addCrmContact,
  archiveCrmContact,
  crmCan,
  getCrmCustomer,
  getCustomerTimeline,
  isCrmDenied,
  listCrmCustomers,
  mergeCrmCustomers,
  updateCrmContact,
  updateCrmCustomer,
  type CrmActivity,
  type CrmCustomer,
  type CrmCustomerDetail,
  type CrmMeta,
  isFinalStatus,
} from "@/lib/services/crm";
import { useCrmEvents, useNow } from "@/lib/crm/useCrm";
import CrmFrame, { type CrmApi } from "./CrmFrame";
import { Avatar, Empty, StatusPill, WhenChip, statusVar, useCrmError } from "./bits";
import { ContactRow } from "./LeadSide";
import { Timeline } from "./LeadTimeline";
import { CrmSelect } from "./fields";



export default function CrmCustomerPage({ customerId }: { customerId: string }): ReactElement {
  const t = useTranslations("crm");
  return (
    <CrmFrame section="customers" title={t("customer.title")} back={{ href: "/admin/crm/customers", label: t("customer.back") }}>
      {(api) => <Profile api={api} customerId={customerId} />}
    </CrmFrame>
  );
}

function Profile({ api, customerId }: { api: CrmApi; customerId: string }): ReactElement {
  const t = useTranslations("crm.customer");
  const tos = useTranslations("crm.customer.orderStatus");
  const tps = useTranslations("crm.customer.payStatus");
  const tl = useTranslations("crm.lang");
  const locale = useLocale();
  const crmErr = useCrmError();
  const now = useNow();
  const meta = api.meta;
  const [c, setC] = useState<CrmCustomerDetail | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [tl2, setTl] = useState<CrmActivity[] | null>(null);
  const [sheet, setSheet] = useState<"" | "edit" | "contact" | "merge">("");
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

  if (err && !c)
    return (
      <div className="crm-card">
        <Empty
          icon={<IconAlert />}
          title={isCrmDenied(err) ? t("denied") : t("loadFailed")}
          text={crmErr(err)}
          action={
            <Link href="/admin/crm/customers" className="crm-btn">
              {t("back")}
            </Link>
          }
        />
      </div>
    );
  if (!c)
    return (
      <>
        <span className="crm-sk crm-sk--block" style={{ height: 150 }} />
        <span className="crm-sk crm-sk--block" style={{ height: 300 }} />
      </>
    );

  // Past: the leads in a final column (the backend says which ones are).
  const current = c.leads.filter((l) => !isFinalStatus(meta, l.status));
  const past = c.leads.filter((l) => isFinalStatus(meta, l.status));
  const contacts = [...c.contacts].sort((a, b) => Number(b.primary) - Number(a.primary) || Number(a.status === "archived") - Number(b.status === "archived"));
  const setPrimary = async (id: string) => {
    try {
      await updateCrmContact(c.id, id, { primary: true });
      toast(t("primarySet"), { tone: "ok" });
      void load();
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    }
  };
  const archive = async (id: string) => {
    try {
      await archiveCrmContact(c.id, id);
      toast(t("archived"), { tone: "ok" });
      void load();
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    }
  };

  return (
    <>
      <section className="crm-lhead" aria-labelledby="crm-cust-title">
        <div className="crm-lhead__top">
          <span className="crm-code">{c.publicId}</span>
          {c.isLexgoUser ? (
            <span className="crm-badge" style={{ background: "rgb(255 255 255 / 18%)", color: "#fff" }}>
              <IconCheck aria-hidden="true" />
              {c.lexgoLabel || t("linked")}
            </span>
          ) : (
            <span className="crm-badge crm-badge--muted">{t("notLinked")}</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Avatar name={c.name} large />
          <span style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <h1 id="crm-cust-title">{c.name || c.publicId}</h1>
            <span className="crm-lhead__meta">
              {c.region ? <span>{c.region}</span> : null}
              {c.language ? <span>{tl.has(c.language) ? tl(c.language) : c.language}</span> : null}
              <span>{t("leadsN", { n: c.leadCount, active: c.activeLeadCount })}</span>
              <span>{t("activityN", { n: c.activityCount })}</span>
            </span>
          </span>
        </div>
        <div className="crm-moves">
          {crmCan(meta, "crm.leads.manage") ? (
            <button type="button" className="crm-move" onClick={() => api.open("lead", { customerId: c.id, customerName: c.name })}>
              <IconPlus aria-hidden="true" />
              {t("newLead")}
            </button>
          ) : null}
          {canManage ? (
            <button type="button" className="crm-move" onClick={() => setSheet("edit")}>
              <IconEdit aria-hidden="true" />
              {t("edit")}
            </button>
          ) : null}
          {crmCan(meta, "crm.customers.merge") ? (
            <button type="button" className="crm-move" onClick={() => setSheet("merge")}>
              <IconUsers aria-hidden="true" />
              {t("merge")}
            </button>
          ) : null}
        </div>
      </section>

      <div className="crm-grid">
        <div className="crm-ws__col">
          <section className="crm-card" aria-labelledby="crm-cl-t">
            <h3 className="crm-card__h" id="crm-cl-t">
              <IconLayers aria-hidden="true" />
              {t("current")}
              <small>{current.length}</small>
            </h3>
            {current.length ? (
              <div className="crm-leadcards">
                {current.map((l) => (
                  <Link key={l.id} href={`/admin/crm/leads/${encodeURIComponent(l.id)}`} className="crm-leadcard" style={statusVar(l.status)}>
                    <b>{l.title || l.workId}</b>
                    <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <StatusPill status={l.status} />
                      {l.nextActionAt ? <WhenChip at={l.nextActionAt} now={now} /> : null}
                    </span>
                    <small>
                      {[l.workId, l.region, l.operator?.name || t("unassigned")].filter(Boolean).join(" · ")}
                    </small>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="crm-sub">{t("noCurrent")}</p>
            )}
            {past.length ? (
              <>
                <h4 className="crm-card__h" style={{ fontSize: ".82rem" }}>
                  {t("past")}
                  <small>{past.length}</small>
                </h4>
                <div className="crm-leadcards">
                  {past.map((l) => (
                    <Link key={l.id} href={`/admin/crm/leads/${encodeURIComponent(l.id)}`} className="crm-leadcard" style={statusVar(l.status)}>
                      <b>{l.title || l.workId}</b>
                      <StatusPill status={l.status} />
                      <small>
                        {l.workId} · {l.closedAt ? shortDateTime(l.closedAt, locale) : l.createdAt ? shortDateTime(l.createdAt, locale) : ""}
                      </small>
                    </Link>
                  ))}
                </div>
              </>
            ) : null}
          </section>

          <section className="crm-card" aria-labelledby="crm-ctl-t">
            <h3 className="crm-card__h" id="crm-ctl-t">
              <IconHistory aria-hidden="true" />
              {t("timeline")}
            </h3>
            {tl2 === null ? <span className="crm-sk crm-sk--block" /> : <Timeline items={tl2} />}
          </section>
        </div>

        <div className="crm-ws__col">
          <section className="crm-card crm-cust" aria-labelledby="crm-cc-t">
            <h3 className="crm-card__h" id="crm-cc-t">
              {t("contacts")}
              {canManage ? (
                <button type="button" className="crm-btn crm-btn--sm" style={{ marginLeft: "auto" }} onClick={() => setSheet("contact")}>
                  <IconPlus aria-hidden="true" />
                  {t("addContact")}
                </button>
              ) : null}
            </h3>
            {contacts.length ? (
              <ul className="crm-contacts">
                {contacts.map((x) => (
                  <ContactRow key={x.id} c={x} onPrimary={canManage ? () => void setPrimary(x.id) : undefined} onArchive={canManage ? () => void archive(x.id) : undefined} />
                ))}
              </ul>
            ) : (
              <p className="crm-sub">{t("noContacts")}</p>
            )}
            {c.notes ? (
              <p className="crm-sub" style={{ whiteSpace: "pre-wrap" }}>
                {c.notes}
              </p>
            ) : null}
          </section>

          <section className="crm-card" aria-labelledby="crm-co-t">
            <h3 className="crm-card__h" id="crm-co-t">
              <IconShoppingBag aria-hidden="true" />
              {t("orders")}
              <small>{c.orders.length}</small>
            </h3>
            {c.orders.length ? (
              <ul className="crm-contacts">
                {c.orders.map((o) => (
                  <li key={o.id}>
                    <IconShoppingBag aria-hidden="true" />
                    <span>
                      {o.serviceTitle || o.workId || t("order")}
                      <small className="crm-muted">
                        {" "}
                        {[o.serviceTitle ? o.workId : "", tos.has(o.status) ? tos(o.status) : "", tps.has(o.paymentStatus) ? tps(o.paymentStatus) : "", o.createdAt ? shortDateTime(o.createdAt, locale) : ""]
                          .filter(Boolean)
                          .map((x) => ` · ${x}`)
                          .join("")}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="crm-sub">{c.isLexgoUser ? t("noOrders") : t("ordersNeedLink")}</p>
            )}
          </section>
        </div>
      </div>

      {sheet === "edit" ? <EditCustomer c={c} meta={meta} onClose={() => setSheet("")} onSaved={() => void load()} /> : null}
      {sheet === "contact" ? <AddContact c={c} meta={meta} onClose={() => setSheet("")} onSaved={() => void load()} /> : null}
      {sheet === "merge" ? <MergeDialog target={c} onClose={() => setSheet("")} onMerged={() => void load()} /> : null}
    </>
  );
}

function EditCustomer({ c, meta, onClose, onSaved }: { c: CrmCustomerDetail; meta: CrmMeta; onClose: () => void; onSaved: () => void }): ReactElement {
  const t = useTranslations("crm.customer");
  const tn = useTranslations("crm.newCustomer");
  const tl = useTranslations("crm.lang");
  const crmErr = useCrmError();
  const [f, setF] = useState({ name: c.name, region: c.region, language: c.language, notes: c.notes });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!f.name.trim() || busy) return;
    setBusy(true);
    try {
      await updateCrmCustomer(c.id, { name: f.name, region: f.region, language: f.language, notes: f.notes });
      toast(t("saved"), { tone: "ok" });
      onSaved();
      onClose();
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      variant="drawer"
      title={t("edit")}
      busy={busy}
      dirty
      footer={
        <>
          <button type="button" className="crm-btn" onClick={onClose}>
            {tn("cancel")}
          </button>
          <button type="button" className="crm-btn crm-btn--pri" onClick={() => void save()} disabled={busy || !f.name.trim()} aria-busy={busy || undefined}>
            {t("save")}
          </button>
        </>
      }
    >
      <div className="crm-pop">
        <label className="crm-field">
          <span>{tn("name")}</span>
          <input className="crm-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <div className="crm-row2">
          <label className="crm-field">
            <span>{tn("region")}</span>
            <input className="crm-input" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} />
          </label>
          <div className="crm-field">
            <span>{tn("language")}</span>
            <CrmSelect value={f.language} onChange={(v) => setF({ ...f, language: v })} label={tn("language")} options={meta.languages.map((l) => ({ value: l, label: tl.has(l) ? tl(l) : l }))} />
          </div>
        </div>
        <label className="crm-field">
          <span>{tn("notes")}</span>
          <textarea className="crm-textarea" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </label>
      </div>
    </Modal>
  );
}

function AddContact({ c, meta, onClose, onSaved }: { c: CrmCustomerDetail; meta: CrmMeta; onClose: () => void; onSaved: () => void }): ReactElement {
  const t = useTranslations("crm.customer");
  const tc = useTranslations("crm.contact");
  const crmErr = useCrmError();
  const [type, setType] = useState(meta.contactTypes[0] || "phone");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [primary, setPrimary] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      await addCrmContact(c.id, { type, value, label, primary });
      toast(t("contactAdded"), { tone: "ok" });
      onSaved();
      onClose();
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t("addContact")}
      busy={busy}
      footer={
        <>
          <button type="button" className="crm-btn" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="button" className="crm-btn crm-btn--pri" onClick={() => void save()} disabled={busy || !value.trim()} aria-busy={busy || undefined}>
            {t("save")}
          </button>
        </>
      }
    >
      <div className="crm-pop">
        <div className="crm-seg" role="group" aria-label={tc("type")}>
          {meta.contactTypes.map((k) => (
            <button key={k} type="button" aria-pressed={type === k} onClick={() => setType(k)}>
              {tc.has(`t.${k}`) ? tc(`t.${k}`) : k}
            </button>
          ))}
        </div>
        <div className="crm-row2">
          <label className="crm-field">
            <span>{tc("value")}</span>
            <input className="crm-input" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          </label>
          <label className="crm-field">
            <span>{tc("label")}</span>
            <input className="crm-input" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
        </div>
        <CheckBox checked={primary} onChange={setPrimary}>
          {tc("makePrimary")}
        </CheckBox>
      </div>
    </Modal>
  );
}

// Merging is explicit, privileged and destructive (§2, §4.2): both
// profiles side by side, the leads and contacts that move, a typed "yes".
function MergeDialog({ target, onClose, onMerged }: { target: CrmCustomerDetail; onClose: () => void; onMerged: () => void }): ReactElement {
  const t = useTranslations("crm.merge");
  const crmErr = useCrmError();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<CrmCustomer[]>([]);
  const [source, setSource] = useState<CrmCustomerDetail | null>(null);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const word = t("confirmWord");
  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctl = new AbortController();
    const id = window.setTimeout(() => listCrmCustomers({ q, limit: 8, status: "" }, ctl.signal).then((p) => setFound(p.items.filter((x) => x.id !== target.id)), (e) => !isAborted(e) && logApiError("crm.merge.search", e)), 220);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [q, target.id]);
  const pick = async (id: string) => {
    try {
      setSource(await getCrmCustomer(id));
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    }
  };
  const ready = !!source && reason.trim().length >= 3 && typed.trim().toLowerCase() === word.toLowerCase();
  const merge = async () => {
    if (!ready || !source || busy) return;
    setBusy(true);
    try {
      await mergeCrmCustomers(target.id, [source.id], reason);
      toast(t("done"), { tone: "ok" });
      onMerged();
      onClose();
      router.refresh();
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy(false);
    }
  };
  const fields = (x: CrmCustomerDetail): [string, string][] => [
    [t("f.id"), x.publicId],
    [t("f.phone"), x.phone],
    [t("f.telegram"), x.telegram],
    [t("f.email"), x.email],
    [t("f.region"), x.region],
    [t("f.account"), x.isLexgoUser ? t("yes") : t("no")],
    [t("f.leads"), String(x.leadCount)],
  ];
  return (
    <Modal
      open
      onClose={onClose}
      title={t("title")}
      description={t("lead")}
      size="lg"
      busy={busy}
      dirty={!!reason}
      footer={
        <>
          <button type="button" className="crm-btn" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </button>
          <button type="button" className="crm-btn crm-btn--danger" onClick={() => void merge()} disabled={!ready || busy} aria-busy={busy || undefined}>
            {t("confirm")}
          </button>
        </>
      }
    >
      <div className="crm-pop">
        {!source ? (
          <>
            <input className="crm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("find")} aria-label={t("find")} autoFocus />
            {found.length ? (
              <div className="crm-slash">
                {found.map((x) => (
                  <button key={x.id} type="button" onClick={() => void pick(x.id)}>
                    <b>{x.name || x.publicId}</b>
                    <small>{[x.publicId, x.phone, x.region].filter(Boolean).join(" · ")}</small>
                  </button>
                ))}
              </div>
            ) : (
              <p className="crm-sub">{t("findHint")}</p>
            )}
          </>
        ) : (
          <>
            <div className="crm-compare">
              <div className="crm-compare__side" data-drop="">
                <b>{source.name}</b>
                <small className="crm-muted">{t("goes")}</small>
                <dl>
                  {fields(source).map(([k, v], i) => (
                    <div key={k} data-diff={v !== fields(target)[i][1] ? "" : undefined}>
                      <dt>{k}</dt>
                      <dd>{v || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <IconArrowRight aria-hidden="true" />
              <div className="crm-compare__side" data-keep="">
                <b>{target.name}</b>
                <small className="crm-muted">{t("stays")}</small>
                <dl>
                  {fields(target).map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
            <div className="crm-banner crm-banner--bad">
              <IconAlert aria-hidden="true" />
              <span>
                <b>{t("moves", { leads: source.leads.length, contacts: source.contacts.length })}</b>
                {source.leads.map((l) => l.workId || l.title).join(", ") || t("noLeads")}
                {source.contacts.length ? ` · ${source.contacts.map((x) => x.value).join(", ")}` : ""}
              </span>
              <button type="button" className="crm-link" onClick={() => setSource(null)}>
                {t("change")}
              </button>
            </div>
            <label className="crm-field">
              <span>{t("reason")}</span>
              <textarea className="crm-textarea" value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <label className="crm-field">
              <span>{t("type", { word })}</span>
              <input className="crm-input" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label={t("type", { word })} />
            </label>
          </>
        )}
      </div>
    </Modal>
  );
}
