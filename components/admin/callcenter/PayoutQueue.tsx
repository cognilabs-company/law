"use client";

import "./escalations.css";
import "./payouts.css";
import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Notice } from "@/components/admin/AdminBits";
import { SxButton } from "@/components/admin/studio/sx/Button";
import { SxDialog, SxDialogError, type SxDialogErrorText } from "@/components/admin/studio/sx/editor/SxDialog";
import { Field } from "@/components/admin/studio/sx/form/Field";
import { TextArea } from "@/components/admin/studio/sx/form/TextArea";
import { TextInput } from "@/components/admin/studio/sx/form/TextInput";
import Segmented from "@/components/ui/Segmented";
import PersonName from "@/components/ui/PersonName";
import { EmptyState, ErrorState, Skeleton } from "@/components/portal/DataState";
import { IconCheck, IconCoins, IconReply } from "@/components/icons";
import { shortDateTime } from "@/lib/date";
import { ApiError, errDetail, isAborted, isForbidden, logApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { subscribeUserEvents } from "@/lib/userSocket";
import { useSameTickGuard } from "@/lib/useSameTickGuard";
import { listCcPayouts, listPayoutRecoveries, markPayoutPaid, payoutActionable, resolvePayoutRecovery, type Page, type Payout, type Recovery } from "@/lib/services/payouts";
import QueueHead from "./QueueHead";

// TSK-906326 — the seller payouts the call center pays by hand until an
// automatic payout provider exists (contract 2026-10-27 §9, §13): each stage
// (30% on acceptance, 30% after the first checklist stage, 22% after
// completion), and the recoveries when a refund came after a payout. Every
// amount is the backend's; a transfer reference is required to close one.

type View = "payouts" | "recoveries";
const PAGE = 20;
const REF_MAX = 120;

function PaidDialog({ kind, target, onClose, onDone }: { kind: View; target: Payout | Recovery; onClose: () => void; onDone: () => void }): ReactElement {
  const t = useTranslations("callCenter.payouts");
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SxDialogErrorText>(null);
  const once = useSameTickGuard();
  const refErr = tried && !ref.trim() ? t("err.reference") : "";

  async function submit() {
    if (busy || !once()) return;
    setTried(true);
    if (!ref.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "payouts") await markPayoutPaid(target.id, { reference: ref, note });
      else await resolvePayoutRecovery(target.id, { reference: ref, note });
      onDone();
    } catch (e) {
      logApiError("payouts.close", e);
      const code = e instanceof ApiError ? e.code : "";
      setError({ title: t("err.failed"), text: code && t.has(`code.${code}`) ? t(`code.${code}`) : errDetail(e) || t("err.generic") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SxDialog
      open
      onClose={onClose}
      title={kind === "payouts" ? t("paidTitle") : t("recoverTitle")}
      description={[target.workId, `${fmtUzs(target.amount)} ${t("som")}`].filter(Boolean).join(" · ")}
      busy={busy}
      dirty={!!ref.trim() || !!note.trim()}
      aiId={`call_center.payouts.${kind}.close`}
      footer={
        <>
          <SxButton variant="secondary" onClick={onClose} disabled={busy}>
            {t("back")}
          </SxButton>
          <SxButton variant="primary" busy={busy} onClick={() => void submit()} aiId={`call_center.payouts.${kind}.confirm`}>
            {kind === "payouts" ? t("paidConfirm") : t("recoverConfirm")}
          </SxButton>
        </>
      }
    >
      <div className="pyq__sum">
        <span className="pyq__sumic" aria-hidden="true">
          {kind === "payouts" ? <IconCoins /> : <IconReply />}
        </span>
        <span>
          <b>{`${fmtUzs(target.amount)} ${t("som")}`}</b>
          <small>
            {kind === "payouts" ? t("paidLead") : t("recoverLead")} <PersonName id={target.seller?.id} name={target.seller?.name} fallback={t("noSeller")} />
          </small>
        </span>
      </div>
      <Field id={`${uid}-r`} label={t("reference")} required error={refErr} help={t("referenceHelp")}>
        {(a) => <TextInput {...a} value={ref} onChange={(v) => setRef(v.slice(0, REF_MAX))} mono aiId={`call_center.payouts.${kind}.reference`} />}
      </Field>
      <Field id={`${uid}-n`} label={t("note")}>
        {(a) => <TextArea {...a} value={note} onChange={setNote} minRows={2} maxLength={1000} counter />}
      </Field>
      <SxDialogError error={error} />
    </SxDialog>
  );
}

function StageChip({ p }: { p: Payout }): ReactElement {
  const t = useTranslations("callCenter.payouts");
  return (
    <span className="pyq__stage" data-stage={p.stage}>
      <i aria-hidden="true" />
      {t(`stage.${p.stage}`)}
      {p.percent !== null ? <em>{p.percent}%</em> : null}
    </span>
  );
}

// `settled`: closed from this screen a moment ago — shown as done at once,
// so its button cannot send the same payout twice while the list reloads
// (backend answers 2026-10-31 §1.7: no Idempotency-Key here yet).
function Row({ kind, item, settled, onClose }: { kind: View; item: Payout | Recovery; settled: boolean; onClose: () => void }): ReactElement {
  const t = useTranslations("callCenter.payouts");
  const locale = useLocale();
  const payout = kind === "payouts" ? (item as Payout) : null;
  const rec = kind === "recoveries" ? (item as Recovery) : null;
  const closed = item.status === "paid" || settled;
  return (
    <li className="pyq__row" data-status={settled ? "paid" : item.status}>
      <span className="pyq__who">
        <b>
          <PersonName id={item.seller?.id} name={item.seller?.name} fallback={t("noSeller")} />
        </b>
        <small>{[item.workId, item.serviceTitle].filter(Boolean).join(" · ") || t("noOrder")}</small>
      </span>
      {payout ? <StageChip p={payout} /> : <span className="pyq__reason">{rec?.reason || t("refundAfterPayout")}</span>}
      <span className="pyq__amt">
        <b>{`${fmtUzs(item.amount)} ${t("som")}`}</b>
        <small>{item.createdAt ? shortDateTime(item.createdAt, locale) : ""}</small>
      </span>
      <span className="pyq__act sx">
        {closed ? (
          <span className="pyq__done">
            <IconCheck aria-hidden="true" />
            {kind === "payouts" ? t("statusPaid") : t("statusRecovered")}
            {item.reference ? <code>{item.reference}</code> : null}
          </span>
        ) : !payoutActionable(item.status) ? (
          // The provider is sending it, or it waits for a recovery: nothing to press here.
          <span className="pyq__held">{t(`status.${item.status}`)}</span>
        ) : (
          <SxButton size="sm" variant="primary" onClick={onClose} aiId={`call_center.payouts.${kind}.open`}>
            {kind === "payouts" ? t("markPaid") : t("markRecovered")}
          </SxButton>
        )}
      </span>
    </li>
  );
}

export default function PayoutQueue({ onCount }: { onCount?: (n: number) => void }): ReactElement | null {
  const t = useTranslations("callCenter.payouts");
  const [view, setView] = useState<View>("payouts");
  const [status, setStatus] = useState("open");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<Page<Payout | Recovery> | null>(null);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [acting, setActing] = useState<Payout | Recovery | null>(null);
  const [settledIds, setSettledIds] = useState<ReadonlySet<string>>(() => new Set());
  const [done, setDone] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const onCountRef = useRef(onCount);
  useEffect(() => {
    onCountRef.current = onCount;
  });
  // "open" asks for everything and keeps what is not finished yet; "paid"
  // is the backend's paid (payouts) or recovered (recoveries).
  const apiStatus = status === "open" ? "" : status === "paid" && view === "recoveries" ? "recovered" : status;

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const r = view === "payouts" ? await listCcPayouts({ status: apiStatus, offset, limit: PAGE }, signal) : await listPayoutRecoveries({ status: apiStatus, offset, limit: PAGE }, signal);
        const items = status === "open" ? r.items.filter((x) => x.status !== "paid") : r.items;
        setPage({ ...r, items });
        setFailed(false);
        if (view === "payouts" && status === "open") onCountRef.current?.(items.filter((x) => payoutActionable(x.status)).length);
      } catch (e) {
        if (isAborted(e)) return;
        if (isForbidden(e)) return setDenied(true);
        logApiError("payouts.list", e);
        setFailed(true);
      }
    },
    [view, status, apiStatus, offset],
  );
  useEffect(() => {
    const ctl = new AbortController();
    void Promise.resolve().then(() => load(ctl.signal));
    const off = subscribeUserEvents((e) => {
      if (/^marketplace\.payout_|^marketplace\.refund_/.test(String(e.event ?? ""))) void load();
    });
    return () => {
      ctl.abort();
      off();
    };
  }, [load]);

  if (denied) return null;
  return (
    <section className="ppanel esc pyq" data-ai-target="callcenter:payouts">
      <QueueHead
        icon={IconCoins}
        title={t("title")}
        lead={t("lead")}
        count={page && !failed ? page.items.length : null}
        refreshLabel={t("refresh")}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void load().finally(() => setRefreshing(false));
        }}
        aiBase="call_center.payouts"
        statuses={[
          { value: "open", label: t("filter.open") },
          { value: "paid", label: view === "payouts" ? t("filter.paid") : t("filter.recovered") },
          { value: "", label: t("filter.all") },
        ]}
        status={status}
        onStatus={(v) => {
          setStatus(v);
          setOffset(0);
        }}
        statusLabel={t("filter.label")}
      />
      <div className="pyq__views">
        <Segmented<View>
          value={view}
          onChange={(v) => {
            setView(v);
            setOffset(0);
            setPage(null);
          }}
          label={t("viewLabel")}
          options={[
            { value: "payouts", label: t("view.payouts") },
            { value: "recoveries", label: t("view.recoveries") },
          ]}
        />
        <p className="pyq__policy">{view === "payouts" ? t("policy") : t("recoverPolicy")}</p>
      </div>
      {done ? <Notice ok msg={done} /> : null}
      {failed ? (
        <ErrorState title={t("loadFailed")} onRetry={() => void load()} compact />
      ) : !page ? (
        <Skeleton rows={3} />
      ) : !page.items.length ? (
        <EmptyState size="sm" icon={view === "payouts" ? <IconCoins /> : <IconReply />} title={view === "payouts" ? t("empty") : t("emptyRecover")} text={view === "payouts" ? t("emptyText") : t("emptyRecoverText")} />
      ) : (
        <ul className="pyq__list">
          {page.items.map((x) => (
            <Row key={x.id} kind={view} item={x} settled={settledIds.has(x.id)} onClose={() => setActing(x)} />
          ))}
        </ul>
      )}
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
        <PaidDialog
          kind={view}
          target={acting}
          onClose={() => setActing(null)}
          onDone={() => {
            setDone(view === "payouts" ? t("donePaid") : t("doneRecovered"));
            setSettledIds((cur) => new Set(cur).add(acting.id));
            setActing(null);
            void load();
          }}
        />
      ) : null}
    </section>
  );
}
