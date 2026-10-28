"use client";

import { useEffect, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { IconAlert, IconArrowRight, IconCheck, IconClose, IconLayers, IconUser, IconUserPlus } from "@/components/icons";
import { shortDateTime } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { toast } from "@/lib/toast";
import {
  addLeadWatcher,
  assignLead,
  changeLeadStatus,
  crmCode,
  getCrmCustomer,
  getCrmLead,
  listCrmOperators,
  lookupPackages,
  lookupSellers,
  lookupServices,
  prepareConversion,
  type ConvOption,
  resolveDuplicate,
  transferLead,
  updateCrmLead,
  type CrmLead,
  type CrmMeta,
  type CrmOperator,
} from "@/lib/services/crm";
import { Avatar, StatusPill, useCrmError } from "./bits";
import { CrmDateTime, CrmSelect } from "./fields";
import type { LeadWrite } from "./CrmLeadPage";
import { LookupPicker } from "./LookupPicker";

export const toLocalInput = (iso: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fromLocalInput = (v: string): string => (v ? new Date(v).toISOString() : "");
// The top of the hour `h` hours from now, for the quick chips.
export function inHours(h: number): string {
  const d = new Date(Date.now() + h * 3_600_000);
  d.setMinutes(0, 0, 0);
  return toLocalInput(d.toISOString());
}

function Foot({ onClose, onOk, busy, okText, danger = false, disabled = false }: { onClose: () => void; onOk: () => void; busy: boolean; okText: string; danger?: boolean; disabled?: boolean }): ReactElement {
  const t = useTranslations("crm.sheet");
  return (
    <>
      <button type="button" className="crm-btn" onClick={onClose} disabled={busy}>
        {t("cancel")}
      </button>
      <button type="button" className={`crm-btn ${danger ? "crm-btn--danger" : "crm-btn--pri"}`} onClick={onOk} disabled={busy || disabled} aria-busy={busy || undefined}>
        <IconCheck aria-hidden="true" />
        {okText}
      </button>
    </>
  );
}

// A move along the backend's transition map, with why. The next action is set
// from its own sheet; a move resends the lead's current one so it isn't cleared.
export function StatusSheet({ lead, to, write, onClose }: { lead: CrmLead; to: string; write: LeadWrite; onClose: () => void }): ReactElement {
  const t = useTranslations("crm.sheet");
  const ts = useTranslations("crm.status");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const closing = to === "closed";
  const [tried, setTried] = useState(false);
  const reasonErr = tried && closing && reason.trim().length < 3 ? t("reasonRequired") : "";
  const ok = async () => {
    setTried(true);
    if (busy || (closing && reason.trim().length < 3)) return;
    setBusy(true);
    const done = await write((l) => changeLeadStatus(l, to, reason, l.nextActionAt || null), t("moved", { status: ts.has(to) ? ts(to) : to }));
    setBusy(false);
    if (done) onClose();
  };
  return (
    <Modal open onClose={onClose} title={t("statusTitle", { status: ts.has(to) ? ts(to) : to })} busy={busy} dirty={!!reason} footer={<Foot onClose={onClose} onOk={() => void ok()} busy={busy} okText={t("move")} danger={closing} />}>
      <div className="crm-pop">
        <div className="crm-diff__pair" style={{ alignItems: "center" }}>
          <span style={{ textDecoration: "none" }}>
            <StatusPill status={lead.status} />
          </span>
          <IconArrowRight aria-hidden="true" />
          <span>
            <StatusPill status={to} />
          </span>
        </div>
        <label className="crm-field" data-err={reasonErr ? "" : undefined}>
          <span>{closing ? t("reasonClose") : t("reason")}</span>
          <textarea className="crm-textarea" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus maxLength={1000} />
          {reasonErr ? <em>{reasonErr}</em> : <small>{t("reasonHelp")}</small>}
        </label>
      </div>
    </Modal>
  );
}

export function NextActionSheet({ lead, write, onClose }: { lead: CrmLead; write: LeadWrite; onClose: () => void }): ReactElement {
  const t = useTranslations("crm.sheet");
  const [next, setNext] = useState(toLocalInput(lead.nextActionAt));
  const [busy, setBusy] = useState(false);
  const quick = (h: number) => setNext(inHours(h));
  const ok = async () => {
    setBusy(true);
    const done = await write((l) => updateCrmLead(l, { nextActionAt: fromLocalInput(next) || null }), t("nextSaved"));
    setBusy(false);
    if (done) onClose();
  };
  return (
    <Modal open onClose={onClose} title={t("nextTitle")} busy={busy} footer={<Foot onClose={onClose} onOk={() => void ok()} busy={busy} okText={t("save")} />}>
      <div className="crm-pop">
        <div className="crm-filters">
          {[1, 3, 24, 72].map((h) => (
            <button key={h} type="button" className="crm-chip" onClick={() => quick(h)}>
              {t("inH", { n: h })}
            </button>
          ))}
          <button type="button" className="crm-chip" onClick={() => setNext("")}>
            {t("clearNext")}
          </button>
        </div>
        <div className="crm-field">
          <span>{t("next")}</span>
          <CrmDateTime value={next} onChange={setNext} label={t("next")} />
        </div>
      </div>
    </Modal>
  );
}

export function EditSheet({ meta, lead, write, onClose }: { meta: CrmMeta; lead: CrmLead; write: LeadWrite; onClose: () => void }): ReactElement {
  const t = useTranslations("crm.sheet");
  const tl = useTranslations("crm.lang");
  const tsc = useTranslations("crm.score");
  const tn = useTranslations("crm.newLead");
  const [f, setF] = useState({ title: lead.title, problem: lead.problem, region: lead.region, urgency: lead.urgency || "normal", score: lead.score, language: lead.language });
  const [busy, setBusy] = useState(false);
  const ok = async () => {
    if (!f.title.trim()) return;
    setBusy(true);
    const done = await write((l) => updateCrmLead(l, f), t("saved"));
    setBusy(false);
    if (done) onClose();
  };
  const set = (k: keyof typeof f) => (v: string) => setF((cur) => ({ ...cur, [k]: v }));
  return (
    <Modal open onClose={onClose} variant="drawer" title={t("editTitle")} busy={busy} dirty footer={<Foot onClose={onClose} onOk={() => void ok()} busy={busy} okText={t("save")} disabled={!f.title.trim()} />}>
      <div className="crm-pop">
        <label className="crm-field">
          <span>{tn("titleLabel")}</span>
          <input className="crm-input" value={f.title} onChange={(e) => set("title")(e.target.value)} />
        </label>
        <label className="crm-field">
          <span>{tn("problem")}</span>
          <textarea className="crm-textarea" value={f.problem} onChange={(e) => set("problem")(e.target.value)} />
        </label>
        <div className="crm-row2">
          <label className="crm-field">
            <span>{tn("region")}</span>
            <input className="crm-input" value={f.region} onChange={(e) => set("region")(e.target.value)} />
          </label>
        </div>
        <div className="crm-row2">
          <div className="crm-field">
            <span>{tn("urgency")}</span>
            <CrmSelect value={f.urgency} onChange={set("urgency")} label={tn("urgency")} options={["low", "normal", "high", "urgent"].map((u) => ({ value: u, label: tn(`urg.${u}`) }))} />
          </div>
          <div className="crm-field">
            <span>{t("score")}</span>
            <CrmSelect value={f.score} onChange={set("score")} label={t("score")} options={meta.scores.map((s) => ({ value: s, label: tsc.has(s) ? tsc(s) : s }))} />
          </div>
        </div>
        <div className="crm-field">
          <span>{tn("language")}</span>
          <CrmSelect value={f.language} onChange={set("language")} label={tn("language")} options={meta.languages.map((l) => ({ value: l, label: tl.has(l) ? tl(l) : l }))} />
        </div>
      </div>
    </Modal>
  );
}

// Assign, or transfer — a transfer always says why (§12).
export function AssignSheet({ lead, mode, write, onClose }: { lead: CrmLead; mode: "assign" | "transfer"; write: LeadWrite; onClose: () => void }): ReactElement {
  const t = useTranslations("crm.sheet");
  const [ops, setOps] = useState<CrmOperator[] | null>(null);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState("");
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const ctl = new AbortController();
    const id = window.setTimeout(() => listCrmOperators(q, ctl.signal).then(setOps, (e) => !isAborted(e) && logApiError("crm.operators", e)), 200);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [q]);
  const need = mode === "transfer";
  const errs = { pick: !pick ? t("pickOperator") : "", reason: need && reason.trim().length < 3 ? t("transferReason") : "" };
  const ok = async () => {
    setTried(true);
    if (errs.pick || errs.reason || busy) return;
    setBusy(true);
    const done = await write((l) => (mode === "transfer" ? transferLead(l, pick, reason) : assignLead(l, pick, reason)), mode === "transfer" ? t("transferred") : t("assigned"));
    setBusy(false);
    if (done) onClose();
  };
  return (
    <Modal open onClose={onClose} title={mode === "transfer" ? t("transferTitle") : t("assignTitle")} busy={busy} dirty={!!reason} footer={<Foot onClose={onClose} onOk={() => void ok()} busy={busy} okText={mode === "transfer" ? t("transfer") : t("assign")} />}>
      <div className="crm-pop">
        <input className="crm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("findOperator")} aria-label={t("findOperator")} autoFocus />
        <div className="crm-slash" role="radiogroup" aria-label={t("operators")}>
          {ops === null ? (
            <span className="crm-sk" />
          ) : ops.length ? (
            ops
              .filter((o) => o.id !== lead.operatorId)
              .map((o) => (
                <button key={o.id} type="button" role="radio" aria-checked={pick === o.id} onClick={() => setPick(o.id)} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar name={o.name} />
                  <span style={{ display: "grid", gap: 2, flex: 1 }}>
                    <b>{o.name}</b>
                    <small>{t("activeN", { n: o.activeLeads })}</small>
                  </span>
                  {pick === o.id ? <IconCheck aria-hidden="true" style={{ width: 16, height: 16 }} /> : null}
                </button>
              ))
          ) : (
            <small className="crm-muted">{t("noOperators")}</small>
          )}
        </div>
        {tried && errs.pick ? <em className="crm-field" style={{ color: "var(--crm-bad)" }}>{errs.pick}</em> : null}
        <label className="crm-field" data-err={tried && errs.reason ? "" : undefined}>
          <span>{need ? t("reasonRequiredLabel") : t("reasonOptional")}</span>
          <textarea className="crm-textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("handoverPh")} />
          {tried && errs.reason ? <em>{errs.reason}</em> : null}
        </label>
      </div>
    </Modal>
  );
}

export function WatcherSheet({ lead, write, onClose }: { lead: CrmLead; write: LeadWrite; onClose: () => void }): ReactElement {
  const t = useTranslations("crm.sheet");
  const [ops, setOps] = useState<CrmOperator[]>([]);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    const ctl = new AbortController();
    listCrmOperators("", ctl.signal).then(setOps, (e) => !isAborted(e) && logApiError("crm.operators", e));
    return () => ctl.abort();
  }, []);
  const watching = new Set(lead.watchers.map((w) => w.id));
  const add = async (id: string) => {
    setBusy(id);
    await write(() => addLeadWatcher(lead.id, id), t("watcherAdded"));
    setBusy("");
  };
  return (
    <Modal open onClose={onClose} title={t("watchersTitle")}>
      <div className="crm-pop">
        <div className="crm-slash">
          {ops
            .filter((o) => !watching.has(o.id))
            .map((o) => (
              <button key={o.id} type="button" onClick={() => void add(o.id)} disabled={!!busy} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar name={o.name} />
                <b style={{ flex: 1 }}>{o.name}</b>
                <IconUserPlus aria-hidden="true" style={{ width: 16, height: 16 }} />
              </button>
            ))}
        </div>
      </div>
    </Modal>
  );
}

