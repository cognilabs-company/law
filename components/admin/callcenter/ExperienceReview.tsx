"use client";

import "./experienceReview.css";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Notice } from "@/components/admin/AdminBits";
import { categoryName } from "@/lib/categoryNames";
import { dateOnly } from "@/lib/date";
import { errDetail, isAborted, isForbidden, logApiError } from "@/lib/http";
import { getServiceCategories, type BackendCategory } from "@/lib/services/backend";
import { subscribeUserEvents } from "@/lib/userSocket";
import {
  canApprove,
  downloadExperienceEvidence,
  experienceErrorOf,
  getExperienceForReview,
  isMandatoryCheck,
  listExperienceQueue,
  reviewExperience,
  type CheckRows,
  type CheckVerdict,
  type ExperienceItem,
  type ExperienceQueueItem,
  type ExperienceReviewDetail,
} from "@/lib/services/experience";

// Experience verification for the call center (TSK-659111): the queue,
// oldest first, and for each record the submitted revision next to the
// approved one it would replace, with a checklist where every item gets its
// own verdict and note. Approval waits until every item is approved or not
// applicable (mandatory ones approved); a rejection needs a reason, which
// the lawyer sees.

const VERDICTS: readonly Exclude<CheckVerdict, "">[] = ["approved", "rejected", "not_applicable"];
const isExperienceEvent = (e: { event?: unknown }) => String(e.event ?? "").startsWith("marketplace.experience_");

