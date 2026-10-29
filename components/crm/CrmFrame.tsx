"use client";

import "./crm.css";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { useRouter } from "@/i18n/navigation";
import { IconAlert, IconCheck, IconDownload, IconLayers, IconLock, IconPlus, IconRefresh, IconSearch, IconUser } from "@/components/icons";
import { saveBlob } from "@/lib/download";
import { isAborted, logApiError } from "@/lib/http";
import { notify, toast } from "@/lib/toast";
import {
  createCrmLead,
  crmCan,
  downloadCrmExport,
  isCrmDenied,
  listCrmCustomers,
  listCrmLeads,
  type CrmCustomer,
  type CrmLead,
  type CrmMeta,
  type CustomerOption,
} from "@/lib/services/crm";
import { dismissCrmExport, loadCrmMeta, refreshCrmExport, useCrmEvents, useCrmExports, useCrmMeta } from "@/lib/crm/useCrm";
import { CrmTop, Empty, SkeletonRows, statusColorVars, useCrmError, type CrmBack } from "./bits";
import { CustomerPicker, NewCustomerModal, optionOfCustomer } from "./CustomerPicker";
import { CrmDateTime, CrmSelect } from "./fields";
import { sectionOk, type CrmSectionKey } from "./sections";
import { ExportForm } from "./CrmExports";

type Sheet = "" | "lead" | "customer" | "export";
export type CrmApi = { meta: CrmMeta; open: (s: Exclude<Sheet, "">, preset?: { customerId?: string; customerName?: string }) => void };

// Every CRM page: the meta gate, the header, the ⌘K palette, the create
// sheets and the export tray. `children` gets the meta and the openers.
// `section`: the page's CRM section; without its permission the page shows
// only a "no access" state (contract 13cb257 §20).
export default function CrmFrame({ title, tools, back, section, noTray, children }: { title?: string; tools?: (api: CrmApi) => ReactNode; back?: CrmBack; section?: CrmSectionKey; noTray?: boolean; children: (api: CrmApi) => ReactNode }): ReactElement {
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
  const allowed = !section || sectionOk(section, api.meta);
  return (
    <div className="crm" style={statusColorVars(api.meta)}>
      <MetaSync />
      <CrmNotifier />
      <CrmTop meta={api.meta} title={title ?? t("title")} onPalette={openPalette} tools={allowed ? tools?.(api) : null} back={back} />
      {allowed ? (
        children(api)
      ) : (
        <div className="crm-card" data-denied="">
          <Empty icon={<IconLock />} title={t("denied")} text={t("sectionDenied")} />
        </div>
      )}
      {noTray ? null : <ExportTray />}
      {palette ? <Palette api={api} onClose={() => setPalette(false)} /> : null}
      {sheet === "lead" ? <LeadSheet meta={api.meta} preset={preset} onClose={() => setSheet("")} /> : null}
      {sheet === "customer" ? <CustomerSheet meta={api.meta} onClose={() => setSheet("")} /> : null}
      {sheet === "export" ? <ExportSheet meta={api.meta} onClose={() => setSheet("")} /> : null}
    </div>
  );
}

// Columns changed on another screen (or the socket reconnected): the meta
// holds the columns, so it is read again (dynamic kanban contract §realtime).
function MetaSync(): null {
  useCrmEvents((ev) => {
    if (ev.invalidate.includes("meta") || ev.invalidate.includes("all")) void loadCrmMeta(true);
  });
  return null;
}

// §21: an actionable CRM event pops an animated top-right card that opens
// the right page. The same event arriving twice (its own name and inside
// notification.created) shows once.
const NOTIFY: Record<string, "info" | "warning" | "success" | "error"> = {
  "crm.lead.created": "info",
  "crm.lead.reopened": "info",
  "crm.lead.assigned": "info",
  "crm.lead.transferred": "info",
  "crm.lead.watcher_added": "info",
  "crm.lead.next_action_due": "warning",
  "crm.lead.payment_confirmed": "success",
  "crm.ai.completed": "success",
  "crm.ai.failed": "error",
  "crm.call.completed": "info",
  "crm.automation.notification": "info",
  "crm.automation.escalated": "warning",
  "crm.export.ready": "success",
};
export function crmEventRoute(ev: { name: string; leadId: string; customerId: string }): string {
  if (ev.name === "crm.export.ready") return "/admin/crm/exports";
  if (ev.leadId) return `/admin/crm/leads/${encodeURIComponent(ev.leadId)}`;
  if (ev.customerId) return `/admin/crm/customers/${encodeURIComponent(ev.customerId)}`;
  return "/admin/crm/leads";
}
function CrmNotifier(): null {
  const t = useTranslations("crm.notify");
  const seen = useRef(new Map<string, number>());
  useCrmEvents((ev) => {
    const tone = NOTIFY[ev.name];
    if (!tone) return;
    const key = `${ev.name}:${ev.leadId || ev.runId || ev.exportId || ev.callId}`;
    const now = Date.now();
    if ((seen.current.get(key) ?? 0) > now - 4000) return;
    seen.current.set(key, now);
    const short = ev.name.replace(/^crm\./, "").replace(/\./g, "_");
    notify[tone](ev.title || t(`ev.${short}`), { body: ev.body || undefined, action: { label: t("open"), href: crmEventRoute(ev) }, duration: 7000 });
  });
  return null;
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
  return (
    <Modal open onClose={onClose} title={t("title")} description={t("lead")}>
      <ExportForm meta={meta} onCreated={onClose} />
    </Modal>
  );
}

