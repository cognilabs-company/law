"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { dateOnly, fmtNum } from "@/lib/date";
import { errDetail, logApiError } from "@/lib/http";
import type { ExperienceEvidence } from "@/lib/services/experience";
import {
  SUSPENSION_FILE_MAX,
  SUSPENSION_FILE_TYPES,
  archiveSuspension,
  createSuspension,
  downloadSuspensionEvidence,
  updateSuspension,
  uploadSuspensionEvidence,
  type Practice,
  type Suspension,
} from "@/lib/services/advocatePractice";
import { Field, Note } from "../../panel/bits";
import { IcClock, IcClose, IcDoc } from "../../icons";
import DatePicker from "@/components/DatePicker";

type SuspForm = { id: string; startedOn: string; endedOn: string; reason: string; files: ExperienceEvidence[]; uploading: number | null; today: string };

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function VerifySuspensions({ sellerUserId, practice, onPractice, onDirty }: { sellerUserId: string; practice: Practice | null; onPractice: (p: Practice) => void; onDirty: () => void }) {
  const t = useTranslations("callCenter.licenses.susp");
  const tp = useTranslations("portal.practice");
  const tv = useTranslations("admin.ccx.verify");
  const locale = useLocale();
  const uid = useId();
  const [form, setForm] = useState<SuspForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [confirm, setConfirm] = useState("");
  const bad = !form || (!form.id && (!form.startedOn || form.startedOn > form.today)) || form.reason.trim().length < 2 || (!!form.endedOn && !!form.startedOn && form.endedOn < form.startedOn) || form.uploading !== null;
  const period = (s: Suspension) => [dateOnly(s.startedAt, locale), s.endedAt ? dateOnly(s.endedAt, locale) : tp("suspOpen")].join(" — ");

  const patch = (p: Partial<SuspForm>) => {
    setForm((f) => (f ? { ...f, ...p } : f));
    onDirty();
  };

  const start = () => {
    setNote(null);
    setConfirm("");
    setForm({ id: "", startedOn: "", endedOn: "", reason: "", files: [], uploading: null, today: todayIso() });
  };

  const edit = (s: Suspension) => {
    setNote(null);
    setConfirm("");
    setForm({ id: s.id, startedOn: s.startedAt, endedOn: s.endedAt, reason: s.reason, files: [], uploading: null, today: todayIso() });
  };

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
    if (!(SUSPENSION_FILE_TYPES as readonly string[]).includes(file.type)) {
      setNote({ ok: false, msg: t("fileType") });
      return;
    }
    if (file.size > SUSPENSION_FILE_MAX) {
      setNote({ ok: false, msg: t("fileBig") });
      return;
    }
    setNote(null);
    onDirty();
    setForm((f) => (f ? { ...f, uploading: 0 } : f));
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
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      onPractice(await archiveSuspension(sellerUserId, s.id));
      setConfirm("");
      setNote({ ok: true, msg: t("archived") });
    } catch (e) {
      logApiError("practice.suspension.archive", e);
      setNote({ ok: false, msg: errDetail(e) || t("failed") });
    } finally {
      setBusy(false);
    }
  }

  const download = (id: string, name: string) => {
    void downloadSuspensionEvidence(sellerUserId, id, name).catch((e) => logApiError("practice.suspension.download", e));
  };

  const up = form?.uploading ?? null;

  return (
    <section className="opx-psec opx-vrf-susp" aria-labelledby={`${uid}-h`}>
      <div className="opx-vrf-shead">
        <h3 id={`${uid}-h`}>
          <IcClock size={17} />
          {t("title")}
        </h3>
        {!form ? (
          <button type="button" className="opx-pbtn opx-vrf-sm" onClick={start} disabled={busy}>
            {t("add")}
          </button>
        ) : null}
      </div>
      <p className="opx-vrf-muted">{t("lead")}</p>
      {practice ? (
        <dl className="opx-vrf-tenure">
          <div>
            <dt>{tp("activeYears")}</dt>
            <dd className="opx-num">{practice.activeYears === null ? "—" : fmtNum(practice.activeYears, locale, 2)}</dd>
          </div>
          <div>
            <dt>{tp("activeDays")}</dt>
            <dd className="opx-num">{practice.activeDays === null ? "—" : fmtNum(practice.activeDays, locale)}</dd>
          </div>
          <div>
            <dt>{tp("suspendedDays")}</dt>
            <dd className="opx-num">{practice.suspendedDays === null ? "—" : fmtNum(practice.suspendedDays, locale)}</dd>
          </div>
        </dl>
      ) : null}
      {practice?.suspensions.length ? (
        <ul className="opx-vrf-slist">
          {practice.suspensions.map((s) => (
            <li key={s.id || s.startedAt} data-open={!s.endedAt || undefined}>
              <div className="opx-vrf-slist__row">
                <span className="opx-vrf-slist__ic" aria-hidden="true">
                  <IcClock size={16} />
                </span>
                <span className="opx-vrf-slist__txt">
                  <b className="opx-num">
                    {period(s)}
                    {s.days !== null ? <em>{tv("daysN", { n: s.days })}</em> : null}
                  </b>
                  {s.reason ? <small>{s.reason}</small> : null}
                  {s.evidenceIds.length ? (
                    <span className="opx-files">
                      {s.evidenceIds.map((eid, i) => (
                        <button key={eid} type="button" className="opx-file opx-vrf-file--sm" onClick={() => download(eid, t("fileN", { n: i + 1 }))}>
                          <IcDoc size={15} />
                          <span>{t("fileN", { n: i + 1 })}</span>
                        </button>
                      ))}
                    </span>
                  ) : null}
                </span>
                {s.id && !form && confirm !== s.id ? (
                  <span className="opx-vrf-slist__acts">
                    <button type="button" className="opx-pbtn opx-pbtn--ghost opx-vrf-sm" onClick={() => edit(s)} disabled={busy}>
                      {t("edit")}
                    </button>
                    <button type="button" className="opx-pbtn opx-pbtn--rose opx-vrf-sm" onClick={() => setConfirm(s.id)} disabled={busy}>
                      {t("archive")}
                    </button>
                  </span>
                ) : null}
              </div>
              {confirm === s.id ? (
                <div className="opx-vrf-confirm" role="group" aria-labelledby={`${uid}-c-${s.id}`}>
                  <b id={`${uid}-c-${s.id}`}>{t("archiveTitle")}</b>
                  <p>{t("archiveText", { period: period(s) })}</p>
                  <span className="opx-vrf-confirm__acts">
                    <button type="button" className="opx-pbtn opx-vrf-sm" onClick={() => setConfirm("")} disabled={busy}>
                      {t("cancel")}
                    </button>
                    <button type="button" className="opx-pbtn opx-pbtn--main is-danger opx-vrf-sm" onClick={() => void archive(s)} disabled={busy} aria-busy={busy}>
                      {t("archive")}
                    </button>
                  </span>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="opx-pnone">{t("none")}</p>
      )}
      {form ? (
        <div className="opx-vrf-sform">
          <div className="opx-pgrid2">
            <div className="opx-field">
              <span className="opx-field__cap">
                {t("from")}
                {form.id ? null : <i aria-hidden="true">*</i>}
              </span>
              {form.id ? (
                <b className="opx-vrf-ro opx-num">
                  {dateOnly(form.startedOn, locale)}
                </b>
              ) : (
                <DatePicker value={form.startedOn} max={form.today} placeholder={t("from")} ariaLabel={t("from")} onChange={(v) => patch({ startedOn: v })} />
              )}
            </div>
            <div className="opx-field">
              <span className="opx-field__cap">{t("to")}</span>
              <DatePicker value={form.endedOn} min={form.startedOn || undefined} placeholder={t("openEnded")} ariaLabel={t("to")} onChange={(v) => patch({ endedOn: v })} />
            </div>
          </div>
          <Field label={t("reason")} value={form.reason} onChange={(v) => patch({ reason: v })} max={2000} multiline rows={2} required placeholder={t("reasonPh")} />
          {form.id ? null : (
            <div className="opx-field">
              <span className="opx-vrf-flabel">{t("files")}</span>
              <label className="opx-vrf-drop" data-busy={up !== null || undefined}>
                <span className="opx-vrf-drop__ic" aria-hidden="true">
                  <IcDoc size={20} />
                </span>
                <span className="opx-vrf-drop__txt">
                  <b className="opx-num">{up !== null ? t("uploading", { n: Math.round(up * 100) }) : t("addFile")}</b>
                  <small>{t("fileHint")}</small>
                </span>
                {up !== null ? (
                  <span className="opx-vrf-bar" aria-hidden="true">
                    <i style={{ width: `${Math.round(up * 100)}%` }} />
                  </span>
                ) : null}
                <input
                  type="file"
                  accept={SUSPENSION_FILE_TYPES.join(",")}
                  disabled={up !== null}
                  aria-label={t("addFile")}
                  onChange={(e) => {
                    void attach(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {form.files.length ? (
                <ul className="opx-files opx-vrf-picked">
                  {form.files.map((f) => (
                    <li key={f.id} className="opx-file is-picked">
                      <IcDoc size={15} />
                      <span>{f.fileName || t("fileN", { n: 1 })}</span>
                      <button type="button" className="opx-vrf-x" aria-label={t("removeFile", { name: f.fileName })} onClick={() => patch({ files: form.files.filter((x) => x.id !== f.id) })}>
                        <IcClose size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
          <div className="opx-vrf-sacts">
            <button type="button" className="opx-pbtn opx-vrf-sm" onClick={() => setForm(null)} disabled={busy}>
              {t("cancel")}
            </button>
            <button type="button" className="opx-pbtn opx-pbtn--main opx-vrf-sm" onClick={() => void save()} disabled={bad || busy} aria-busy={busy}>
              {form.id ? t("update") : t("save")}
            </button>
          </div>
        </div>
      ) : null}
      {note ? <Note tone={note.ok ? "ok" : "bad"}>{note.msg}</Note> : null}
    </section>
  );
}