function useCategories() {
  const locale = useLocale();
  const [cats, setCats] = useState<BackendCategory[]>([]);
  useEffect(() => {
    let alive = true;
    getServiceCategories().then(
      (c) => alive && setCats(c),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);
  return (id: string) => {
    const c = cats.find((x) => x.id === id);
    return c ? categoryName({ slug: c.slug, title: c.name }, locale) : id;
  };
}

export function ExperienceQueue({ onCount }: { onCount?: (n: number) => void }): ReactElement | null {
  const t = useTranslations("callCenter.experience");
  const locale = useLocale();
  const catName = useCategories();
  const [items, setItems] = useState<ExperienceQueueItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  // The queue is for call_center/admin/manager or approvals.manage;
  // callcenter.access alone answers 403, and the tab then stays away.
  const [denied, setDenied] = useState(false);
  const [open, setOpen] = useState("");
  const onCountRef = useRef(onCount);
  useEffect(() => {
    onCountRef.current = onCount;
  });

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const r = await listExperienceQueue({}, signal);
      setItems(r.items);
      setFailed(false);
      onCountRef.current?.(r.total);
    } catch (e) {
      if (isAborted(e)) return;
      if (isForbidden(e)) return setDenied(true);
      logApiError("experience.queue", e);
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    const ctl = new AbortController();
    void Promise.resolve().then(() => load(ctl.signal));
    const off = subscribeUserEvents((e) => {
      if (isExperienceEvent(e)) void load();
    });
    return () => {
      ctl.abort();
      off();
    };
  }, [load]);

  if (denied) return null;
  return (
    <div className="ppanel xpr" data-ai-target="callcenter:experience">
      <div className="ppanel__h">
        <b>{t("queue")}</b>
      </div>
      <p className="ppanel__note">{t("queueLead")}</p>
      {failed ? <Notice ok={false} msg={t("loadFailed")} /> : null}
      {items && !items.length ? <p className="ppanel__note">{t("queueEmpty")}</p> : null}
      {items?.length ? (
        <ul className="xpr__queue">
          {items.map((it) => (
            <li key={it.id} data-open={open === it.id || undefined}>
              <button type="button" className="xpr__qrow" onClick={() => setOpen(open === it.id ? "" : it.id)} aria-expanded={open === it.id}>
                <b>{it.sellerName || t("seller")}</b>
                <span>{catName(it.categoryId)}</span>
                <span>{it.sourceId ? t("revision", { n: it.version ?? 2 }) : t("newRecord")}</span>
                <time>{it.submittedAt ? dateOnly(it.submittedAt, locale) : ""}</time>
              </button>
              {open === it.id ? (
                <ExperienceReview
                  experienceId={it.id}
                  onDone={() => {
                    setOpen("");
                    void load();
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Side({ title, it, catName }: { title: string; it: ExperienceItem | null; catName: (id: string) => string }) {
  const t = useTranslations("callCenter.experience");
  const tp = useTranslations("portal.experience");
  const locale = useLocale();
  if (!it) {
    return (
      <section className="xpr__side" aria-label={title}>
        <b>{title}</b>
        <p className="ppanel__note">{t("noPrevious")}</p>
      </section>
    );
  }
  const row = (label: string, value: string) =>
    value ? (
      <div>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    ) : null;
  return (
    <section className="xpr__side" aria-label={title}>
      <b>{title}</b>
      <dl>
        {row(tp("category"), catName(it.categoryId))}
        {row(tp("workplace"), it.workplace)}
        {row(tp("position"), it.position)}
        {row(t("period"), [it.startedAt ? dateOnly(it.startedAt, locale) : "", it.isCurrent ? tp("now") : it.endedAt ? dateOnly(it.endedAt, locale) : ""].filter(Boolean).join(" — "))}
        {row(t("years"), it.years === null ? "" : String(it.years))}
        {row(tp("stages"), it.stages.map((s) => (tp.has(`stage.${s}`) ? tp(`stage.${s}`) : s)).join(", "))}
        {row(tp("results"), it.results.map((r) => (tp.has(`result.${r}`) ? tp(`result.${r}`) : r)).join(", "))}
        {row(tp("description"), it.description)}
      </dl>
      {it.evidence.length ? (
        <span className="xpr__files">
          {it.evidence.map((f) => (
            <button key={f.id} type="button" className="btn btn--ghost btn--sm" onClick={() => void downloadExperienceEvidence(f).catch((e) => logApiError("experience.download", e))}>
              {f.fileName || tp("file")}
            </button>
          ))}
        </span>
      ) : (
        <small className="ppanel__note">{t("noFiles")}</small>
      )}
    </section>
  );
}

export default function ExperienceReview({ experienceId, onDone }: { experienceId: string; onDone?: () => void }): ReactElement {
  const t = useTranslations("callCenter.experience");
  const catName = useCategories();
  const [detail, setDetail] = useState<ExperienceReviewDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [rows, setRows] = useState<CheckRows>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [done, setDone] = useState<"" | "approved" | "rejected">("");
  const [err, setErr] = useState("");
  const [flagged, setFlagged] = useState<string[]>([]);

  useEffect(() => {
    const ctl = new AbortController();
    getExperienceForReview(experienceId, ctl.signal).then(setDetail, (e) => {
      if (isAborted(e)) return;
      logApiError("experience.detail", e);
      setLoadFailed(true);
    });
    return () => ctl.abort();
  }, [experienceId]);

  const keys = detail?.checklistKeys ?? [];
  const set = (k: string, patch: Partial<{ verdict: CheckVerdict; note: string }>) => setRows((r) => ({ ...r, [k]: { verdict: r[k]?.verdict ?? "", note: r[k]?.note ?? "", ...patch } }));
  const approvable = keys.length > 0 && canApprove(keys, rows);
  const pending = detail?.record?.status === "pending_review";

  async function decide(decision: "approved" | "rejected") {
    if (busy || sending.current || !detail) return;
    if (decision === "approved" && !approvable) return;
    if (decision === "rejected" && reason.trim().length < 10) return;
    sending.current = true;
    setBusy(true);
    setErr("");
    setFlagged([]);
    try {
      await reviewExperience(experienceId, { decision, reason, keys, rows });
      setDone(decision);
      onDone?.();
    } catch (e) {
      sending.current = false;
      logApiError("experience.review", e);
      const fe = experienceErrorOf(e);
      if (fe?.code === "verification_checklist_incomplete") {
        const d = (e as { data?: { detail?: { missing?: string[]; failed?: string[] } } }).data?.detail;
        setFlagged([...(d?.missing ?? []), ...(d?.failed ?? [])]);
        setErr(t("incomplete"));
      } else setErr(errDetail(e) || t("failed"));
    } finally {
      setBusy(false);
    }
  }

  if (done) return <Notice ok msg={done === "approved" ? t("approved") : t("rejected")} />;
  if (loadFailed) return <Notice ok={false} msg={t("loadFailed")} />;
  if (!detail) return <p className="ppanel__note">{t("loading")}</p>;
  return (
    <div className="xpr__detail" data-ai-target="callcenter:experience-review">
      <div className="xpr__cmp">
        <Side title={t("submitted")} it={detail.record} catName={catName} />
        <Side title={t("previous")} it={detail.previous} catName={catName} />
      </div>
      {detail.reviews.length ? (
        <ol className="xpr__past" aria-label={t("pastReviews")}>
          {detail.reviews.map((r) => (
            <li key={r.id || r.reviewedAt}>
              <span className="xpr__chip" data-s={r.decision}>
                {r.decision ? t(`decision.${r.decision}`) : "—"}
              </span>
              {r.reason ? <span>{r.reason}</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {!pending ? <Notice ok={false} msg={t("notPending")} /> : null}
      <ol className="xpr__list">
        {keys.map((k) => {
          const row = rows[k];
          const label = t.has(`check.${k}`) ? t(`check.${k}`) : k;
          return (
            <li key={k} data-verdict={row?.verdict || undefined} data-flag={flagged.includes(k) || undefined}>
              <fieldset disabled={!pending}>
                <legend>
                  {label}
                  {isMandatoryCheck(k) ? <span className="xpr__req"> · {t("mandatory")}</span> : null}
                </legend>
                <div className="xpr__verdicts" role="radiogroup" aria-label={label}>
                  {VERDICTS.map((v) => (
                    <label key={v} data-on={row?.verdict === v ? "" : undefined}>
                      <input type="radio" name={`v-${experienceId}-${k}`} value={v} checked={row?.verdict === v} onChange={() => set(k, { verdict: v })} disabled={v === "not_applicable" && isMandatoryCheck(k)} />
                      {t(`verdict.${v}`)}
                    </label>
                  ))}
                </div>
                <input className="xpr__note" value={row?.note ?? ""} onChange={(e) => set(k, { note: e.target.value })} placeholder={t("notePh")} aria-label={t("note", { item: label })} />
              </fieldset>
            </li>
          );
        })}
      </ol>
      <label className="xpr__reason">
        <span>{t("reason")}</span>
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPh")} disabled={!pending} />
      </label>
      {pending && !approvable ? <small className="xpr__hint">{t("approveNeeds")}</small> : null}
      {err ? <Notice ok={false} msg={err} /> : null}
      <div className="xpr__acts">
        <button type="button" className="btn btn--danger btn--sm" onClick={() => void decide("rejected")} disabled={!pending || busy || reason.trim().length < 10}>
          {t("reject")}
        </button>
        <button type="button" className="btn btn--pri btn--sm" onClick={() => void decide("approved")} disabled={!pending || busy || !approvable}>
          {t("approve")}
        </button>
      </div>
    </div>
  );
}
