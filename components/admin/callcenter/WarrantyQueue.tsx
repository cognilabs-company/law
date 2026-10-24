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
import { SxNote } from "@/components/admin/studio/sx/layout/Note";
import { shortDateTime } from "@/lib/date";
import { errDetail, isAborted, isForbidden, logApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { subscribeUserEvents } from "@/lib/userSocket";
import { useSameTickGuard } from "@/lib/useSameTickGuard";
import { listWarrantyClaims, resolveWarrantyClaim, type WarrantyClaim, type WarrantyDecision } from "@/lib/services/mpComplaints";
import { SellerPicker } from "./cancellations/SellerPicker";

// The LexGo guarantee queue (enterprise contract §10): a client's claim
// that the seller did not answer, broke the deadline, dropped or did not
// deliver the work. The operator picks a replacement seller (a new one,
// never the current), a full refund, or rejects it, with a note.

const NOTE_MIN = 5;

function ResolveDialog({ claim, onClose, onDone }: { claim: WarrantyClaim; onClose: () => void; onDone: (r: WarrantyDecision) => void }): ReactElement {
  const t = useTranslations("callCenter.warranty");
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [resolution, setResolution] = useState<WarrantyDecision | "">("");
  const [seller, setSeller] = useState("");
  const [note, setNote] = useState("");
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
      await resolveWarrantyClaim(claim.id, { resolution, note, sellerUserId: seller });
      onDone(resolution);
    } catch (e) {
      logApiError("warranty.resolve", e);
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
      description={[claim.order.workId, t.has(`kind.${claim.kind}`) ? t(`kind.${claim.kind}`) : claim.kind].filter(Boolean).join(" · ") || undefined}
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
      <Field id={`${uid}-n`} label={t("note")} required error={shown.note}>
        {(a) => <TextArea {...a} value={note} onChange={setNote} minRows={3} maxLength={2000} counter />}
      </Field>
      {resolution === "full_refund" ? <SxNote tone="warn">{t("refundNote")}</SxNote> : null}
      <SxDialogError error={error} />
    </SxDialog>
  );
}

function Row({ claim, onResolve }: { claim: WarrantyClaim; onResolve: () => void }): ReactElement {
  const t = useTranslations("callCenter.warranty");
  const tp = useTranslations("marketplace.orderDetail.pricing");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const label = (group: string, v: string) => (v && t.has(`${group}.${v}`) ? t(`${group}.${v}`) : v || "—");
  const person = (p: WarrantyClaim["client"]) => (p ? [p.name, p.lexgoId, p.phone].filter(Boolean).join(" · ") : "—");
  const settled = !!claim.resolution;
  return (
    <li className="esc__item" data-open={open || undefined}>
      <button type="button" className="esc__row" aria-expanded={open} onClick={() => setOpen(!open)}>
        <b>{claim.order.workId || claim.id}</b>
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
              <dd>{claim.reason || "—"}</dd>
            </div>
            <div>
              <dt>{t("f.order")}</dt>
              <dd>{[claim.order.workId, claim.order.price === null ? "" : `${fmtUzs(claim.order.price)} ${t("som")}`].filter(Boolean).join(" · ") || "—"}</dd>
            </div>
            <div>
              <dt>{t("f.client")}</dt>
              <dd>{person(claim.client)}</dd>
            </div>
            <div>
              <dt>{t("f.seller")}</dt>
              <dd>{person(claim.seller)}</dd>
            </div>
            <div>
              <dt>{t("f.settlement")}</dt>
              <dd>{claim.settlement ? (tp.has(`settle.${claim.settlement.status}`) ? tp(`settle.${claim.settlement.status}`) : claim.settlement.status) : "—"}</dd>
            </div>
            {settled ? (
              <div>
                <dt>{t("f.resolution")}</dt>
                <dd>{[label("res", claim.resolution), claim.note].filter(Boolean).join(" · ")}</dd>
              </div>
            ) : null}
          </dl>
          {!settled ? (
            <div className="esc__acts">
              <SxButton size="sm" variant="primary" onClick={onResolve} aiId="call_center.warranty.open">
                {t("resolve")}
              </SxButton>
            </div>
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
    <div className="ppanel esc" data-ai-target="callcenter:warranty">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setOffset(0);
          }}
          aria-label={t("statusFilter")}
        >
          {["new", "resolved", "rejected", ""].map((s) => (
            <option key={s || "all"} value={s}>
              {s ? t(`status.${s}`) : t("all")}
            </option>
          ))}
        </select>
      </div>
      <p className="ppanel__note">{t("lead")}</p>
      {done ? <Notice ok msg={done} /> : null}
      {failed ? <Notice ok={false} msg={t("loadFailed")} /> : null}
      {page && !page.items.length ? <p className="ppanel__note">{t("empty")}</p> : null}
      {page?.items.length ? (
        <ul className="esc__list">
          {page.items.map((c) => (
            <Row key={c.id} claim={c} onResolve={() => setActing(c)} />
          ))}
        </ul>
      ) : null}
      {page && page.total > PAGE ? (
        <div className="esc__pager">
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
          onDone={(r) => {
            setDone(t(`done.${r}`));
            setActing(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
