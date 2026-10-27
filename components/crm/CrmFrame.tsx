"use client";

import "./crm.css";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { Link, useRouter } from "@/i18n/navigation";
import { IconAlert, IconCheck, IconDownload, IconLayers, IconLock, IconPlus, IconRefresh, IconSearch, IconUser, IconUsers } from "@/components/icons";
import { saveBlob } from "@/lib/download";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import {
  CRM_STATUSES,
  EXPORT_SCOPES,
  createCrmCustomer,
  createCrmExport,
  createCrmLead,
  crmCan,
  downloadCrmExport,
  isCrmDenied,
  listCrmCustomers,
  listCrmLeads,
  type CrmCustomer,
  type CrmLead,
  type CrmMeta,
  type ContactInput,
} from "@/lib/services/crm";
import { dismissCrmExport, loadCrmMeta, refreshCrmExport, trackCrmExport, useCrmEvents, useCrmExports, useCrmMeta } from "@/lib/crm/useCrm";
import { CrmTop, Empty, SkeletonRows, useCrmError, type CrmBack } from "./bits";
import { CrmDate, CrmDateTime, CrmSelect } from "./fields";

type Sheet = "" | "lead" | "customer" | "export";
export type CrmApi = { meta: CrmMeta; open: (s: Exclude<Sheet, "">, preset?: { customerId?: string; customerName?: string }) => void };

// Every CRM page: the meta gate, the header, the ⌘K palette, the create
// sheets and the export tray. `children` gets the meta and the openers.
export default function CrmFrame({ title, tools, back, children }: { title?: string; tools?: (api: CrmApi) => ReactNode; back?: CrmBack; children: (api: CrmApi) => ReactNode }): ReactElement {
  const t = useTranslations("crm");
  const { meta, error } = useCrmMeta();
  const [palette, setPalette] = useState(false);
  const [sheet, setSheet] = useState<Sheet>("");
  const [preset, setPreset] = useState<{ customerId?: string; customerName?: string }>({});
  const openPalette = useCallback(() => setPalette(true), []);
  const api = useMemo<CrmApi | null>(
    () =>
      meta
        ? {
            meta,
            open: (s, p) => {
              setPreset(p ?? {});
              setSheet(s);
            },
          }
        : null,
    [meta],
  );

  if (error && !meta) {
    return (
      <div className="crm">
        <div className="crm-card">
          {isCrmDenied(error) ? (
            <Empty icon={<IconLock />} title={t("denied")} text={t("deniedText")} />
          ) : (
            <Empty
              icon={<IconAlert />}
              title={t("metaFailed")}
              action={
                <button type="button" className="crm-btn" onClick={() => void loadCrmMeta(true)}>
                  <IconRefresh aria-hidden="true" />
                  {t("retry")}
                </button>
              }
            />
          )}
        </div>
      </div>
    );
  }
  if (!api) {
    return (
      <div className="crm">
        <span className="crm-sk crm-sk--block" />
        <SkeletonRows />
      </div>
    );
  }
  return (
    <div className="crm">
      <CrmTop meta={api.meta} title={title ?? t("title")} onPalette={openPalette} tools={tools?.(api)} back={back} />
      {children(api)}
      <ExportTray />
      {palette ? <Palette api={api} onClose={() => setPalette(false)} /> : null}
      {sheet === "lead" ? <LeadSheet meta={api.meta} preset={preset} onClose={() => setSheet("")} /> : null}
      {sheet === "customer" ? <CustomerSheet meta={api.meta} onClose={() => setSheet("")} /> : null}
      {sheet === "export" ? <ExportSheet meta={api.meta} onClose={() => setSheet("")} /> : null}
    </div>
  );
}

