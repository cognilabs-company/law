"use client";

import "./escalations.css";
import { IconFlag } from "@/components/icons";
import QueueHead from "./QueueHead";
import { EmptyState, ErrorState, Skeleton } from "@/components/portal/DataState";
import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Notice } from "@/components/admin/AdminBits";
import { SxButton } from "@/components/admin/studio/sx/Button";
import { SxDialog, SxDialogError, type SxDialogErrorText } from "@/components/admin/studio/sx/editor/SxDialog";
import { ChoiceCards } from "@/components/admin/studio/sx/form/ChoiceCards";
import { Field } from "@/components/admin/studio/sx/form/Field";
import { MoneyInput } from "@/components/admin/studio/sx/form/MoneyInput";
import { TextArea } from "@/components/admin/studio/sx/form/TextArea";
import { SxNote } from "@/components/admin/studio/sx/layout/Note";
import { shortDateTime } from "@/lib/date";
import { ApiError, errDetail, isAborted, isForbidden, logApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import CheckBox from "@/components/CheckBox";
import Select from "@/components/Select";
import PersonName from "@/components/ui/PersonName";
import { subscribeUserEvents } from "@/lib/userSocket";
import { useSameTickGuard } from "@/lib/useSameTickGuard";
import {
  MP_EVIDENCE_MAX,
  MP_EVIDENCE_TYPES,
  downloadEvidence,
  listMpComplaints,
  resolveMpComplaint,
  uploadMpComplaintEvidence,
  type MpComplaint,
  type MpComplaintAction,
  type MpEvidence,
  type MpParty,
} from "@/lib/services/mpComplaints";

// Marketplace complaints (TSK-344069): an open complaint holds the seller's
// final payout. The operator sees the order, both parties, the held
// settlement and the evidence, then rules: rework, a partial or full
// refund, not valid, or resolved; the backend moves the settlement.

const NOTE_MIN = 5;
const isMpComplaintEvent = (name: unknown) => /^marketplace\.complaint_/.test(String(name ?? ""));

function ResolveDialog({ c, onClose, onDone, onStale }: { c: MpComplaint; onClose: () => void; onDone: (action: MpComplaintAction) => void; onStale: () => void }): ReactElement {
  const t = useTranslations("callCenter.mpComplaints");
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [action, setAction] = useState<MpComplaintAction | "">("");
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<MpEvidence[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<"staff" | "parties">("staff");
  const [uploading, setUploading] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SxDialogErrorText>(null);
  const once = useSameTickGuard();
  const evidence = [...c.evidence, ...files];
  const errs = {
    action: action ? "" : t("err.action"),
    amount: action === "partial_refund" && !(amount && amount > 0 && Number.isInteger(amount)) ? t("err.amount") : "",
    note: note.trim().length < NOTE_MIN ? t("err.note", { n: NOTE_MIN }) : "",
  };
  const shown = tried ? errs : { action: "", amount: "", note: "" };

  async function addFiles(list: FileList | null) {
    if (!list?.length || uploading) return;
    const all = Array.from(list);
    const bad = all.find((f) => !(MP_EVIDENCE_TYPES as readonly string[]).includes(f.type) || f.size > MP_EVIDENCE_MAX);
    if (bad) return setError({ title: t("err.fileBad", { name: bad.name }), text: "" });
    setUploading(true);
    setError(null);
    try {
      for (const f of all) {
        const ev = await uploadMpComplaintEvidence(c.id, f, visibility);
        if (ev.id) {
          setFiles((x) => [...x, { ...ev, fileName: ev.fileName || f.name }]);
          setPicked((x) => [...x, ev.id]);
        }
      }
    } catch (e) {
      logApiError("mpComplaint.evidence", e);
      setError({ title: t("err.upload"), text: errDetail(e) });
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (busy || uploading || !once()) return;
    setTried(true);
    if (errs.action || errs.amount || errs.note || !action) return;
    setBusy(true);
    setError(null);
    try {
      await resolveMpComplaint(c.id, { action, note, refundAmount: amount, evidenceIds: picked });
      onDone(action);
    } catch (e) {
      if (e instanceof ApiError && e.code === "marketplace_complaint_already_resolved") return onStale();
      logApiError("mpComplaint.resolve", e);
      setError({ title: t("err.failed"), text: errDetail(e) });
    } finally {
      setBusy(false);
    }
  }

  // Only rulings the screen can name; an unknown one is left out.
  const options = c.actions.filter((a) => t.has(`action.${a}`) && t.has(`confirm.${a}`)).map((a) => ({ value: a, title: t(`action.${a}`), description: t.has(`actionHint.${a}`) ? t(`actionHint.${a}`) : "" }));
  const danger = action === "full_refund" || action === "partial_refund" || action === "valid_refund";
  return (
    <SxDialog
      open
      onClose={onClose}
      title={t("resolveTitle")}
      description={[c.order.workId, c.reason].filter(Boolean).join(" · ") || undefined}
      busy={busy}
      dirty={!!action || !!note.trim()}
      aiId="call_center.mp_complaints.resolve"
      footer={
        <>
          <SxButton variant="secondary" onClick={onClose} disabled={busy}>
            {t("back")}
          </SxButton>
          <SxButton variant={danger ? "danger" : "primary"} busy={busy} onClick={() => void submit()} aiId="call_center.mp_complaints.submit">
            {action ? t(`confirm.${action}`) : t("confirmAny")}
          </SxButton>
        </>
      }
    >
      <Field id={`${uid}-a`} as="fieldset" label={t("action.label")} required error={shown.action}>
        {(a) => <ChoiceCards {...a} columns={1} value={action} onChange={(v) => setAction(v as MpComplaintAction)} options={options} aiId="call_center.mp_complaints.action" />}
      </Field>
      {action === "partial_refund" ? (
        <Field id={`${uid}-m`} label={t("amount")} required error={shown.amount} help={c.settlement?.held !== null && c.settlement?.held !== undefined ? t("amountHelp", { held: fmtUzs(c.settlement.held) }) : ""}>
          {(a) => <MoneyInput {...a} currency={c.order.currency} value={amount} onChange={setAmount} aiId="call_center.mp_complaints.amount" aiLabel={t("amount")} />}
        </Field>
      ) : null}
      <Field id={`${uid}-n`} label={t("note")} required error={shown.note} help={t("noteHelp")}>
        {(a) => <TextArea {...a} value={note} onChange={setNote} minRows={3} maxLength={2000} counter />}
      </Field>
      <div className="esc__ev">
        <b className="esc__h">{t("evidence")}</b>
        {evidence.length ? (
          <ul className="esc__files">
            {evidence.map((f) => (
              <li key={f.id}>
                <CheckBox checked={picked.includes(f.id)} onChange={(on) => setPicked((x) => (on ? [...x, f.id] : x.filter((y) => y !== f.id)))}>
                  {f.fileName || t("file")}
                </CheckBox>
                {f.visibility ? <span className="esc__muted">{t(`vis.${f.visibility === "parties" ? "parties" : "staff"}`)}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="esc__muted">{t("noEvidence")}</p>
        )}
        <span className="esc__up sx">
          <span className="esc__vis">
            <Select
              value={visibility}
              onChange={(v) => setVisibility(v === "parties" ? "parties" : "staff")}
              ariaLabel={t("visibility")}
              options={[
                { value: "staff", label: t("vis.staff") },
                { value: "parties", label: t("vis.parties") },
              ]}
            />
          </span>
          <label className="btn btn--line btn--sm">
            {uploading ? t("uploading") : t("addFile")}
            <input type="file" hidden multiple accept={MP_EVIDENCE_TYPES.join(",")} disabled={uploading} onChange={(e) => void addFiles(e.target.files).finally(() => (e.target.value = ""))} />
          </label>
          <small className="esc__muted">{t("fileHint")}</small>
        </span>
      </div>
      {danger ? <SxNote tone="warn">{t("refundNote")}</SxNote> : null}
      <SxDialogError error={error} />
    </SxDialog>
  );
}


// A party by name with its LexGo id and phone; a bare id is looked up.
function Party({ p }: { p: MpParty | null }): ReactElement {
  if (!p) return <PersonName />;
  if (!p.name) return <PersonName id={p.id} withPhone />;
  return <>{[p.name, p.lexgoId, p.phone].filter(Boolean).join(" · ")}</>;
}

// `settled`: ruled on from this screen a moment ago — its button is gone at
// once, so the same ruling cannot go out twice while the list reloads
// (backend answers 2026-10-31 §1.7).
function Row({ c, settled, onResolve }: { c: MpComplaint; settled: boolean; onResolve: () => void }): ReactElement {
  const t = useTranslations("callCenter.mpComplaints");
  const none = useTranslations("common")("none");
  const tp = useTranslations("marketplace.orderDetail.pricing");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const money = (n: number | null) => (n === null ? none : `${fmtUzs(n)} ${t("som")}`);
  const st = c.settlement;
  // An unknown code reads as "another status", never as the code itself.
  const label = (group: string, v: string) => (v && t.has(`${group}.${v}`) ? t(`${group}.${v}`) : v ? t("other") : none);
  return (
    <li className="esc__item" data-open={open || undefined}>
      <button type="button" className="esc__row" aria-expanded={open} onClick={() => setOpen(!open)}>
        <b>{c.order.workId || c.title || t("untitled")}</b>
        <span className="esc__chip" data-s={c.status === "new" ? "open" : "resolved"}>
          {label("status", c.status)}
        </span>
        <span>{c.reason || none}</span>
        <time>{c.createdAt ? shortDateTime(c.createdAt, locale) : ""}</time>
      </button>
      {open ? (
        <div className="esc__body">
          <dl className="esc__facts" data-ai-private>
            <div>
              <dt>{t("f.order")}</dt>
              <dd>{[c.order.workId, label("orderStatus", c.order.status), money(c.order.price)].join(" · ")}</dd>
            </div>
            <div>
              <dt>{t("f.rating")}</dt>
              <dd>{c.rating ?? none}</dd>
            </div>
            <div>
              <dt>{t("f.client")}</dt>
              <dd>
                <Party p={c.client} />
              </dd>
            </div>
            <div>
              <dt>{t("f.seller")}</dt>
              <dd>
                <Party p={c.seller} />
              </dd>
            </div>
            <div>
              <dt>{t("f.settlement")}</dt>
              <dd>{st ? (tp.has(`settle.${st.status}`) ? tp(`settle.${st.status}`) : t("other")) : none}</dd>
            </div>
            {st ? (
              <div>
                <dt>{t("f.amounts")}</dt>
                <dd>{t("amounts", { held: money(st.held), refunded: money(st.refunded), pending: money(st.pendingRefund) })}</dd>
              </div>
            ) : null}
            {c.resolution ? (
              <div>
                <dt>{t("f.resolution")}</dt>
                <dd>
                  {label("action", c.resolution)}
                  {c.refundAmount ? ` · ${money(c.refundAmount)}` : ""}
                  {c.resolutionNote ? ` · ${c.resolutionNote}` : ""}
                </dd>
              </div>
            ) : null}
          </dl>
          {c.evidence.length ? (
            <span className="esc__acts sx">
              {c.evidence.map((f) => (
                <SxButton key={f.id} size="sm" variant="secondary" onClick={() => void downloadEvidence(f).catch((e) => logApiError("mpComplaint.download", e))}>
                  {f.fileName || t("file")}
                </SxButton>
              ))}
            </span>
          ) : null}
          {c.actions.length && !settled ? (
            <div className="esc__acts sx">
              <SxButton size="sm" variant="primary" onClick={onResolve} aiId="call_center.mp_complaints.open">
                {t("resolve")}
              </SxButton>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export default function MarketplaceComplaints({ onCount }: { onCount?: (n: number) => void }): ReactElement | null {
  const t = useTranslations("callCenter.mpComplaints");
  const [status, setStatus] = useState("new");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<{ items: MpComplaint[]; total: number; hasMore: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [acting, setActing] = useState<MpComplaint | null>(null);
  const [settledIds, setSettledIds] = useState<ReadonlySet<string>>(() => new Set());
  const [done, setDone] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const onCountRef = useRef(onCount);
  useEffect(() => {
    onCountRef.current = onCount;
  });
  const PAGE = 20;

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const r = await listMpComplaints({ status, offset, limit: PAGE }, signal);
        setPage(r);
        setFailed(false);
        if (status === "new") onCountRef.current?.(r.total);
      } catch (e) {
        if (isAborted(e)) return;
        if (isForbidden(e)) return setDenied(true);
        logApiError("mpComplaints.list", e);
        setFailed(true);
      }
    },
    [status, offset],
  );
  useEffect(() => {
    const ctl = new AbortController();
    void Promise.resolve().then(() => load(ctl.signal));
    // A realtime change refreshes the current page, keeping filter and offset.
    const off = subscribeUserEvents((e) => {
      if (isMpComplaintEvent(e.event)) void load();
    });
    return () => {
      ctl.abort();
      off();
    };
  }, [load]);

  if (denied) return null;
  return (
    <section className="ppanel esc" data-ai-target="callcenter:mp-complaints">
      <QueueHead
        icon={IconFlag}
        title={t("title")}
        lead={t("lead")}
        count={page && !failed ? page.total : null}
        refreshLabel={t("refresh")}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void load().finally(() => setRefreshing(false));
        }}
        aiBase="call_center.mp_complaints"
        statuses={["new", "rework_required", "refund_required", "rejected", "resolved", ""].map((s) => ({ value: s, label: s ? t(`status.${s}`) : t("all") }))}
        status={status}
        onStatus={(v) => {
          setStatus(v);
          setOffset(0);
        }}
        statusLabel={t("statusFilter")}
      />
      {done ? <Notice ok msg={done} /> : null}
      {failed ? (
        <ErrorState title={t("loadFailed")} onRetry={() => void load()} compact />
      ) : !page ? (
        <Skeleton rows={3} />
      ) : !page.items.length ? (
        <EmptyState size="sm" icon={<IconFlag />} title={t("empty")} />
      ) : null}
      {page?.items.length ? (
        <ul className="esc__list">
          {page.items.map((c) => (
            <Row key={c.id} c={c} settled={settledIds.has(c.id)} onResolve={() => setActing(c)} />
          ))}
        </ul>
      ) : null}
      {page && page.total > PAGE ? (
        <div className="esc__pager sx">
          <SxButton size="sm" variant="secondary" onClick={() => setOffset((n) => Math.max(0, n - PAGE))} disabled={offset === 0}>
            {t("prev")}
          </SxButton>
          <span>{t("pageOf", { from: offset + 1, to: offset + page.items.length, total: page.total })}</span>
          <SxButton size="sm" variant="secondary" onClick={() => setOffset((n) => n + PAGE)} disabled={!page.hasMore}>
            {t("next")}
          </SxButton>
        </div>
      ) : null}
      {acting ? (
        <ResolveDialog
          c={acting}
          onClose={() => setActing(null)}
          onDone={(a) => {
            setDone(t(`done.${a}`));
            setSettledIds((cur) => new Set(cur).add(acting.id));
            setActing(null);
            void load();
          }}
          onStale={() => {
            setDone(t("alreadyResolved"));
            setActing(null);
            void load();
          }}
        />
      ) : null}
    </section>
  );
}
