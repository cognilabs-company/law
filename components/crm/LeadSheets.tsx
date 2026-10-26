"use client";

import { useEffect, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { IconAlert, IconArrowRight, IconCheck, IconUserPlus } from "@/components/icons";
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
  prepareConversion,
  resolveDuplicate,
  transferLead,
  updateCrmLead,
  type CrmLead,
  type CrmMeta,
  type CrmOperator,
} from "@/lib/services/crm";
import { Avatar, StatusPill, useCrmError } from "./bits";
import type { LeadWrite } from "./CrmLeadPage";

const toLocalInput = (iso: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (v: string): string => (v ? new Date(v).toISOString() : "");
// The top of the hour `h` hours from now, for the quick chips.
function inHours(h: number): string {
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

// A move along the backend's transition map, with why and what's next.
export function StatusSheet({ lead, to, write, onClose }: { lead: CrmLead; to: string; write: LeadWrite; onClose: () => void }): ReactElement {
  const t = useTranslations("crm.sheet");
  const ts = useTranslations("crm.status");
  const [reason, setReason] = useState("");
  const [next, setNext] = useState(toLocalInput(lead.nextActionAt));
  const [busy, setBusy] = useState(false);
  const closing = to === "closed";
  const [tried, setTried] = useState(false);
  const reasonErr = tried && closing && reason.trim().length < 3 ? t("reasonRequired") : "";
  const ok = async () => {
    setTried(true);
    if (busy || (closing && reason.trim().length < 3)) return;
    setBusy(true);
    const done = await write((l) => changeLeadStatus(l, to, reason, fromLocalInput(next) || null), t("moved", { status: ts.has(to) ? ts(to) : to }));
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
        {to !== "closed" && to !== "won" ? (
          <label className="crm-field">
            <span>{t("next")}</span>
            <input className="crm-input" type="datetime-local" value={next} onChange={(e) => setNext(e.target.value)} />
          </label>
        ) : null}
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
        <label className="crm-field">
          <span>{t("next")}</span>
          <input className="crm-input" type="datetime-local" value={next} onChange={(e) => setNext(e.target.value)} autoFocus />
        </label>
      </div>
    </Modal>
  );
}

export function EditSheet({ meta, lead, write, onClose }: { meta: CrmMeta; lead: CrmLead; write: LeadWrite; onClose: () => void }): ReactElement {
  const t = useTranslations("crm.sheet");
  const tl = useTranslations("crm.lang");
  const tsc = useTranslations("crm.score");
  const tn = useTranslations("crm.newLead");
  const [f, setF] = useState({ title: lead.title, problem: lead.problem, category: lead.category, region: lead.region, urgency: lead.urgency || "normal", score: lead.score, language: lead.language });
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
            <span>{tn("category")}</span>
            <input className="crm-input" value={f.category} onChange={(e) => set("category")(e.target.value)} />
          </label>
          <label className="crm-field">
            <span>{tn("region")}</span>
            <input className="crm-input" value={f.region} onChange={(e) => set("region")(e.target.value)} />
          </label>
        </div>
        <div className="crm-row2">
          <label className="crm-field">
            <span>{tn("urgency")}</span>
            <select className="crm-select" value={f.urgency} onChange={(e) => set("urgency")(e.target.value)}>
              {["low", "normal", "high", "urgent"].map((u) => (
                <option key={u} value={u}>
                  {tn(`urg.${u}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="crm-field">
            <span>{t("score")}</span>
            <select className="crm-select" value={f.score} onChange={(e) => set("score")(e.target.value)}>
              {meta.scores.map((s) => (
                <option key={s} value={s}>
                  {tsc.has(s) ? tsc(s) : s}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="crm-field">
          <span>{tn("language")}</span>
          <select className="crm-select" value={f.language} onChange={(e) => set("language")(e.target.value)}>
            {meta.languages.map((l) => (
              <option key={l} value={l}>
                {tl.has(l) ? tl(l) : l}
              </option>
            ))}
          </select>
        </label>
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
    ["category", (l) => l.category],
    ["source", (l) => l.source],
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
              <select className="crm-select" value={other?.id ?? ""} onChange={(e) => setOther(others.find((o) => o.id === e.target.value) ?? null)} aria-label={t("compareWith")}>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.workId} · {o.title}
                  </option>
                ))}
              </select>
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
  const [serviceId, setServiceId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [needAccount, setNeedAccount] = useState(false);
  const [orderId, setOrderId] = useState("");
  const amount = price ? Math.round(Number(price.replace(/\D/g, ""))) : null;
  const ok = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await prepareConversion(lead.id, { serviceId, packageId, sellerUserId: sellerId, price: amount, note });
      setOrderId(String((r.order as { id?: unknown } | undefined)?.id ?? r.order_id ?? r.converted_order_id ?? ""));
      setStep("done");
      onDone();
    } catch (e) {
      if (crmCode(e) === "crm_customer_account_required") setNeedAccount(true);
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
            <div className="crm-row2">
              <label className="crm-field">
                <span>{t("service")}</span>
                <input className="crm-input" value={serviceId} onChange={(e) => setServiceId(e.target.value)} placeholder="uuid" />
              </label>
              <label className="crm-field">
                <span>{t("package")}</span>
                <input className="crm-input" value={packageId} onChange={(e) => setPackageId(e.target.value)} placeholder="uuid" />
              </label>
            </div>
            <div className="crm-row2">
              <label className="crm-field">
                <span>{t("seller")}</span>
                <input className="crm-input" value={sellerId} onChange={(e) => setSellerId(e.target.value)} placeholder="uuid" />
              </label>
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
                <dd>{serviceId || "—"}</dd>
              </div>
              <div>
                <dt>{t("package")}</dt>
                <dd>{packageId || "—"}</dd>
              </div>
              <div>
                <dt>{t("seller")}</dt>
                <dd>{sellerId || "—"}</dd>
              </div>
            </dl>
            <p className="crm-sub">{step === "done" ? t("doneText", { id: orderId || "—" }) : t("reviewText")}</p>
          </div>
        )}
        {needAccount ? (
          <div className="crm-banner crm-banner--warn" role="alert">
            <IconAlert aria-hidden="true" />
            <span>
              <b>{t("needAccount")}</b>
              {t("needAccountText")}
            </span>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
