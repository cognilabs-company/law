"use client";

import "./experience.css";
import "./practice.css";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import DatePicker from "@/components/DatePicker";
import FieldError from "@/components/ui/FieldError";
import { IconAlert, IconBuilding, IconCalendar, IconCheck, IconClock, IconFileText, IconHourglass, IconLock, IconPause, IconRefresh, IconScale, IconShieldCheck, IconSparkle, IconUpload, IconUser } from "@/components/icons";
import { dateOnly, fmtNum } from "@/lib/date";
import { backoffMs, errDetail, isAborted, isForbidden, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { onUserSocketResync, subscribeUserEvents } from "@/lib/userSocket";
import {
  downloadLicenseEvidence,
  getLicenseEvidence,
  getLicenseConfig,
  getMyPractice,
  licenseAnalyzedOf,
  licenseErrorOf,
  licenseIssue,
  submitLicense,
  uploadLicenseEvidence,
  type LicenseEvidence,
  type LicenseFields,
  type Practice,
} from "@/lib/services/advocatePractice";
import { acceptOf, fileIssue, type EvidenceRules } from "@/lib/services/achievements";

// "Advokatlik amaliyoti" (contract 2026-10-29 §4): the advocate's verified
// status and tenure exactly as the backend counts them — active years and
// days, suspended days and periods, the legal basis — and the certificate
// flow: upload, software reads it and suggests the values, the advocate
// checks and submits, an operator verifies. Nothing here counts the tenure.

const KEYS: readonly (keyof LicenseFields)[] = ["holderName", "certificateNumber", "licenseNumber", "issuingAuthority", "statusStartedAt"];
const FIELD_OF: Record<keyof LicenseFields, string> = { holderName: "holder_name", certificateNumber: "certificate_number", licenseNumber: "license_number", issuingAuthority: "issuing_authority", statusStartedAt: "advocate_status_started_at" };
const EVENTS = /^marketplace\.(advocate_license_reviewed|advocate_practice_updated|advocate_license_evidence_analyzed)$/;
const blank = (): LicenseFields => ({ holderName: "", certificateNumber: "", licenseNumber: "", issuingAuthority: "", statusStartedAt: "" });

type Flow = { evidence: LicenseEvidence | null; uploading: boolean; progress: number; fileErr: string; fields: LicenseFields; suggested: Partial<Record<keyof LicenseFields, boolean>> };

export default function AdvocatePracticePanel(): ReactElement | null {
  const t = useTranslations("portal.practice");
  const locale = useLocale();
  const [p, setP] = useState<Practice | null>(null);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [rules, setRules] = useState<EvidenceRules | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [formNote, setFormNote] = useState("");
  const [fieldErr, setFieldErr] = useState<{ field: string; msg: string } | null>(null);
  const [pollKick, setPollKick] = useState(0);
  const flowRef = useRef<Flow | null>(null);
  useEffect(() => {
    flowRef.current = flow;
  });

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setP(await getMyPractice(signal));
      setFailed(false);
    } catch (e) {
      if (isAborted(e)) return;
      if (isForbidden(e)) return setDenied(true);
      logApiError("practice.load", e);
      setFailed(true);
    }
  }, []);

  // The certificate file rules (§9), for the picker and the checks.
  useEffect(() => {
    const ctl = new AbortController();
    getLicenseConfig(ctl.signal).then(setRules, (e) => {
      if (!isAborted(e)) logApiError("practice.config", e);
    });
    return () => ctl.abort();
  }, []);

  // Software's suggestions fill only the fields still empty, and say so.
  const applyEvidence = useCallback((ev: LicenseEvidence) => {
    setFlow((f) => {
      if (!f) return f;
      const fields = { ...f.fields };
      const suggested = { ...f.suggested };
      if (ev.state !== "processing") {
        for (const k of KEYS) {
          const v = ev.suggested[k];
          if (v && !fields[k].trim()) {
            fields[k] = v;
            suggested[k] = true;
          }
        }
      }
      return { ...f, evidence: ev, fields, suggested };
    });
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    void Promise.resolve().then(() => load(ctl.signal));
    let timer = 0;
    const off = subscribeUserEvents((e) => {
      const ev = String(e.event ?? "");
      if (!EVENTS.test(ev)) return;
      if (ev.endsWith("evidence_analyzed")) {
        // The event carries the reading (§9): patch the card at once; the
        // GET stays only for recovery.
        const got = licenseAnalyzedOf(e);
        const cur = flowRef.current?.evidence;
        if (got && cur && got.id === cur.id) applyEvidence({ ...cur, state: got.state, suggested: got.suggested });
        else setPollKick((n) => n + 1);
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), 400);
      toast(t(ev.endsWith("reviewed") ? "live.reviewed" : "live.updated"), { tone: "info" });
    });
    const offSync = onUserSocketResync(() => {
      void load();
      setPollKick((n) => n + 1);
    });
    return () => {
      ctl.abort();
      window.clearTimeout(timer);
      off();
      offSync();
    };
  }, [load, t, applyEvidence]);

  // While software reads the file: ask again with growing pauses (or at
  // once when the "analyzed" event arrives); stop when done or closed.
  const evId = flow?.evidence?.id ?? "";
  const reading = flow?.evidence?.state === "processing";
  useEffect(() => {
    if (!evId || !reading) return;
    const ctl = new AbortController();
    let attempt = 0;
    let timer = 0;
    const tick = async () => {
      try {
        const ev = await getLicenseEvidence(evId, ctl.signal);
        if (ctl.signal.aborted) return;
        applyEvidence(ev);
        if (ev.state === "processing") timer = window.setTimeout(tick, backoffMs(++attempt, 1500, 15000));
      } catch (e) {
        if (isAborted(e)) return;
        logApiError("practice.evidence", e);
        timer = window.setTimeout(tick, backoffMs(++attempt, 3000, 30000));
      }
    };
    timer = window.setTimeout(tick, pollKick ? 0 : 1500);
    return () => {
      ctl.abort();
      window.clearTimeout(timer);
    };
  }, [evId, reading, pollKick, applyEvidence]);

  async function upload(file: File | undefined) {
    if (!file || !flow || flow.uploading) return;
    const bad = rules ? fileIssue(file, rules) : "";
    if (bad) return setFlow({ ...flow, fileErr: bad === "type" ? t("fileType") : t("fileBig", { mb: fmtNum((rules?.maxBytes ?? 0) / (1024 * 1024), locale, 1) }) });
    setFlow({ ...flow, uploading: true, progress: 0, fileErr: "", evidence: null, suggested: {} });
    setFieldErr(null);
    try {
      const ev = await uploadLicenseEvidence(file, (x) => setFlow((f) => (f ? { ...f, progress: x } : f)));
      setFlow((f) => (f ? { ...f, uploading: false, progress: 1 } : f));
      applyEvidence(ev);
    } catch (e) {
      logApiError("practice.upload", e);
      const fe = licenseErrorOf(e);
      setFlow((f) => (f ? { ...f, uploading: false, fileErr: fe && t.has(`err.${fe.code}`) ? t(`err.${fe.code}`) : errDetail(e) || t("fileFailed") } : f));
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const issue = flow ? licenseIssue({ ...flow.fields, evidenceId: flow.evidence?.id ?? "", state: flow.evidence?.state ?? "" }, today) : "";

  async function submit() {
    if (!flow?.evidence || issue || busy) return;
    setBusy(true);
    setFormNote("");
    setFieldErr(null);
    try {
      // After a refusal the new verification names the last one (§9).
      const again = p?.latest && (p.latest.status === "rejected" || p.latest.status === "changes_requested") ? p.latest.id : undefined;
      await submitLicense({ sourceId: again, evidenceId: flow.evidence.id, ...flow.fields });
      setFlow(null);
      setNote({ ok: true, msg: t("sent") });
      await load();
    } catch (e) {
      logApiError("practice.submit", e);
      const fe = licenseErrorOf(e);
      const msg = fe && t.has(`err.${fe.code}`) ? t(`err.${fe.code}`) : errDetail(e) || t("failed");
      if (fe && fe.field !== "form" && fe.field !== "processing") setFieldErr({ field: fe.field, msg });
      else setFormNote(msg);
      if (fe?.field === "processing") setPollKick((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  const pending = p?.verification === "pending_review";
  const verified = p?.verification === "approved";
  const set = (k: keyof LicenseFields, v: string) => setFlow((f) => (f ? { ...f, fields: { ...f.fields, [k]: v }, suggested: { ...f.suggested, [k]: false } } : f));
  const err = (field: string) => (fieldErr?.field === field ? fieldErr.msg : tried && issue === field ? t(`issue.${issue}`) : "");
  const n = (v: number | null, digits = 0) => (v === null ? "—" : fmtNum(v, locale, digits));
  const start = () => {
    setTried(false);
    setFormNote("");
    setFieldErr(null);
    setNote(null);
    setFlow({ evidence: null, uploading: false, progress: 0, fileErr: "", fields: blank(), suggested: {} });
  };

  return (
    <section className="ppanel exp prc" aria-labelledby="prc-title" data-ai-target="profile:advocate-practice">
      <div className="ppanel__h exp__h">
        <b className="ppanel__t" id="prc-title">
          <span className="pico">
            <IconScale />
          </span>
          {t("title")}
        </b>
        {p ? (
          <span className="prc__st" data-s={p.verification}>
            {p.verification === "approved" ? <IconShieldCheck aria-hidden="true" /> : p.verification === "pending_review" ? <IconHourglass aria-hidden="true" /> : <IconAlert aria-hidden="true" />}
            {t(`status.${p.verification}`)}
          </span>
        ) : null}
      </div>
      <p className="exp__lead">{t("lead")}</p>
      {denied ? (
        <p className="ach__denied" role="note">
          <IconLock aria-hidden="true" />
          {t("advocateOnly")}
        </p>
      ) : null}
      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
      {failed ? (
        <div className="prc__fail">
          <Notice ok={false} msg={t("loadFailed")} />
          <button type="button" className="btn btn--line btn--sm" onClick={() => void load()}>
            <IconRefresh aria-hidden="true" />
            {t("retry")}
          </button>
        </div>
      ) : null}
      {!p && !failed && !denied ? <div className="exp__card exp__card--ghost" aria-hidden="true" /> : null}
      {p ? (
        <>
          <div className="prc__tenure" role="group" aria-label={t("tenure")}>
            <div className="prc__big">
              <small>{t("activeYears")}</small>
              <b className="sx-num">{n(p.activeYears, 2)}</b>
            </div>
            <div>
              <small>{t("activeDays")}</small>
              <b className="sx-num">{n(p.activeDays)}</b>
            </div>
            <div data-tone={p.suspendedDays ? "warn" : undefined}>
              <small>{t("suspendedDays")}</small>
              <b className="sx-num">{n(p.suspendedDays)}</b>
            </div>
          </div>
          <dl className="prc__facts">
            {p.statusStartedAt ? (
              <div>
                <dt>
                  <IconCalendar aria-hidden="true" />
                  {t("startedAt")}
                </dt>
                <dd>{dateOnly(p.statusStartedAt, locale)}</dd>
              </div>
            ) : null}
            {p.verifiedAt ? (
              <div>
                <dt>
                  <IconShieldCheck aria-hidden="true" />
                  {t("verifiedAt")}
                </dt>
                <dd>{dateOnly(p.verifiedAt, locale)}</dd>
              </div>
            ) : null}
            {p.certificateNumber ? (
              <div>
                <dt>
                  <IconFileText aria-hidden="true" />
                  {t("f.certificateNumber")}
                </dt>
                <dd>{p.certificateNumber}</dd>
              </div>
            ) : null}
            {p.issuingAuthority ? (
              <div>
                <dt>
                  <IconBuilding aria-hidden="true" />
                  {t("f.issuingAuthority")}
                </dt>
                <dd>{p.issuingAuthority}</dd>
              </div>
            ) : null}
          </dl>
          {p.suspensions.length ? (
            <div className="prc__susp">
              <b>
                <IconPause aria-hidden="true" />
                {t("suspensions")}
              </b>
              <ul>
                {p.suspensions.map((s) => (
                  <li key={s.id || s.startedAt} data-open={!s.endedAt || undefined}>
                    <span>{[dateOnly(s.startedAt, locale), s.endedAt ? dateOnly(s.endedAt, locale) : t("suspOpen")].join(" — ")}</span>
                    {s.days !== null ? <em>{t("daysN", { n: fmtNum(s.days, locale) })}</em> : null}
                    {s.reason ? <small>{s.reason}</small> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {p.legalBasis.text ? (
            <p className="prc__basis">
              <IconScale aria-hidden="true" />
              <span>
                <b>{t("legalBasis")}</b>
                {p.legalBasis.text}
                {p.legalBasis.suspensionExcluded ? <small>{t("suspExcluded")}</small> : null}
              </span>
            </p>
          ) : null}
          {(p.verification === "rejected" || p.verification === "changes_requested") && p.latest?.reason ? <p className="exp__note" data-tone="bad">{t("reason", { text: p.latest.reason })}</p> : null}
          <div className="prc__acts">
            {pending ? (
              <p className="prc__wait">
                <IconClock aria-hidden="true" />
                {t("pendingNote")}
              </p>
            ) : (
              <button type="button" className={verified ? "btn btn--line btn--sm" : "btn btn--pri btn--sm"} onClick={start} disabled={!!flow}>
                <IconUpload aria-hidden="true" />
                {verified ? t("reupload") : p.verification === "not_submitted" ? t("upload") : t("resubmit")}
              </button>
            )}
            <small>{t("onlyBackend")}</small>
          </div>
        </>
      ) : null}

      <Modal
        open={!!flow}
        onClose={() => (busy ? undefined : setFlow(null))}
        title={t("flowTitle")}
        description={t("flowNote")}
        icon={<IconShieldCheck />}
        size="lg"
        busy={busy}
        dirty={!!flow?.evidence}
        footer={
          <>
            {tried && issue && !err(FIELD_OF[issue as keyof LicenseFields] ?? issue) ? (
              <small className="exp__issue" role="alert">
                {t(`issue.${issue}`)}
              </small>
            ) : null}
            <button type="button" className="btn btn--line" onClick={() => setFlow(null)} disabled={busy}>
              {t("cancel")}
            </button>
            <button type="submit" form="prc-form" className="btn btn--pri" disabled={busy || reading || !flow?.evidence}>
              {busy ? t("sending") : t("submit")}
            </button>
          </>
        }
      >
        {flow ? (
          <form
            id="prc-form"
            className="exp__form"
            onSubmit={(e) => {
              e.preventDefault();
              setTried(true);
              void submit();
            }}
            noValidate
          >
            {formNote ? <Notice ok={false} msg={formNote} /> : null}
            <fieldset className="exp__sec" data-done={(!!flow.evidence && !reading) || undefined}>
              <legend className="exp__legend">
                <span className="exp__n" data-done={(!!flow.evidence && !reading) || undefined} aria-hidden="true">
                  {flow.evidence && !reading ? <IconCheck /> : <IconUpload />}
                </span>
                <span className="exp__lt">
                  <b>{t("secFile")}</b>
                  <small>{t("secFileHint")}</small>
                </span>
              </legend>
              <div className="exp__drop" data-busy={flow.uploading || undefined} data-bad={err("evidence") ? true : undefined}>
                <label>
                  <span className="exp__drop-ic" aria-hidden="true">
                    <IconUpload />
                  </span>
                  <b>{flow.uploading ? t("uploading", { n: Math.round(flow.progress * 100) }) : flow.evidence ? t("replaceFile") : t("pickFile")}</b>
                  {rules ? <small>{[rules.extensions.map((x) => x.toUpperCase()).join(", "), rules.maxBytes > 0 ? t("upToMb", { mb: fmtNum(rules.maxBytes / (1024 * 1024), locale, 1) }) : ""].filter(Boolean).join(" · ")}</small> : null}
                  <input type="file" accept={rules ? acceptOf(rules) || undefined : undefined} disabled={flow.uploading} onChange={(e) => (void upload(e.target.files?.[0]), (e.target.value = ""))} aria-label={t("pickFile")} />
                </label>
                {flow.uploading ? (
                  <i className="ach__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(flow.progress * 100)} aria-label={t("pickFile")}>
                    <b style={{ width: `${Math.round(flow.progress * 100)}%` }} />
                  </i>
                ) : null}
                {flow.evidence ? (
                  <button type="button" className="prc__file" data-s={flow.evidence.state} onClick={() => void downloadLicenseEvidence(flow.evidence!).catch((e) => logApiError("practice.download", e))}>
                    <span className="exp__file-ic" aria-hidden="true">
                      {reading ? <IconHourglass /> : <IconFileText />}
                    </span>
                    <span>
                      <b>{flow.evidence.fileName || t("file")}</b>
                      <small>{t(`ev.${flow.evidence.state}`)}</small>
                    </span>
                  </button>
                ) : null}
                {flow.fileErr ? <p className="field-err" role="alert">{flow.fileErr}</p> : null}
              </div>
              <FieldError id="prc-err-evidence" msg={err("evidence")} />
            </fieldset>

            <fieldset className="exp__sec" disabled={!flow.evidence || reading}>
              <legend className="exp__legend">
                <span className="exp__n" aria-hidden="true">
                  <IconUser />
                </span>
                <span className="exp__lt">
                  <b>{t("secData")}</b>
                  <small>{reading ? t("secDataWait") : t("secDataHint")}</small>
                </span>
              </legend>
              {KEYS.map((k) => {
                const field = FIELD_OF[k];
                const msg = err(field);
                const tag = flow.suggested[k] ? (
                  <em className="prc__ai">
                    <IconSparkle aria-hidden="true" />
                    {t("aiSuggestion")}
                  </em>
                ) : null;
                if (k === "statusStartedAt")
                  return (
                    <div key={k} className="exp__f" data-bad={msg ? true : undefined}>
                      <span>
                        {t(`f.${k}`)} {tag}
                      </span>
                      <DatePicker value={flow.fields[k]} max={today} onChange={(v) => set(k, v)} placeholder={t("pickDate")} ariaLabel={t(`f.${k}`)} disabled={!flow.evidence || reading} />
                      <FieldError id={`prc-err-${field}`} msg={msg} />
                    </div>
                  );
                return (
                  <label key={k} className="exp__f">
                    <span>
                      {t(`f.${k}`)} {k === "licenseNumber" ? <em className="exp__opt-tag">{t("optional")}</em> : null} {tag}
                    </span>
                    <span className="exp__in">
                      {k === "issuingAuthority" ? <IconBuilding aria-hidden="true" /> : k === "holderName" ? <IconUser aria-hidden="true" /> : <IconFileText aria-hidden="true" />}
                      <input value={flow.fields[k]} maxLength={k === "certificateNumber" || k === "licenseNumber" ? 120 : 255} onChange={(e) => set(k, e.target.value)} aria-invalid={msg ? true : undefined} aria-describedby={msg ? `prc-err-${field}` : undefined} />
                    </span>
                    <FieldError id={`prc-err-${field}`} msg={msg} />
                  </label>
                );
              })}
            </fieldset>
          </form>
        ) : null}
      </Modal>
    </section>
  );
}
