"use client";

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Check, ClipboardCheck, MessageSquareText, ShieldAlert, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { fmtDateTime } from "@/lib/date";
import { ApiError, isAborted, logApiError, type Dict } from "@/lib/http";
import { notify, toast } from "@/lib/toast";
import { decideApprovalDraft, listApprovalDrafts, type ApprovalDraft } from "@/lib/services/crmAutomation";
import { useCrmEvents } from "@/lib/crm/useCrm";
import Modal from "@/components/admin/Modal";
import CrmFrame from "../CrmFrame";
import { useCrmError } from "../bits";
import { Readable, actionLabel, usePayloadLabel, statusTone, useCatalog, useRunStatus } from "./shared";

// Approval drafts (ROP contract §18): what a robot prepared for a client
// (SMS, Telegram, e-mail, offer…) waits here. The reviewer reads it, edits
// the text where the draft allows, and approves or rejects with a reason.

const TABS = ["pending_approval", "approved", "rejected"] as const;

export default function ApprovalDrafts(): ReactElement {
  const t = useTranslations("rop");
  return (
    <CrmFrame section="drafts" title={t("nav.drafts")} noTray>
      {() => <Drafts />}
    </CrmFrame>
  );
}

function Drafts(): ReactElement {
  const t = useTranslations("rop.drafts");
  const locale = useLocale();
  const crmErr = useCrmError();
  const params = useSearchParams();
  const st = useRunStatus();
  const { data: catalog } = useCatalog();
  const [tab, setTab] = useState<(typeof TABS)[number]>("pending_approval");
  const [rows, setRows] = useState<ApprovalDraft[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<ApprovalDraft | null>(null);
  const [tick, setTick] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const leadId = params.get("lead") ?? "";

  useEffect(() => {
    const ctl = new AbortController();
    listApprovalDrafts({ status: tab, leadId: leadId || undefined }, ctl.signal).then(
      (r) => {
        setRows(r.items);
        setErr("");
      },
      (e) => {
        if (isAborted(e)) return;
        logApiError("crm.drafts", e);
        setErr(crmErr(e));
        setRows((cur) => cur ?? []);
      },
    );
    return () => ctl.abort();
  }, [tab, leadId, tick, crmErr]);
  useCrmEvents((ev) => {
    if (!ev.invalidate.some((x) => x === "all" || x === "automation")) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTick((n) => n + 1), 700);
  });

  return (
    <div className="rop-page" data-rop-drafts="">
      <div className="rop-toolbar">
        <span className="rop-seg" role="tablist" aria-label={t("tabs")}>
          {TABS.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setRows(null); }}>
              {st(k)}
            </button>
          ))}
        </span>
        {leadId ? <Link href="/admin/crm/automation/drafts" className="crm-btn">{t("allLeads")}</Link> : null}
      </div>
      <section className="rop-card">
        <p className="rop-muted"><ShieldAlert aria-hidden="true" style={{ width: 15, height: 15, verticalAlign: "-3px", marginRight: 6 }} />{t("lead")}</p>
        {err ? <p className="rop-pill rop-pill--bad">{err}</p> : null}
        {!rows ? (
          <div className="rop-list" aria-hidden="true">{Array.from({ length: 4 }, (_, i) => <span key={i} className="rop-sk" />)}</div>
        ) : !rows.length ? (
          <div className="rop-empty"><span className="rop-empty__ic"><ClipboardCheck /></span><b>{tab === "pending_approval" ? t("emptyPending") : t("empty")}</b></div>
        ) : (
          <ul className="rop-list">
            {rows.map((d) => (
              <li key={d.id}>
                <button type="button" className="rop-row" onClick={() => setOpen(d)} data-draft={d.id}>
                  <span className="rop-ic"><MessageSquareText /></span>
                  <span className="rop-row__b">
                    <b>{d.title || actionLabel(catalog, d.type)}</b>
                    <small>{[d.customerName, d.leadWorkId || d.leadTitle, d.ruleName, d.createdAt ? fmtDateTime(d.createdAt, locale) : ""].filter(Boolean).join(" · ")}</small>
                  </span>
                  <span className={`rop-pill${statusTone(d.status) ? ` rop-pill--${statusTone(d.status)}` : ""}`}>{st(d.status)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {open ? (
        <DraftDialog
          d={open}
          label={actionLabel(catalog, open.type)}
          onClose={() => setOpen(null)}
          onDone={(next) => {
            setRows((cur) => (cur ?? []).filter((x) => x.id !== next.id));
            setOpen(null);
            setTick((n) => n + 1);
          }}
        />
      ) : null}
    </div>
  );
}

// The texts a reviewer may change: the fields the draft names as editable,
// else every top-level text field when the draft says it can be edited.
function editableKeys(d: ApprovalDraft): string[] {
  if (!d.editable) return [];
  if (d.editableFields.length) return d.editableFields.filter((k) => typeof d.payload[k] === "string" || d.payload[k] === undefined);
  return Object.entries(d.payload)
    .filter(([k, v]) => typeof v === "string" && !/(^|_)(id|ids|url|status|type|channel|language)$/.test(k))
    .map(([k]) => k);
}

function DraftDialog({ d, label, onClose, onDone }: { d: ApprovalDraft; label: string; onClose: () => void; onDone: (d: ApprovalDraft) => void }): ReactElement {
  const t = useTranslations("rop.drafts");
  const pl = usePayloadLabel();
  const locale = useLocale();
  const crmErr = useCrmError();
  const keys = useMemo(() => editableKeys(d), [d]);
  const [edits, setEdits] = useState<Dict>(() => Object.fromEntries(keys.map((k) => [k, String(d.payload[k] ?? "")])));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"" | "approve" | "reject">("");
  const pending = d.status === "pending_approval" || d.status === "pending";
  const changed = keys.some((k) => edits[k] !== String(d.payload[k] ?? ""));
  const rest = Object.fromEntries(Object.entries(d.payload).filter(([k]) => !keys.includes(k)));
  const decide = async (decision: "approve" | "reject") => {
    if (busy) return;
    if (decision === "reject" && !reason.trim()) {
      toast(t("needReason"), { tone: "info" });
      return;
    }
    setBusy(decision);
    try {
      const next = await decideApprovalDraft(d.id, decision, reason, decision === "approve" && changed ? { ...d.payload, ...edits } : null);
      notify.success(t(decision === "approve" ? "approved" : "rejected"));
      onDone(next.id ? next : { ...d, status: decision === "approve" ? "approved" : "rejected" });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      toast(crmErr(e), { tone: code ? "info" : "err" });
      if (code === "crm_automation_draft_not_found") onDone(d);
    } finally {
      setBusy("");
    }
  };
  return (
    <Modal open onClose={onClose} title={d.title || label} wide>
      <div className="rop-form" data-rb-draft={d.id}>
        <dl className="rop-kv">
          <dt>{t("kind")}</dt>
          <dd>{label}</dd>
          {d.customerName ? (<><dt>{t("customer")}</dt><dd>{d.customerName}</dd></>) : null}
          {d.leadId ? (<><dt>{t("leadLabel")}</dt><dd><Link href={`/admin/crm/leads/${encodeURIComponent(d.leadId)}`}>{d.leadWorkId || d.leadTitle || t("open")}</Link></dd></>) : null}
          {d.ruleName ? (<><dt>{t("robot")}</dt><dd>{d.ruleName}</dd></>) : null}
          {d.createdAt ? (<><dt>{t("created")}</dt><dd>{fmtDateTime(d.createdAt, locale)}</dd></>) : null}
        </dl>
        {keys.length && pending ? (
          <div className="rop-form">
            {keys.map((k) => (
              <label key={k} className="rop-label">
                {pl(k)}
                <textarea className="rop-input" value={String(edits[k] ?? "")} onChange={(e) => setEdits((cur) => ({ ...cur, [k]: e.target.value }))} rows={k === "body" || k === "message" || k === "text" ? 5 : 2} />
              </label>
            ))}
            {changed ? <small className="rop-muted">{t("editedNote")}</small> : null}
          </div>
        ) : null}
        <Readable data={keys.length && pending ? rest : d.payload} />
        {pending ? (
          <>
            <label className="rop-label">
              {t("reason")}
              <input className="rop-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPh")} />
              <small>{t("reasonHint")}</small>
            </label>
            <div className="rb-run__act">
              <button type="button" className="crm-btn" onClick={() => void decide("reject")} disabled={!!busy} aria-busy={busy === "reject" || undefined} data-draft-reject="">
                <X aria-hidden="true" />
                {t("reject")}
              </button>
              <button type="button" className="crm-btn crm-btn--pri" onClick={() => void decide("approve")} disabled={!!busy} aria-busy={busy === "approve" || undefined} data-draft-approve="">
                <Check aria-hidden="true" />
                {changed ? t("approveEdited") : t("approve")}
              </button>
            </div>
          </>
        ) : d.reason ? (
          <p className="rop-muted">{t("decidedWith", { reason: d.reason })}</p>
        ) : null}
      </div>
    </Modal>
  );
}