// ── Create a customer ──
function CustomerSheet({ meta, onClose }: { meta: CrmMeta; onClose: () => void }): ReactElement {
  const router = useRouter();
  return (
    <NewCustomerModal
      meta={meta}
      onClose={onClose}
      onCreated={(c) => {
        onClose();
        router.push(`/admin/crm/customers/${encodeURIComponent(c.id)}`);
      }}
    />
  );
}

// ── Create a lead (contract 2026-10-27 §6–8): exactly one customer, from
// the searchable select; a new customer is made above this form, which
// stays open with everything typed, and comes back selected. The region
// starts from the customer; changing it updates the customer too.
function LeadSheet({ meta, preset, onClose }: { meta: CrmMeta; preset: { customerId?: string; customerName?: string }; onClose: () => void }): ReactElement {
  const t = useTranslations("crm.newLead");
  const tl = useTranslations("crm.lang");
  const tsrc = useTranslations("crm.source");
  const crmErr = useCrmError();
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerOption | null>(preset.customerId ? { id: preset.customerId, publicId: "", name: preset.customerName ?? "", region: "", phone: "", isLexgoUser: false, lexgoLabel: "", leadCount: 0, label: preset.customerName ?? "" } : null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState("");
  const [region, setRegion] = useState("");
  const [regionTouched, setRegionTouched] = useState(false);
  const [urgency, setUrgency] = useState("normal");
  const [source, setSource] = useState(meta.sources.includes("phone") ? "phone" : meta.sources[0] || "manual");
  const [language, setLanguage] = useState(meta.languages[0] || "uz_latn");
  const [next, setNext] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dupWarn, setDupWarn] = useState(false);
  const reqRef = useRef(0);
  const titleRef = useRef<HTMLInputElement>(null);
  const pickCustomer = (c: CustomerOption | null) => {
    setCustomer(c);
    // The region follows the customer until the operator changes it.
    if (c && !regionTouched) setRegion(c.region);
  };
  const errs = { who: !customer ? t("pickCustomer") : "", title: !title.trim() ? t("titleRequired") : "" };
  const submit = async (force = false) => {
    setTried(true);
    if (errs.who || errs.title || busy || !customer) {
      if (!errs.who && errs.title) titleRef.current?.focus();
      return;
    }
    setBusy(true);
    const n = ++reqRef.current;
    try {
      const lead = await createCrmLead({
        customerId: customer.id,
        title,
        problem,
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
    <>
      <Modal
        open
        onClose={onClose}
        variant="drawer"
        title={t("title")}
        description={t("lead")}
        busy={busy}
        dirty={!!(title || problem || customer)}
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
            <button type="button" className="crm-btn crm-btn--pri" onClick={() => void submit(false)} aria-busy={busy || undefined} disabled={busy || creating || !customer || !title.trim()}>
              <IconCheck aria-hidden="true" />
              {t("create")}
            </button>
          </>
        }
      >
        <div className="crm-pop">
          <div className="crm-field" data-err={show("who") ? "" : undefined}>
            <span id="crm-lead-cust">{t("customer")}</span>
            <CustomerPicker value={customer} onChange={pickCustomer} onNew={() => setCreating(true)} invalid={!!show("who")} labelId="crm-lead-cust" />
            {show("who") ? <em>{show("who")}</em> : <small>{t("customerHelp")}</small>}
          </div>
          <label className="crm-field" data-err={show("title") ? "" : undefined}>
            <span>{t("titleLabel")}</span>
            <input ref={titleRef} className="crm-input" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!show("title")} />
            {show("title") ? <em>{show("title")}</em> : null}
          </label>
          <label className="crm-field">
            <span>{t("problem")}</span>
            <textarea className="crm-textarea" value={problem} onChange={(e) => setProblem(e.target.value)} />
          </label>
          <div className="crm-row2">
            <label className="crm-field">
              <span>{t("region")}</span>
              <input
                className="crm-input"
                value={region}
                onChange={(e) => {
                  setRegion(e.target.value);
                  setRegionTouched(true);
                }}
              />
              <small>{customer && regionTouched && region.trim() && region.trim() !== customer.region ? t("regionOverride") : t("regionFromCustomer")}</small>
            </label>
            <div className="crm-field">
              <span>{t("source")}</span>
              <CrmSelect value={source} onChange={setSource} label={t("source")} options={meta.sources.map((s) => ({ value: s, label: tsrc.has(s) ? tsrc(s) : tsrc("other") }))} />
            </div>
          </div>
          <div className="crm-row2">
            <div className="crm-field">
              <span>{t("urgency")}</span>
              <CrmSelect value={urgency} onChange={setUrgency} label={t("urgency")} options={["low", "normal", "high", "urgent"].map((u) => ({ value: u, label: t(`urg.${u}`) }))} />
            </div>
            <div className="crm-field">
              <span>{t("language")}</span>
              <CrmSelect value={language} onChange={setLanguage} label={t("language")} options={meta.languages.map((l) => ({ value: l, label: tl.has(l) ? tl(l) : l }))} />
            </div>
          </div>
          <div className="crm-field">
            <span>{t("next")}</span>
            <CrmDateTime value={next} onChange={setNext} label={t("next")} />
          </div>
          {dupWarn ? (
            <div className="crm-banner crm-banner--warn">
              <IconAlert aria-hidden="true" />
              <span>{t("dupText")}</span>
            </div>
          ) : null}
        </div>
      </Modal>
      {creating ? (
        <NewCustomerModal
          meta={meta}
          nested
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setCreating(false);
            pickCustomer(optionOfCustomer(c));
            if (!regionTouched) setRegion(c.region);
          }}
        />
      ) : null}
    </>
  );
}