// Duplicate review: side by side, then the operator decides (§4.7).
export function DuplicateSheet({ lead, write, onClose }: { lead: CrmLead; write: LeadWrite; onClose: () => void }): ReactElement {
  const t = useTranslations("crm.dup");
  const tsrc = useTranslations("crm.source");
  const locale = useLocale();
  const [others, setOthers] = useState<CrmLead[] | null>(null);
  const [other, setOther] = useState<CrmLead | null>(null);
  const [decision, setDecision] = useState<"not_duplicate" | "duplicate">("not_duplicate");
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const ctl = new AbortController();
    (async () => {
      try {
        if (lead.duplicateOfId) {
          const o = await getCrmLead(lead.duplicateOfId, ctl.signal);
          setOther(o);
          setOthers([o]);
        } else if (lead.customerId) {
          const c = await getCrmCustomer(lead.customerId, ctl.signal);
          const list = c.leads.filter((l) => l.id !== lead.id);
          setOthers(list);
          setOther(list[0] ?? null);
        } else setOthers([]);
      } catch (e) {
        if (!isAborted(e)) logApiError("crm.dup", e);
        setOthers([]);
      }
    })();
    return () => ctl.abort();
  }, [lead.duplicateOfId, lead.customerId, lead.id]);
  const rows: [string, (l: CrmLead) => string][] = [
    ["title", (l) => l.title],
    ["region", (l) => l.region],
    ["source", (l) => (l.source ? (tsrc.has(l.source) ? tsrc(l.source) : tsrc("other")) : "")],
    ["region", (l) => l.region],
    ["status", (l) => l.status],
    ["created", (l) => (l.createdAt ? shortDateTime(l.createdAt, locale) : "")],
    ["problem", (l) => l.problem],
  ];
  const errs = { reason: reason.trim().length < 3 ? t("reasonRequired") : "", target: decision === "duplicate" && !other ? t("pickTarget") : "" };
  const ok = async () => {
    setTried(true);
    if (errs.reason || errs.target || busy) return;
    setBusy(true);
    const done = await write(() => resolveDuplicate(lead.id, decision, reason, other?.id ?? ""), decision === "duplicate" ? t("markedDup") : t("markedNot"));
    setBusy(false);
    if (done) onClose();
  };
  const side = (l: CrmLead, mark?: "keep" | "drop") => (
    <div className="crm-compare__side" data-keep={mark === "keep" || undefined} data-drop={mark === "drop" || undefined}>
      <b>{l.title || l.workId}</b>
      <span className="crm-code">{l.workId}</span>
      <dl>
        {rows.map(([k, get]) => (
          <div key={k} data-diff={other && get(lead) !== get(other) ? "" : undefined}>
            <dt>{t(`f.${k}`)}</dt>
            <dd>{get(l) || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
  return (
    <Modal open onClose={onClose} title={t("title")} description={t("lead")} size="lg" busy={busy} dirty={!!reason} footer={<Foot onClose={onClose} onOk={() => void ok()} busy={busy} okText={t("decide")} />}>
      <div className="crm-pop">
        {others === null ? (
          <span className="crm-sk crm-sk--block" />
        ) : (
          <>
            {others.length > 1 ? (
              <CrmSelect value={other?.id ?? ""} onChange={(v) => setOther(others.find((o) => o.id === v) ?? null)} label={t("compareWith")} options={others.map((o) => ({ value: o.id, label: `${o.workId} · ${o.title}` }))} />
            ) : null}
            <div className="crm-compare">
              {side(lead, decision === "duplicate" ? "drop" : undefined)}
              <IconArrowRight aria-hidden="true" />
              {other ? side(other, decision === "duplicate" ? "keep" : undefined) : <div className="crm-compare__side crm-muted">{t("nothingToCompare")}</div>}
            </div>
          </>
        )}
        <div className="crm-seg" role="group" aria-label={t("decision")}>
          <button type="button" aria-pressed={decision === "not_duplicate"} onClick={() => setDecision("not_duplicate")}>
            {t("not")}
          </button>
          <button type="button" aria-pressed={decision === "duplicate"} onClick={() => setDecision("duplicate")} disabled={!other}>
            {t("is")}
          </button>
        </div>
        <label className="crm-field" data-err={tried && errs.reason ? "" : undefined}>
          <span>{t("reason")}</span>
          <textarea className="crm-textarea" value={reason} onChange={(e) => setReason(e.target.value)} />
          {tried && (errs.reason || errs.target) ? <em>{errs.reason || errs.target}</em> : <small>{t("safe")}</small>}
        </label>
      </div>
    </Modal>
  );
}

// An operator draft order: reviewed first, unpaid, nothing sent (§4.9).
export function ConversionSheet({ lead, onClose, onDone }: { lead: CrmLead; onClose: () => void; onDone: () => void }): ReactElement {
  const t = useTranslations("crm.conv");
  const crmErr = useCrmError();
  const [step, setStep] = useState<"form" | "review" | "done">("form");
  const [service, setService] = useState<ConvOption | null>(null);
  const [pkg, setPkg] = useState<ConvOption | null>(null);
  const [seller, setSeller] = useState<ConvOption | null>(null);
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [needAccount, setNeedAccount] = useState(false);
  const [linkHelp, setLinkHelp] = useState("");
  const [orderId, setOrderId] = useState("");
  const amount = price ? Math.round(Number(price.replace(/\D/g, ""))) : null;
  const ok = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await prepareConversion(lead.id, { serviceId: service?.id, packageId: pkg?.id, sellerUserId: seller?.id, price: amount, note });
      // The answer is the updated lead with converted_order { work_id, … }
      // (gaps closed §20): its code is shown, never converted_order_id.
      const o = (r.converted_order ?? {}) as { work_id?: unknown };
      setOrderId(typeof o.work_id === "string" ? o.work_id : "");
      setStep("done");
      onDone();
    } catch (e) {
      if (crmCode(e) === "crm_customer_account_required") {
        setNeedAccount(true);
        // The backend's own instruction for this customer, when it has one.
        if (lead.customer?.id) void getCrmCustomer(lead.customer.id).then((c) => setLinkHelp(c.linking.requiredAction), () => undefined);
      }
      else toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy(false);
    }
  };
  const foot =
    step === "form" ? (
      <Foot onClose={onClose} onOk={() => setStep("review")} busy={false} okText={t("review")} />
    ) : step === "review" ? (
      <>
        <button type="button" className="crm-btn" onClick={() => setStep("form")} disabled={busy}>
          {t("back")}
        </button>
        <button type="button" className="crm-btn crm-btn--pri" onClick={() => void ok()} disabled={busy || needAccount} aria-busy={busy || undefined}>
          <IconCheck aria-hidden="true" />
          {t("create")}
        </button>
      </>
    ) : (
      <button type="button" className="crm-btn crm-btn--pri" onClick={onClose}>
        {t("close")}
      </button>
    );
  return (
    <Modal open onClose={onClose} title={t("title")} description={t("lead")} busy={busy} footer={foot}>
      <div className="crm-pop">
        {step === "form" ? (
          <>
            <div className="crm-field">
              <span id="crm-conv-svc">{t("service")}</span>
              <LookupPicker<ConvOption>
                value={service}
                onChange={(v) => {
                  setService(v);
                  // The seller is picked among those offering this service.
                  if (v?.id !== service?.id) {
                    setSeller(null);
                    setPkg(null);
                  }
                }}
                load={(q, offset, signal) => lookupServices(q, offset, signal)}
                title={(o) => o.title}
                sub={(o) => o.sub}
                text={{ placeholder: t("pickService"), search: t("findService"), searchPh: t("findService"), empty: t("noService") }}
                action={service ? { label: t("clear"), icon: <IconClose aria-hidden="true" />, run: () => (setService(null), setSeller(null), setPkg(null)) } : undefined}
                labelId="crm-conv-svc"
              />
            </div>
            <div className="crm-row2">
              <div className="crm-field">
                <span id="crm-conv-seller">{t("seller")}</span>
                <LookupPicker<ConvOption>
                  key={service?.id ?? ""}
                  value={seller}
                  onChange={setSeller}
                  load={(q, offset, signal) => lookupSellers(service?.id ?? "", q, offset, signal)}
                  title={(o) => o.title}
                  sub={(o) => o.sub}
                  icon={<IconUser aria-hidden="true" />}
                  text={{ placeholder: t("pickSeller"), search: t("findSeller"), searchPh: t("findSeller"), empty: t("noSeller") }}
                  action={seller ? { label: t("clear"), icon: <IconClose aria-hidden="true" />, run: () => setSeller(null) } : undefined}
                  labelId="crm-conv-seller"
                />
                <small>{service ? t("sellerHelp") : t("sellerAny")}</small>
              </div>
              <div className="crm-field">
                <span id="crm-conv-pkg">{t("package")}</span>
                <LookupPicker<ConvOption>
                  value={pkg}
                  onChange={setPkg}
                  key={`pkg-${service?.id ?? ""}`}
                  load={(q, _offset, signal) => lookupPackages(service?.id ?? "", q, signal)}
                  title={(o) => o.title}
                  sub={(o) => o.sub}
                  icon={<IconLayers aria-hidden="true" />}
                  text={{ placeholder: t("pickPackage"), search: t("findPackage"), searchPh: t("findPackage"), empty: t("noPackage") }}
                  action={pkg ? { label: t("clear"), icon: <IconClose aria-hidden="true" />, run: () => setPkg(null) } : undefined}
                  labelId="crm-conv-pkg"
                />
              </div>
            </div>
            <div className="crm-row2">
              <label className="crm-field">
                <span>{t("price")}</span>
                <input className="crm-input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="100 000" />
              </label>
            </div>
            <label className="crm-field">
              <span>{t("note")}</span>
              <textarea className="crm-textarea" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </>
        ) : (
          <div className="crm-draft" data-mark={t("mark")}>
            <span className="crm-draft__price">{amount !== null ? `${fmtUzs(amount)} ${t("som")}` : t("priceLater")}</span>
            <dl>
              <div>
                <dt>{t("customer")}</dt>
                <dd>{lead.customer?.name || "—"}</dd>
              </div>
              <div>
                <dt>{t("service")}</dt>
                <dd>{service?.title || "—"}</dd>
              </div>
              <div>
                <dt>{t("package")}</dt>
                <dd>{pkg?.title || "—"}</dd>
              </div>
              <div>
                <dt>{t("seller")}</dt>
                <dd>{seller?.title || "—"}</dd>
              </div>
            </dl>
            <p className="crm-sub">{step === "done" ? (orderId ? t("doneText", { id: orderId }) : t("doneNoCode")) : t("reviewText")}</p>
          </div>
        )}
        {needAccount ? (
          <div className="crm-banner crm-banner--warn" role="alert">
            <IconAlert aria-hidden="true" />
            <span>
              <b>{t("needAccount")}</b>
              {linkHelp || t("needAccountText")}
            </span>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
