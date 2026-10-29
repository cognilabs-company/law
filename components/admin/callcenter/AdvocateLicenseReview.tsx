"use client";

import "./experienceReview.css";
import "./advocateLicense.css";
import { useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Notice } from "@/components/admin/AdminBits";
import { SxButton } from "@/components/admin/studio/sx/Button";
import { TextArea } from "@/components/admin/studio/sx/form/TextArea";
import DatePicker from "@/components/DatePicker";
import { IconCalendar, IconEdit, IconPause, IconShieldCheck, IconSparkle } from "@/components/icons";
import QueueHead from "./QueueHead";
import PersonName from "@/components/ui/PersonName";
import ListPager from "@/components/ui/ListPager";
import { EmptyState, ErrorState, Skeleton } from "@/components/portal/DataState";
import { dateOnly, fmtNum } from "@/lib/date";
import { errDetail, logApiError } from "@/lib/http";
import {
  createSuspension,
  downloadLicenseEvidence,
  getLicenseForReview,
  listLicenseQueue,
  reviewLicense,
  updateSuspension,
  type LicenseAi,
  type LicenseFields,
  type LicenseRecord,
  type Practice,
  type Suspension,
} from "@/lib/services/advocatePractice";
import { useReviewQueue } from "./useReviewQueue";
import VerifyReview, { type VerifySource } from "./VerifyReview";

// Contract 2026-10-29 §4.3–4.5: the operator verifies an advocate's
// status certificate against the backend's checklist (software suggestions
// are advice only), and records suspension periods. The backend recounts
// the tenure; the answer is shown as it comes.

const EVENTS = /^marketplace\.advocate_license_(submitted|queue_updated)$/;
const STATUSES = ["pending_review", "changes_requested", "approved", "rejected", ""] as const;
const FIELDS: readonly (keyof LicenseFields)[] = ["holderName", "certificateNumber", "licenseNumber", "issuingAuthority", "statusStartedAt"];