// ── ⌘K: customers and leads from the backend, plus quick actions ──
function Palette({ api, onClose }: { api: CrmApi; onClose: () => void }): ReactElement {
  const t = useTranslations("crm.palette");
  const router = useRouter();
  const [q, setQ] = useState("");
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [customers, setCustomers] = useState<CrmCustomer[]>([]);
  const [sel, setSel] = useState(0);
  const canLeads = crmCan(api.meta, "crm.leads.view");
  const canCustomers = crmCan(api.meta, "crm.customers.view");
  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) {
      const id = window.setTimeout(() => {
        setLeads([]);
        setCustomers([]);
      }, 0);
      return () => window.clearTimeout(id);
    }
    const ctl = new AbortController();
    const id = window.setTimeout(() => {
      if (canLeads) listCrmLeads({ q: needle, limit: 6 }, ctl.signal).then((p) => setLeads(p.items), (e) => !isAborted(e) && logApiError("crm.palette.leads", e));
      if (canCustomers) listCrmCustomers({ q: needle, limit: 6, status: "" }, ctl.signal).then((p) => setCustomers(p.items), (e) => !isAborted(e) && logApiError("crm.palette.customers", e));
    }, 220);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [q, canLeads, canCustomers]);
  const actions = [
    crmCan(api.meta, "crm.leads.manage") ? { key: "newLead", run: () => api.open("lead") } : null,
    crmCan(api.meta, "crm.customers.manage") ? { key: "newCustomer", run: () => api.open("customer") } : null,
    crmCan(api.meta, "crm.exports.create") ? { key: "export", run: () => api.open("export") } : null,
  ].filter((x): x is { key: string; run: () => void } => !!x);
  const rows: { id: string; go: () => void; node: ReactNode }[] = [
    ...leads.map((l) => ({
      id: `l-${l.id}`,
      go: () => router.push(`/admin/crm/leads/${encodeURIComponent(l.id)}`),
      node: (
        <>
          <IconLayers aria-hidden="true" />
          <span>{l.title || l.workId}</span>
          <small>{[l.workId, l.customer?.name].filter(Boolean).join(" · ")}</small>
        </>
      ),
    })),
    ...customers.map((c) => ({
      id: `c-${c.id}`,
      go: () => router.push(`/admin/crm/customers/${encodeURIComponent(c.id)}`),
      node: (
        <>
          <IconUser aria-hidden="true" />
          <span>{c.name || c.publicId}</span>
          <small>{[c.publicId, c.phone].filter(Boolean).join(" · ")}</small>
        </>
      ),
    })),
    ...actions.map((a) => ({
      id: `a-${a.key}`,
      go: a.run,
      node: (
        <>
          <IconPlus aria-hidden="true" />
          <span>{t(`act.${a.key}`)}</span>
        </>
      ),
    })),
  ];
  const go = (i: number) => {
    const r = rows[i];
    if (!r) return;
    onClose();
    r.go();
  };
  return (
    <Modal open onClose={onClose} title={t("title")} size="md">
      <div className="crm-pop crm-palette">
        <label className="crm-search" style={{ maxWidth: "none" }}>
          <IconSearch aria-hidden="true" />
          <input
            className="crm-input"
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(rows.length - 1, s + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(sel);
              }
            }}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls="crm-palette-list"
          />
        </label>
        <ul id="crm-palette-list" role="listbox" aria-label={t("results")}>
          {rows.length ? (
            rows.map((r, i) => (
              <li key={r.id}>
                <button type="button" className="crm-palette__act" role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => go(i)}>
                  {r.node}
                </button>
              </li>
            ))
          ) : (
            <li>
              <p>{q.trim().length < 2 ? t("hint") : t("none")}</p>
            </li>
          )}
        </ul>
      </div>
    </Modal>
  );
}

