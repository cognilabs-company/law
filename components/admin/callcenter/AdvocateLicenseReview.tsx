"use client";

import "./experienceReview.css";
import "./advocateLicense.css";
import { useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Notice } from "@/components/admin/AdminBits";
import { SxButton } from "@/components/admin/studio/sx/Button";
import { TextArea } from "@/components/admin/studio/sx/form/TextArea";
import DatePicker from "@/components/DatePicker";
import { IconCalendar, IconClose, IconEdit, IconFileText, IconPaperclip, IconPause, IconShieldCheck, IconSparkle, IconTrash, IconUpload } from "@/components/icons";
import QueueHead from "./QueueHead";
import QueueSeller from "./QueueSeller";
import ListPager from "@/components/ui/ListPager";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/portal/DataState";
import { dateOnly, fmtNum } from "@/lib/date";
import { errDetail, logApiError } from "@/lib/http";
import type { AiRisk } from "@/lib/services/achievements";
import type { ExperienceEvidence } from "@/lib/services/experience";
import {
  SUSPENSION_FILE_MAX,
  SUSPENSION_FILE_TYPES,
  archiveSuspension,
  closeLicenseRoom,
  createSuspension,
  downloadLicenseEvidence,
  downloadSuspensionEvidence,
  getLicenseForReview,
  licenseRecordOf,
  licenseFieldsOf,
  listLicenseQueue,
  openLicenseRoom,
  reviewLicense,
  updateSuspension,
  uploadSuspensionEvidence,
  type LicenseFields,
  type LicenseRecord,
  type Practice,
  type Suspension,
} from "@/lib/services/advocatePractice";
import { AiRiskPanel } from "./AchievementReview";
import { useReviewQueue } from "./useReviewQueue";
import VerifyReview, { type VerifySource } from "./VerifyReview";

// Final contract 2026-10-29 §9–12: the operator verifies an advocate's
// status certificate against the backend's checklist (the software's
// reading and risks are advice only), talks to the advocate in a protected
// review chat with calls, and records suspension periods with their
// documents. The backend recounts the tenure; every answer is shown as it
// comes.

const EVENTS = /^marketplace\.advocate_license_(submitted|queue_updated|reviewed)$/;
const STATUSES = ["pending_review", "changes_requested", "approved", "rejected", ""] as const;
const FIELDS: readonly (keyof LicenseFields)[] = ["holderName", "certificateNumber", "licenseNumber", "issuingAuthority", "statusStartedAt"];