function LicenseAiPanel({ ai, record }: { ai: LicenseAi; record: LicenseRecord | null }): ReactElement {
  const t = useTranslations("callCenter.licenses");
  const tf = useTranslations("portal.practice.f");
  const locale = useLocale();
  const shown = (k: keyof LicenseFields, v: string) => (k === "statusStartedAt" && v ? dateOnly(v, locale) : v);
  return (
    <section className="vrf__ai" aria-label={t("aiTitle")}>
      <div className="vrf__ai-h">
        <span aria-hidden="true">
          <IconSparkle />
        </span>
        <div>
          <b>{t("aiTitle")}</b>
          <small>{t("aiAdvisory")}</small>
        </div>
        {ai.status === "processing" ? <span className="vrf__lvl">{t("aiRunning")}</span> : ai.status === "manual_review_required" ? <span className="vrf__lvl" data-l="medium">{t("aiManual")}</span> : null}
        {ai.confidence !== null ? <span className="vrf__lvl" data-l={ai.confidence >= 0.66 ? "low" : ai.confidence >= 0.33 ? "medium" : "high"}>{t("confidence", { n: fmtNum(Math.round(ai.confidence * 100), locale) })}</span> : null}
      </div>
      <ul className="vrf__sig">
        {FIELDS.map((k) => {
          const read = ai.extracted[k];
          if (!read) return null;
          const typed = record?.[k] ?? "";
          const same = !typed || read.trim().toLowerCase() === typed.trim().toLowerCase();
          return (
            <li key={k} data-tone={same ? "ok" : "warn"}>
              <span>
                <small>{tf(k)}</small>
                <b>{shown(k, read)}</b>
                {!same ? <small>{t("typed", { v: shown(k, typed) })}</small> : null}
              </span>
            </li>
          );
        })}
      </ul>
      {ai.notes.length ? (
        <ul className="vrf__notes" aria-label={t("notes")}>
          {ai.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

// Suspension periods: add one, or close / reword an open one. Every answer
// is the recounted practice, shown as it is.
function Suspensions({ sellerUserId, practice, onPractice }: { sellerUserId: string; practice: Practice | null; onPractice: (p: Practice) => void }): ReactElement {
  const t = useTranslations("callCenter.licenses.susp");
  const tp = useTranslations("portal.practice");
  const locale = useLocale();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<{ id: string; startedOn: string; endedOn: string; reason: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const bad = form ? (!form.id && !form.startedOn) || form.reason.trim().length < 2 || (!!form.endedOn && !!form.startedOn && form.endedOn < form.startedOn) : true;

  async function save() {
    if (!form || bad || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const p = form.id ? await updateSuspension(sellerUserId, form.id, form) : await createSuspension(sellerUserId, form);
      onPractice(p);
      setForm(null);
      setNote({ ok: true, msg: t("saved") });
    } catch (e) {
      logApiError("practice.suspension", e);
      setNote({ ok: false, msg: errDetail(e) || t("failed") });
    } finally {
      setBusy(false);
    }
  }
  const edit = (s: Suspension) => setForm({ id: s.id, startedOn: s.startedAt, endedOn: s.endedAt, reason: s.reason });

  return (
    <section className="alr__susp" aria-labelledby={`alr-s-${sellerUserId}`}>
      <div className="alr__susp-h">
        <span className="alr__susp-ic" aria-hidden="true">
          <IconPause />
        </span>
        <span>
          <b id={`alr-s-${sellerUserId}`}>{t("title")}</b>
          <small>{t("lead")}</small>
        </span>
        {!form ? (
          <SxButton size="sm" variant="add" onClick={() => setForm({ id: "", startedOn: "", endedOn: "", reason: "" })}>
            {t("add")}
          </SxButton>
        ) : null}
      </div>
      {practice ? (
        <dl className="alr__tenure">
          <div>
            <dt>{tp("activeYears")}</dt>
            <dd>{practice.activeYears === null ? "—" : fmtNum(practice.activeYears, locale, 2)}</dd>
          </div>
          <div>
            <dt>{tp("activeDays")}</dt>
            <dd>{practice.activeDays === null ? "—" : fmtNum(practice.activeDays, locale)}</dd>
          </div>
          <div>
            <dt>{tp("suspendedDays")}</dt>
            <dd>{practice.suspendedDays === null ? "—" : fmtNum(practice.suspendedDays, locale)}</dd>
          </div>
        </dl>
      ) : null}
      {practice?.suspensions.length ? (
        <ul className="alr__slist">
          {practice.suspensions.map((s) => (
            <li key={s.id || s.startedAt} data-open={!s.endedAt || undefined}>
              <IconCalendar aria-hidden="true" />
              <span>
                <b>{[dateOnly(s.startedAt, locale), s.endedAt ? dateOnly(s.endedAt, locale) : tp("suspOpen")].join(" — ")}</b>
                {s.reason ? <small>{s.reason}</small> : null}
              </span>
              {s.id && !form ? (
                <button type="button" className="alr__sedit" onClick={() => edit(s)} aria-label={t("edit")}>
                  <IconEdit aria-hidden="true" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="vrf__muted">{t("none")}</p>
      )}
      {form ? (
        <div className="alr__sform">
          <div className="alr__two">
            <div className="alr__f">
              <span>{t("from")}</span>
              {form.id ? <b className="alr__ro">{dateOnly(form.startedOn, locale)}</b> : <DatePicker value={form.startedOn} max={today} onChange={(v) => setForm({ ...form, startedOn: v })} placeholder={t("pick")} ariaLabel={t("from")} />}
            </div>
            <div className="alr__f">
              <span>{t("to")}</span>
              <DatePicker value={form.endedOn} min={form.startedOn || undefined} onChange={(v) => setForm({ ...form, endedOn: v })} placeholder={t("openEnded")} ariaLabel={t("to")} />
            </div>
          </div>
          <label className="alr__f">
            <span>{t("reason")}</span>
            <TextArea value={form.reason} onChange={(v) => setForm({ ...form, reason: v })} minRows={2} maxLength={2000} counter placeholder={t("reasonPh")} />
          </label>
          <div className="alr__sacts">
            <SxButton size="sm" variant="secondary" onClick={() => setForm(null)} disabled={busy}>
              {t("cancel")}
            </SxButton>
            <SxButton size="sm" variant="primary" busy={busy} disabled={bad} onClick={() => void save()}>
              {form.id ? t("update") : t("save")}
            </SxButton>
          </div>
        </div>
      ) : null}
      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
    </section>
  );
}

function LicenseReview({ id, onDone }: { id: string; onDone: () => void }): ReactElement {
  const t = useTranslations("callCenter.licenses");
  const tf = useTranslations("portal.practice.f");
  const tv = useTranslations("callCenter.verify.field");
  const locale = useLocale();
  const [ai, setAi] = useState<LicenseAi | null>(null);
  const [record, setRecord] = useState<LicenseRecord | null>(null);
  const [practice, setPractice] = useState<Practice | null>(null);
  const [seller, setSeller] = useState("");
  const source: VerifySource = {
    kind: "license",
    title: id,
    load: async (signal) => {
      const d = await getLicenseForReview(id, signal);
      setAi(d.ai);
      setRecord(d.record);
      setPractice(d.practice);
      setSeller(d.record?.sellerUserId || d.seller?.id || "");
      return {
        pending: d.record?.status === "pending_review",
        blocked: d.ai?.status === "processing" ? t("aiPendingBlock") : "",
        isRevision: d.isRevision,
        record: d.record,
        evidence: d.record?.evidence ?? [],
        diff: d.diff,
        checks: d.checks,
        reviews: d.reviews,
        room: null,
        seller: d.seller,
      };
    },
    review: (input) => reviewLicense(id, input),
    download: downloadLicenseEvidence,
    facts: (raw) => {
      const it = raw as LicenseRecord | null;
      if (!it) return [];
      return FIELDS.map((k) => ({ label: tf(k), value: k === "statusStartedAt" && it[k] ? dateOnly(it[k], locale) : it[k] }));
    },
    fieldLabel: (field) => (tv.has(field) ? tv(field) : tv("other")),
    aside: () => (
      <>
        {ai ? <LicenseAiPanel ai={ai} record={record} /> : null}
        {seller ? <Suspensions sellerUserId={seller} practice={practice} onPractice={setPractice} /> : null}
      </>
    ),
  };
  return <VerifyReview source={source} onDone={onDone} />;
}

export function AdvocateLicenseQueue({ onCount }: { onCount?: (n: number) => void }): ReactElement | null {
  const t = useTranslations("callCenter.licenses");
  const ts = useTranslations("portal.practice.status");
  const locale = useLocale();
  const q = useReviewQueue<LicenseRecord>((o, signal) => listLicenseQueue(o, signal), { scope: "licenses", events: EVENTS, onCount });
  const [open, setOpen] = useState("");

  if (q.denied) return null;
  const { items } = q;
  return (
    <section className="ppanel xpr esc" data-ai-target="callcenter:licenses">
      <QueueHead
        icon={IconShieldCheck}
        title={t("title")}
        lead={t("lead")}
        count={items && !q.failed ? q.total : null}
        refreshLabel={t("refresh")}
        onRefresh={() => void q.reload()}
        refreshing={q.loading}
        aiBase="call_center.licenses"
        statuses={STATUSES.map((s) => ({ value: s, label: s ? ts(s) : t("all") }))}
        status={q.status}
        onStatus={q.setStatus}
        statusLabel={t("filter")}
      />
      {q.failed ? (
        <ErrorState title={t("loadFailed")} onRetry={() => void q.reload()} compact />
      ) : !items ? (
        <Skeleton rows={3} />
      ) : !items.length ? (
        <EmptyState size="sm" icon={<IconShieldCheck />} title={t("empty")} />
      ) : (
        <>
          <ul className="xpr__queue">
            {items.map((it) => (
              <li key={it.id} data-open={open === it.id || undefined}>
                <button type="button" className="xpr__qrow" onClick={() => setOpen(open === it.id ? "" : it.id)} aria-expanded={open === it.id}>
                  <b>{it.sellerName || it.sellerUserId ? <PersonName id={it.sellerUserId} name={it.sellerName || it.holderName} /> : it.holderName || t("seller")}</b>
                  <span>{[it.issuingAuthority, it.statusStartedAt ? t("since", { date: dateOnly(it.statusStartedAt, locale) }) : ""].filter(Boolean).join(" · ")}</span>
                  <span>{ts(it.status)}</span>
                  <time>{it.submittedAt ? dateOnly(it.submittedAt, locale) : ""}</time>
                </button>
                {open === it.id ? (
                  <LicenseReview
                    id={it.id}
                    onDone={() => {
                      setOpen("");
                      void q.reload();
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
          <ListPager count={items.length} total={q.total} step={50} onMore={() => void q.more()} loading={q.loading} />
        </>
      )}
    </section>
  );
}