// ── Export tray: queued → processing → ready / failed / expired ──
function ExportTray(): ReactElement | null {
  const t = useTranslations("crm.export");
  const jobs = useCrmExports();
  const crmErr = useCrmError();
  useCrmEvents((ev) => {
    if (ev.exportId && ev.invalidate.includes("export")) refreshCrmExport(ev.exportId);
  });
  if (!jobs.length) return null;
  const save = async (id: string, scope: string) => {
    try {
      const { blob, name } = await downloadCrmExport(id);
      saveBlob(blob, name || `lexgo-crm-${scope}.xlsx`);
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
      refreshCrmExport(id);
    }
  };
  return (
    <div className="crm-tray" role="region" aria-label={t("tray")} aria-live="polite">
      {jobs.map((j) => (
        <div key={j.id} className="crm-job" data-s={j.status}>
          <i aria-hidden="true">{j.status === "ready" ? <IconDownload /> : j.status === "failed" || j.status === "expired" ? <IconAlert /> : <IconRefresh />}</i>
          <span>
            <b>{t("job", { scope: t.has(`scope.${j.scope}`) ? t(`scope.${j.scope}`) : j.scope })}</b>
            <small>{t.has(`state.${j.status}`) ? t(`state.${j.status}`) : j.status}</small>
          </span>
          {j.status === "ready" ? (
            <button type="button" className="crm-btn crm-btn--pri crm-btn--sm" onClick={() => void save(j.id, j.scope)}>
              {t("download")}
            </button>
          ) : null}
          <button type="button" className="crm-icobtn" onClick={() => dismissCrmExport(j.id)} aria-label={t("dismiss")} title={t("dismiss")}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function ExportSheet({ meta, onClose }: { meta: CrmMeta; onClose: () => void }): ReactElement {
  const t = useTranslations("crm.export");
  const ts = useTranslations("crm.status");
  const crmErr = useCrmError();
  const [scope, setScope] = useState<string>("leads");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // The backend applies every filter and the viewer's scope (§9).
      const job = await createCrmExport({ scope, from: from ? new Date(from).toISOString() : "", to: to ? new Date(to).toISOString() : "", status: scope === "leads" ? status : "" });
      trackCrmExport(job);
      toast(t("started"), { tone: "ok" });
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
      title={t("title")}
      description={t("lead")}
      busy={busy}
      footer={
        <>
          <button type="button" className="crm-btn" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="button" className="crm-btn crm-btn--pri" onClick={() => void submit()} aria-busy={busy || undefined} disabled={busy}>
            <IconDownload aria-hidden="true" />
            {t("create")}
          </button>
        </>
      }
    >
      <div className="crm-pop">
        <div className="crm-seg" role="group" aria-label={t("scopeLabel")}>
          {EXPORT_SCOPES.map((s) => (
            <button key={s} type="button" aria-pressed={scope === s} onClick={() => setScope(s)}>
              {t(`scope.${s}`)}
            </button>
          ))}
        </div>
        <div className="crm-row2">
          <div className="crm-field">
            <span>{t("from")}</span>
            <CrmDate value={from} onChange={setFrom} label={t("from")} />
          </div>
          <div className="crm-field">
            <span>{t("to")}</span>
            <CrmDate value={to} onChange={setTo} label={t("to")} />
          </div>
        </div>
        {scope === "leads" ? (
          <div className="crm-field">
            <span>{t("status")}</span>
            <CrmSelect value={status} onChange={setStatus} label={t("status")} options={[{ value: "", label: t("anyStatus") }, ...(meta.statuses.length ? meta.statuses : [...CRM_STATUSES]).map((s) => ({ value: s, label: ts.has(s) ? ts(s) : s }))]} />
          </div>
        ) : null}
        <p className="crm-sub">{t("note")}</p>
      </div>
    </Modal>
  );
}

// ── Create a customer ──
function CustomerSheet({ meta, onClose }: { meta: CrmMeta; onClose: () => void }): ReactElement {
  const t = useTranslations("crm.newCustomer");
  const tl = useTranslations("crm.lang");
  const crmErr = useCrmError();
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [telegram, setTelegram] = useState("");
  const [email, setEmail] = useState("");
  const [region, setRegion] = useState("");
  const [language, setLanguage] = useState(meta.languages[0] || "uz_latn");
  const [notes, setNotes] = useState("");
  const [userId, setUserId] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const nameErr = tried && !name.trim() ? t("nameRequired") : "";
  const submit = async () => {
    setTried(true);
    if (!name.trim() || busy) return;
    setBusy(true);
    const contacts: ContactInput[] = [
      { type: "phone", value: phone, primary: true },
      { type: "telegram", value: telegram, primary: !phone.trim() },
      { type: "email", value: email, primary: !phone.trim() && !telegram.trim() },
    ].filter((c) => c.value.trim());
    try {
      const c = await createCrmCustomer({ name, region, language, notes, userId, contacts, source: "manual" });
      toast(t("done"), { tone: "ok" });
      onClose();
      router.push(`/admin/crm/customers/${encodeURIComponent(c.id)}`);
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
      title={t("title")}
      description={t("lead")}
      busy={busy}
      dirty={!!(name || phone || telegram || email || notes)}
      footer={
        <>
          <button type="button" className="crm-btn" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="button" className="crm-btn crm-btn--pri" onClick={() => void submit()} aria-busy={busy || undefined} disabled={busy}>
            <IconCheck aria-hidden="true" />
            {t("create")}
          </button>
        </>
      }
    >
      <div className="crm-pop">
        <label className="crm-field" data-err={nameErr ? "" : undefined}>
          <span>{t("name")}</span>
          <input className="crm-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-invalid={!!nameErr} />
          {nameErr ? <em>{nameErr}</em> : null}
        </label>
        <div className="crm-row2">
          <label className="crm-field">
            <span>{t("phone")}</span>
            <input className="crm-input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998" />
          </label>
          <label className="crm-field">
            <span>{t("telegram")}</span>
            <input className="crm-input" value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@" />
          </label>
        </div>
        <div className="crm-row2">
          <label className="crm-field">
            <span>{t("email")}</span>
            <input className="crm-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="crm-field">
            <span>{t("region")}</span>
            <input className="crm-input" value={region} onChange={(e) => setRegion(e.target.value)} />
          </label>
        </div>
        <div className="crm-field">
          <span>{t("language")}</span>
          <CrmSelect value={language} onChange={setLanguage} label={t("language")} options={meta.languages.map((l) => ({ value: l, label: tl.has(l) ? tl(l) : l }))} />
        </div>
        <label className="crm-field">
          <span>{t("userId")}</span>
          <input className="crm-input" value={userId} onChange={(e) => setUserId(e.target.value)} />
          <small>{t("userIdHelp")}</small>
        </label>
        <label className="crm-field">
          <span>{t("notes")}</span>
          <textarea className="crm-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}

// ── Create a lead: an existing customer, a LexGo user, or a new customer ──
function LeadSheet({ meta, preset, onClose }: { meta: CrmMeta; preset: { customerId?: string; customerName?: string }; onClose: () => void }): ReactElement {
  const t = useTranslations("crm.newLead");
  const tl = useTranslations("crm.lang");
  const crmErr = useCrmError();
  const router = useRouter();
  const [who, setWho] = useState<"existing" | "user" | "new">(preset.customerId ? "existing" : "existing");
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(preset.customerId ? { id: preset.customerId, name: preset.customerName ?? "" } : null);
  const [cq, setCq] = useState("");
  const [found, setFound] = useState<CrmCustomer[]>([]);
  const [clientUserId, setClientUserId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState("");
  const [category, setCategory] = useState("");
  const [region, setRegion] = useState("");
  const [urgency, setUrgency] = useState("normal");
  const [source, setSource] = useState(meta.sources.includes("phone") ? "phone" : meta.sources[0] || "manual");
  const [language, setLanguage] = useState(meta.languages[0] || "uz_latn");
  const [next, setNext] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dupWarn, setDupWarn] = useState(false);
  const reqRef = useRef(0);
  useEffect(() => {
    if (who !== "existing" || cq.trim().length < 2) return;
    const ctl = new AbortController();
    const id = window.setTimeout(() => {
      listCrmCustomers({ q: cq, limit: 6 }, ctl.signal).then((p) => setFound(p.items), (e) => !isAborted(e) && logApiError("crm.lead.customers", e));
    }, 220);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [cq, who]);
  const errs = {
    title: !title.trim() ? t("titleRequired") : "",
    who: who === "existing" && !customer ? t("pickCustomer") : who === "user" && !clientUserId.trim() ? t("userRequired") : who === "new" && !newName.trim() ? t("nameRequired") : "",
  };
  const submit = async (force = false) => {
    setTried(true);
    if (errs.title || errs.who || busy) return;
    setBusy(true);
    const n = ++reqRef.current;
    try {
      const lead = await createCrmLead({
        customerId: who === "existing" ? customer?.id : undefined,
        clientUserId: who === "user" ? clientUserId : undefined,
        customer: who === "new" ? { name: newName, contacts: newPhone.trim() ? [{ type: "phone", value: newPhone, primary: true }] : [] } : undefined,
        title,
        problem,
        category,
        region,
        urgency,
        source,
        language,
        nextActionAt: next ? new Date(next).toISOString() : "",
        forceCreate: force,
      });
      if (n !== reqRef.current) return;
      toast(lead.duplicateStatus === "needs_review" ? t("doneDup") : t("done"), { tone: lead.duplicateStatus === "needs_review" ? "info" : "ok" });
      onClose();
      router.push(`/admin/crm/leads/${encodeURIComponent(lead.id)}`);
    } catch (e) {
      if (/duplicate/.test(String((e as { code?: string })?.code ?? ""))) setDupWarn(true);
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy(false);
    }
  };
  const show = (k: keyof typeof errs) => (tried ? errs[k] : "");
  return (
    <Modal
      open
      onClose={onClose}
      variant="drawer"
      title={t("title")}
      description={t("lead")}
      busy={busy}
      dirty={!!(title || problem || newName)}
      footer={
        <>
          <button type="button" className="crm-btn" onClick={onClose}>
            {t("cancel")}
          </button>
          {dupWarn ? (
            <button type="button" className="crm-btn" onClick={() => void submit(true)} disabled={busy}>
              {t("forceCreate")}
            </button>
          ) : null}
          <button type="button" className="crm-btn crm-btn--pri" onClick={() => void submit(false)} aria-busy={busy || undefined} disabled={busy}>
            <IconCheck aria-hidden="true" />
            {t("create")}
          </button>
        </>
      }
    >
      <div className="crm-pop">
        <div className="crm-field">
          <span>{t("who")}</span>
          <div className="crm-seg" role="group" aria-label={t("who")}>
            {(["existing", "user", "new"] as const).map((w) => (
              <button key={w} type="button" aria-pressed={who === w} onClick={() => setWho(w)}>
                {t(`whoOpt.${w}`)}
              </button>
            ))}
          </div>
        </div>
        {who === "existing" ? (
          customer ? (
            <div className="crm-banner crm-banner--info">
              <IconUser aria-hidden="true" />
              <span>
                <b>{customer.name || customer.id}</b>
              </span>
              <button type="button" className="crm-link" onClick={() => setCustomer(null)}>
                {t("change")}
              </button>
            </div>
          ) : (
            <label className="crm-field" data-err={show("who") ? "" : undefined}>
              <span>{t("findCustomer")}</span>
              <input className="crm-input" value={cq} onChange={(e) => setCq(e.target.value)} placeholder={t("findPh")} />
              {show("who") ? <em>{show("who")}</em> : null}
              {found.length && cq.trim().length >= 2 ? (
                <div className="crm-slash" role="listbox" aria-label={t("findCustomer")}>
                  {found.map((c) => (
                    <button key={c.id} type="button" role="option" aria-selected={false} onClick={() => setCustomer({ id: c.id, name: c.name })}>
                      <b>{c.name || c.publicId}</b>
                      <small>{[c.publicId, c.phone, t("leadsN", { n: c.leadCount })].filter(Boolean).join(" · ")}</small>
                    </button>
                  ))}
                </div>
              ) : null}
            </label>
          )
        ) : who === "user" ? (
          <label className="crm-field" data-err={show("who") ? "" : undefined}>
            <span>{t("clientUserId")}</span>
            <input className="crm-input" value={clientUserId} onChange={(e) => setClientUserId(e.target.value)} />
            {show("who") ? <em>{show("who")}</em> : <small>{t("clientUserIdHelp")}</small>}
          </label>
        ) : (
          <div className="crm-row2">
            <label className="crm-field" data-err={show("who") ? "" : undefined}>
              <span>{t("newName")}</span>
              <input className="crm-input" value={newName} onChange={(e) => setNewName(e.target.value)} />
              {show("who") ? <em>{show("who")}</em> : null}
            </label>
            <label className="crm-field">
              <span>{t("newPhone")}</span>
              <input className="crm-input" inputMode="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+998" />
            </label>
          </div>
        )}
        <label className="crm-field" data-err={show("title") ? "" : undefined}>
          <span>{t("titleLabel")}</span>
          <input className="crm-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          {show("title") ? <em>{show("title")}</em> : null}
        </label>
        <label className="crm-field">
          <span>{t("problem")}</span>
          <textarea className="crm-textarea" value={problem} onChange={(e) => setProblem(e.target.value)} />
        </label>
        <div className="crm-row2">
          <label className="crm-field">
            <span>{t("category")}</span>
            <input className="crm-input" value={category} onChange={(e) => setCategory(e.target.value)} />
          </label>
          <label className="crm-field">
            <span>{t("region")}</span>
            <input className="crm-input" value={region} onChange={(e) => setRegion(e.target.value)} />
          </label>
        </div>
        <div className="crm-row2">
          <div className="crm-field">
            <span>{t("source")}</span>
            <CrmSelect value={source} onChange={setSource} label={t("source")} options={meta.sources.map((s) => ({ value: s, label: s }))} />
          </div>
          <div className="crm-field">
            <span>{t("urgency")}</span>
            <CrmSelect value={urgency} onChange={setUrgency} label={t("urgency")} options={["low", "normal", "high", "urgent"].map((u) => ({ value: u, label: t(`urg.${u}`) }))} />
          </div>
        </div>
        <div className="crm-row2">
          <div className="crm-field">
            <span>{t("language")}</span>
            <CrmSelect value={language} onChange={setLanguage} label={t("language")} options={meta.languages.map((l) => ({ value: l, label: tl.has(l) ? tl(l) : l }))} />
          </div>
          <div className="crm-field">
            <span>{t("next")}</span>
            <CrmDateTime value={next} onChange={setNext} label={t("next")} />
          </div>
        </div>
        {dupWarn ? (
          <div className="crm-banner crm-banner--warn">
            <IconAlert aria-hidden="true" />
            <span>{t("dupText")}</span>
          </div>
        ) : null}
        <p className="crm-sub">
          <Link href="/admin/crm/customers" className="crm-link">
            <IconUsers aria-hidden="true" style={{ width: 13, height: 13, verticalAlign: "-2px" }} /> {t("customersLink")}
          </Link>
        </p>
      </div>
    </Modal>
  );
}