// What software read from the certificate beside what the advocate typed;
// a value that differs is marked for the operator to compare.
function ReadValues({ extracted, record }: { extracted: Record<string, string>; record: LicenseRecord | null }): ReactElement | null {
  const t = useTranslations("callCenter.licenses");
  const tf = useTranslations("portal.practice.f");
  const locale = useLocale();
  const read = licenseFieldsOf(extracted);
  const shown = (k: keyof LicenseFields, v: string) => (k === "statusStartedAt" && v ? dateOnly(v, locale) : v);
  const rows = FIELDS.filter((k) => read[k]);
  if (!rows.length) return null;
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
      </div>
      <ul className="vrf__sig">
        {rows.map((k) => {
          const typed = record?.[k] ?? "";
          const same = !typed || read[k].trim().toLowerCase() === typed.trim().toLowerCase();
          return (
            <li key={k} data-tone={same ? "ok" : "warn"}>
              <span>
                <small>{tf(k)}</small>
                <b>{shown(k, read[k])}</b>
                {!same ? <small>{t("typed", { v: shown(k, typed) })}</small> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type SuspForm = { id: string; startedOn: string; endedOn: string; reason: string; files: ExperienceEvidence[]; uploading: number | null };

// Suspension periods: add one with its documents, close or reword an open
// one, or archive a wrong one. Every answer is the recounted practice.
function Suspensions({ sellerUserId, practice, onPractice }: { sellerUserId: string; practice: Practice | null; onPractice: (p: Practice) => void }): ReactElement {
  const t = useTranslations("callCenter.licenses.susp");
  const tp = useTranslations("portal.practice");
  const locale = useLocale();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<SuspForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const bad = form ? (!form.id && !form.startedOn) || form.reason.trim().length < 2 || (!!form.endedOn && !!form.startedOn && form.endedOn < form.startedOn) || form.uploading !== null : true;

  async function save() {
    if (!form || bad || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const p = form.id ? await updateSuspension(sellerUserId, form.id, form) : await createSuspension(sellerUserId, { ...form, evidenceIds: form.files.map((f) => f.id) });
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
  async function attach(file: File | undefined) {
    if (!file || !form) return;
    if (!(SUSPENSION_FILE_TYPES as readonly string[]).includes(file.type)) return setNote({ ok: false, msg: t("fileType") });
    if (file.size > SUSPENSION_FILE_MAX) return setNote({ ok: false, msg: t("fileBig") });
    setNote(null);
    setForm({ ...form, uploading: 0 });
    try {
      const ev = await uploadSuspensionEvidence(sellerUserId, file, (x) => setForm((f) => (f ? { ...f, uploading: x } : f)));
      setForm((f) => (f ? { ...f, uploading: null, files: [...f.files, ev] } : f));
    } catch (e) {
      logApiError("practice.suspension.evidence", e);
      setForm((f) => (f ? { ...f, uploading: null } : f));
      setNote({ ok: false, msg: errDetail(e) || t("fileFailed") });
    }
  }
  async function archive(s: Suspension) {
    const ok = await confirmDialog({
      title: t("archiveTitle"),
      text: t("archiveText", { period: [dateOnly(s.startedAt, locale), s.endedAt ? dateOnly(s.endedAt, locale) : tp("suspOpen")].join(" — ") }),
      confirmLabel: t("archive"),
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    setNote(null);
    try {
      onPractice(await archiveSuspension(sellerUserId, s.id));
      setNote({ ok: true, msg: t("archived") });
    } catch (e) {
      logApiError("practice.suspension.archive", e);
      setNote({ ok: false, msg: errDetail(e) || t("failed") });
    } finally {
      setBusy(false);
    }
  }
  const edit = (s: Suspension) => setForm({ id: s.id, startedOn: s.startedAt, endedOn: s.endedAt, reason: s.reason, files: [], uploading: null });

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
          <SxButton size="sm" variant="add" onClick={() => setForm({ id: "", startedOn: "", endedOn: "", reason: "", files: [], uploading: null })}>
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
                <b>
                  {[dateOnly(s.startedAt, locale), s.endedAt ? dateOnly(s.endedAt, locale) : tp("suspOpen")].join(" — ")}
                  {s.days !== null ? <em>{tp("daysN", { n: fmtNum(s.days, locale) })}</em> : null}
                </b>
                {s.reason ? <small>{s.reason}</small> : null}
                {s.evidenceIds.length ? (
                  <span className="alr__sfiles">
                    {s.evidenceIds.map((id, i) => (
                      <button key={id} type="button" className="vrf__file" onClick={() => void downloadSuspensionEvidence(sellerUserId, id, t("fileN", { n: i + 1 })).catch((e) => logApiError("practice.suspension.download", e))}>
                        <IconPaperclip aria-hidden="true" />
                        {t("fileN", { n: i + 1 })}
                      </button>
                    ))}
                  </span>
                ) : null}
              </span>
              {s.id && !form ? (
                <span className="alr__sacts2">
                  <button type="button" className="alr__sedit" onClick={() => edit(s)} aria-label={t("edit")} disabled={busy}>
                    <IconEdit aria-hidden="true" />
                  </button>
                  <button type="button" className="alr__sedit alr__sdel" onClick={() => void archive(s)} aria-label={t("archive")} disabled={busy}>
                    <IconTrash aria-hidden="true" />
                  </button>
                </span>
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
          {form.id ? null : (
            <div className="alr__f">
              <span>{t("files")}</span>
              <label className="alr__drop" data-busy={form.uploading !== null || undefined}>
                <IconUpload aria-hidden="true" />
                <b>{form.uploading !== null ? t("uploading", { n: Math.round(form.uploading * 100) }) : t("addFile")}</b>
                <small>{t("fileHint")}</small>
                <input type="file" accept={SUSPENSION_FILE_TYPES.join(",")} disabled={form.uploading !== null} onChange={(e) => (void attach(e.target.files?.[0]), (e.target.value = ""))} aria-label={t("addFile")} />
              </label>
              {form.files.length ? (
                <ul className="alr__flist">
                  {form.files.map((f) => (
                    <li key={f.id}>
                      <IconFileText aria-hidden="true" />
                      <span>{f.fileName || t("fileN", { n: 1 })}</span>
                      <button type="button" aria-label={t("removeFile", { name: f.fileName })} onClick={() => setForm({ ...form, files: form.files.filter((x) => x.id !== f.id) })}>
                        <IconClose />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
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
  const ts = useTranslations("portal.practice.status");
  const tv = useTranslations("callCenter.verify.field");
  const locale = useLocale();
  const [ai, setAi] = useState<{ risk: AiRisk; advisory: boolean } | null>(null);
  const [record, setRecord] = useState<LicenseRecord | null>(null);
  const [practice, setPractice] = useState<Practice | null>(null);
  const [seller, setSeller] = useState("");
  const source: VerifySource = {
    kind: "license",
    title: id,
    load: async (signal) => {
      const d = await getLicenseForReview(id, signal);
      setAi(d.ai ? { risk: d.ai, advisory: d.advisoryOnly } : null);
      setRecord(d.record);
      setPractice(d.practice);
      setSeller(d.record?.sellerUserId || d.practice?.sellerUserId || d.seller?.id || "");
      return {
        pending: d.record?.status === "pending_review",
        blocked: d.ai?.status === "running" ? t("aiPendingBlock") : "",
        isRevision: d.isRevision,
        record: d.record,
        evidence: d.evidence,
        diff: d.diff,
        checks: d.checks,
        reviews: d.reviews,
        room: d.room,
        seller: d.seller,
        history: d.history,
      };
    },
    review: (input) => reviewLicense(id, input),
    openRoom: () => openLicenseRoom(id),
    closeRoom: (room) => closeLicenseRoom(id, room),
    download: downloadLicenseEvidence,
    facts: (raw) => {
      const it = raw as LicenseRecord | null;
      if (!it) return [];
      return FIELDS.map((k) => ({ label: tf(k), value: k === "statusStartedAt" && it[k] ? dateOnly(it[k], locale) : it[k] }));
    },
    fieldLabel: (field) => (tv.has(field) ? tv(field) : tv("other")),
    historyLabel: (h) => (ts.has(h.status) ? ts(h.status) : ""),
    aside: () => (
      <>
        {ai ? <AiRiskPanel ai={ai.risk} advisory={ai.advisory} /> : null}
        {ai ? <ReadValues extracted={ai.risk.extracted} record={record} /> : null}
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
  const q = useReviewQueue<LicenseRecord>((o, signal) => listLicenseQueue(o, signal), { scope: "licenses", events: EVENTS, parse: licenseRecordOf, onCount });
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
                  <QueueSeller seller={it.seller} fallback={it.holderName || t("seller")} />
                  <span>{[it.issuingAuthority, it.statusStartedAt ? t("since", { date: dateOnly(it.statusStartedAt, locale) }) : ""].filter(Boolean).join(" · ")}</span>
                  <span>{ts.has(it.status) ? ts(it.status) : ""}</span>
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
