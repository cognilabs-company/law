"use client";

import "./escalations.css";
import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Notice } from "@/components/admin/AdminBits";
import { SxButton } from "@/components/admin/studio/sx/Button";
import { SxDialog, SxDialogError, type SxDialogErrorText } from "@/components/admin/studio/sx/editor/SxDialog";
import { ChoiceCards } from "@/components/admin/studio/sx/form/ChoiceCards";
import { Field } from "@/components/admin/studio/sx/form/Field";
import { TextArea } from "@/components/admin/studio/sx/form/TextArea";
import { Switch } from "@/components/admin/studio/sx/form/Switch";
import "@/components/marketplace/order/deal.css";
import { SxNote } from "@/components/admin/studio/sx/layout/Note";
import { shortDateTime } from "@/lib/date";
import { ApiError, errDetail, isAborted, isForbidden, logApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import PersonName from "@/components/ui/PersonName";
import { subscribeUserEvents } from "@/lib/userSocket";
import { useSameTickGuard } from "@/lib/useSameTickGuard";
import { listWarrantyClaims, resolveWarrantyClaim, type WarrantyClaim, type WarrantyDecision, type MpParty } from "@/lib/services/mpComplaints";
import { SellerPicker } from "./cancellations/SellerPicker";
import { IconShield } from "@/components/icons";
import QueueHead from "./QueueHead";
import { EmptyState, ErrorState, Skeleton } from "@/components/portal/DataState";

// The LexGo guarantee queue (enterprise contract §10): a client's claim
// that the seller did not answer, broke the deadline, dropped or did not
// deliver the work. The operator takes one of the decisions the claim's
// available_resolutions lists (replacement with a new seller — never the
// current — full refund, or rejection), with a note. Nothing else is
// offered: no rework, which the backend does not have (§1.5).

const NOTE_MIN = 5;

function ResolveDialog({ claim, onClose, onDone }: { claim: WarrantyClaim; onClose: () => void; onDone: (r: WarrantyDecision, files: number | null) => void }): ReactElement {
  const t = useTranslations("callCenter.warranty");
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [resolution, setResolution] = useState<WarrantyDecision | "">("");
  const [seller, setSeller] = useState("");
  const [note, setNote] = useState("");
  // Files go to the new seller only with the client's consent.
  const [transfer, setTransfer] = useState(claim.filesConsent === true);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SxDialogErrorText>(null);
  const once = useSameTickGuard();
  const errs = {
    resolution: resolution ? "" : t("err.resolution"),
    seller: resolution === "replacement" && !seller ? t("err.seller") : "",
    note: note.trim().length < NOTE_MIN ? t("err.note", { n: NOTE_MIN }) : "",
  };
  const shown = tried ? errs : { resolution: "", seller: "", note: "" };

  async function submit() {
    if (busy || !once()) return;
    setTried(true);
    if (errs.resolution || errs.seller || errs.note || !resolution) return;
    setBusy(true);
    setError(null);
    try {
      const r = await resolveWarrantyClaim(claim.id, { resolution, note, sellerUserId: seller, transferMaterials: resolution === "replacement" && transfer });
      onDone(resolution, r.transferred ? r.files : null);
    } catch (e) {
      logApiError("warranty.resolve", e);
      if (e instanceof ApiError && e.code === "material_transfer_consent_required") {
        setTransfer(false);
        setError({ title: t("err.failed"), text: t("err.noConsent") });
        return;
      }
      setError({ title: t("err.failed"), text: errDetail(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SxDialog
      open
      onClose={onClose}
      title={t("resolveTitle")}
      description={[claim.order.workId, claim.kind ? (t.has(`kind.${claim.kind}`) ? t(`kind.${claim.kind}`) : t("kind.other")) : ""].filter(Boolean).join(" · ") || undefined}
      busy={busy}
      dirty={!!resolution || !!note.trim()}
      aiId="call_center.warranty.resolve"
      footer={
        <>
          <SxButton variant="secondary" onClick={onClose} disabled={busy}>
            {t("back")}
          </SxButton>
          <SxButton variant={resolution === "full_refund" ? "danger" : "primary"} busy={busy} onClick={() => void submit()} aiId="call_center.warranty.submit">
            {resolution ? t(`confirm.${resolution}`) : t("confirmAny")}
          </SxButton>
        </>
      }
    >
      <Field id={`${uid}-r`} as="fieldset" label={t("resolution")} required error={shown.resolution}>
        {(a) => (
          <ChoiceCards
            {...a}
            columns={1}
            value={resolution}
            onChange={(v) => setResolution(v as WarrantyDecision)}
            options={claim.resolutions.map((r) => ({ value: r, title: t(`res.${r}`), description: t(`resHint.${r}`) }))}
            aiId="call_center.warranty.resolution"
          />
        )}
      </Field>
      {resolution === "replacement" ? (
        <Field id={`${uid}-s`} label={t("seller")} required error={shown.seller} help={t("sellerHelp")}>
          {(a) => (
            <SellerPicker
              id={a.id}
              aria-labelledby={a["aria-labelledby"]}
              aria-describedby={a["aria-describedby"]}
              invalid={!!shown.seller}
              required
              value={seller}
              serviceId={claim.order.serviceId}
              excludeUserId={claim.seller?.id ?? ""}
              onChange={(id) => setSeller(id)}
            />
          )}
        </Field>
      ) : null}
      {resolution === "replacement" ? (
        <div className="wrt-consent" data-on={transfer || undefined} data-off={claim.filesConsent === false || undefined}>
          <Switch id={`${uid}-t`} checked={transfer} onChange={setTransfer} disabled={claim.filesConsent === false} aria-labelledby={`${uid}-t-l`} aria-describedby={`${uid}-t-d`} aiId="call_center.warranty.transfer" />
          <div>
            <b id={`${uid}-t-l`}>{t("transfer")}</b>
            <p id={`${uid}-t-d`}>{claim.filesConsent === false ? t("transferNoConsent") : claim.filesConsent === true ? t("transferConsent") : t("transferUnknown")}</p>
          </div>
        </div>
      ) : null}
      <Field id={`${uid}-n`} label={t("note")} required error={shown.note}>
        {(a) => <TextArea {...a} value={note} onChange={setNote} minRows={3} maxLength={2000} counter />}
      </Field>
      {resolution === "full_refund" ? <SxNote tone="warn">{t("refundNote")}</SxNote> : null}
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

function Row({ claim, onResolve }: { claim: WarrantyClaim; onResolve: () => void }): ReactElement {
  const t = useTranslations("callCenter.warranty");
  const none = useTranslations("common")("none");
  const tp = useTranslations("marketplace.orderDetail.pricing");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  // An unknown code reads as "another status", never as the code itself.
  const label = (group: string, v: string) => (v && t.has(`${group}.${v}`) ? t(`${group}.${v}`) : v ? t("other") : none);
  const settled = !!claim.resolution;
  return (
    <li className="esc__item" data-open={open || undefined}>
      <button type="button" className="esc__row" aria-expanded={open} onClick={() => setOpen(!open)}>
        <b>{claim.order.workId || t("untitled")}</b>
        <span className="esc__chip" data-s={settled ? "resolved" : "open"}>
          {label("status", claim.status)}
        </span>
        <span>{label("kind", claim.kind)}</span>
        <time>{claim.createdAt ? shortDateTime(claim.createdAt, locale) : ""}</time>
      </button>
      {open ? (
        <div className="esc__body">
          <dl className="esc__facts" data-ai-private>
            <div>
              <dt>{t("f.reason")}</dt>
              <dd>{claim.reason || none}</dd>
            </div>
            <div>
              <dt>{t("f.order")}</dt>
              <dd>{[claim.order.workId, claim.order.price === null ? "" : `${fmtUzs(claim.order.price)} ${t("som")}`].filter(Boolean).join(" · ") || none}</dd>
            </div>
            <div>
              <dt>{t("f.client")}</dt>
              <dd>
                <Party p={claim.client} />
              </dd>
            </div>
            <div>
              <dt>{t("f.seller")}</dt>
              <dd>
                <Party p={claim.seller} />
              </dd>
            </div>
            <div>
              <dt>{t("f.settlement")}</dt>
              <dd>{claim.settlement ? (tp.has(`settle.${claim.settlement.status}`) ? tp(`settle.${claim.settlement.status}`) : t("other")) : none}</dd>
            </div>
            {settled ? (
              <div>
                <dt>{t("f.resolution")}</dt>
                <dd>{[label("res", claim.resolution), claim.note].filter(Boolean).join(" · ")}</dd>
              </div>
            ) : null}
          </dl>
          {!settled && claim.resolutions.length ? (
            <div className="esc__acts sx">
              <SxButton size="sm" variant="primary" onClick={onResolve} aiId="call_center.warranty.open">
                {t("resolve")}
              </SxButton>
            </div>
          ) : !settled ? (
            // The backend offers no decision for this claim right now.
            <p className="esc__muted">{t("noResolutions")}</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export default function WarrantyQueue({ onCount }: { onCount?: (n: number) => void }): ReactElement | null {
  const t = useTranslations("callCenter.warranty");
  const [status, setStatus] = useState("new");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<{ items: WarrantyClaim[]; total: number; hasMore: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [acting, setActing] = useState<WarrantyClaim | null>(null);
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
        const r = await listWarrantyClaims({ status, offset, limit: PAGE }, signal);
        setPage(r);
        setFailed(false);
        if (status === "new") onCountRef.current?.(r.total);
      } catch (e) {
        if (isAborted(e)) return;
        if (isForbidden(e)) return setDenied(true);
        logApiError("warranty.list", e);
        setFailed(true);
      }
    },
    [status, offset],
  );
  useEffect(() => {
    const ctl = new AbortController();
    void Promise.resolve().then(() => load(ctl.signal));
    const off = subscribeUserEvents((e) => {
      if (/^marketplace\.warranty_/.test(String(e.event ?? ""))) void load();
    });
    return () => {
      ctl.abort();
      off();
    };
  }, [load]);

  if (denied) return null;
  return (
    <section className="ppanel esc" data-ai-target="callcenter:warranty">
      <QueueHead
        icon={IconShield}
        title={t("title")}
        lead={t("lead")}
        count={page && !failed ? page.total : null}
        refreshLabel={t("refresh")}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void load().finally(() => setRefreshing(false));
        }}
        aiBase="call_center.warranty"
        statuses={["new", "resolved", "rejected", ""].map((s) => ({ value: s, label: s ? t(`status.${s}`) : t("all") }))}
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
        <EmptyState size="sm" icon={<IconShield />} title={t("empty")} />
      ) : null}
      {page?.items.length ? (
        <ul className="esc__list">
          {page.items.map((c) => (
            <Row key={c.id} claim={c} onResolve={() => setActing(c)} />
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
          claim={acting}
          onClose={() => setActing(null)}
          onDone={(r, files) => {
            setDone([t(`done.${r}`), files !== null ? t("filesMoved", { n: files }) : ""].filter(Boolean).join(" "));
            setActing(null);
            void load();
          }}
        />
      ) : null}
    </section>
  );
}
