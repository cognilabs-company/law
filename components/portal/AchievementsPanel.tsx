"use client";

import "./experience.css";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import DatePicker from "@/components/DatePicker";
import { IconAward, IconCalendar, IconCheck, IconClose, IconEdit, IconFileText, IconLock, IconPaperclip, IconPlus, IconStar, IconUpload } from "@/components/icons";
import ContactGuardNote, { useContactStrip } from "@/components/ui/ContactGuardNote";
import { dateOnly } from "@/lib/date";
import { errDetail, isAborted, logApiError } from "@/lib/http";
import { findContacts } from "@/lib/contactGuard";
import { subscribeUserEvents } from "@/lib/userSocket";
import { EVIDENCE_MAX_BYTES, EVIDENCE_TYPES, experienceErrorOf, type ExperienceEvidence } from "@/lib/services/experience";
import {
  ACHIEVEMENT_TYPES,
  downloadAchievementEvidence,
  listMyAchievements,
  submitAchievement,
  uploadAchievementEvidence,
  type Achievement,
  type AchievementGroup,
  type AchievementType,
} from "@/lib/services/achievements";

// A seller's achievements, separate from experience (TSK-493303; contract
// 2026-10-27 §17): court results and far more — awards, certificates,
// research, mediation, pro bono. Every change is a revision the call center
// verifies; only approved ones show on the public profile and count for the
// rating, and the evidence files never go public.

type Draft = { sourceId: string; type: AchievementType | ""; title: string; achievedOn: string; description: string; evidence: ExperienceEvidence[] };
const empty = (): Draft => ({ sourceId: "", type: "", title: "", achievedOn: "", description: "", evidence: [] });
const DESC_MIN = 20;
const draftOf = (a: Achievement, sourceId: string): Draft => ({ sourceId, type: a.type, title: a.title, achievedOn: a.achievedAt.slice(0, 10), description: a.description, evidence: a.evidence });

export function achievementIssue(d: Draft | null, today: string): string {
  if (!d) return "";
  if (!d.type) return "type";
  if (!d.title.trim()) return "title";
  if (!d.achievedOn || d.achievedOn > today) return "date";
  if (d.description.trim().length < DESC_MIN) return "description";
  if (findContacts(d.description).length) return "contacts";
  return "";
}

export default function AchievementsPanel(): ReactElement {
  const t = useTranslations("portal.achievements");
  const te = useTranslations("portal.experience");
  const locale = useLocale();
  const [groups, setGroups] = useState<AchievementGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const sending = useRef(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [tried, setTried] = useState(false);
  const descStrip = useContactStrip((description) => setDraft((d) => (d ? { ...d, description } : d)));

  const load = useCallback(async () => {
    try {
      setGroups(await listMyAchievements());
      setFailed(false);
    } catch (e) {
      if (isAborted(e)) return;
      logApiError("achievements.list", e);
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
    const off = subscribeUserEvents((e) => {
      if (String(e.event ?? "").startsWith("marketplace.achievement_")) void load();
    });
    return off;
  }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const issue = achievementIssue(draft, today);
  const desc = draft?.description.trim() ?? "";
  const descHits = draft ? findContacts(draft.description) : [];
  const open = (d: Draft) => {
    descStrip.reset();
    setTried(false);
    setNote(null);
    setDraft(d);
  };

  async function addFiles(files: FileList | null) {
    if (!draft || !files?.length || uploading) return;
    const list = Array.from(files);
    const wrongType = list.find((f) => !(EVIDENCE_TYPES as readonly string[]).includes(f.type));
    if (wrongType) return setNote({ ok: false, msg: te("fileType", { name: wrongType.name }) });
    const tooBig = list.find((f) => f.size > EVIDENCE_MAX_BYTES);
    if (tooBig) return setNote({ ok: false, msg: te("fileBig", { name: tooBig.name }) });
    setUploading(true);
    setNote(null);
    try {
      const up: ExperienceEvidence[] = [];
      for (const f of list) up.push(await uploadAchievementEvidence(f));
      setDraft((d) => (d ? { ...d, evidence: [...d.evidence, ...up.filter((x) => x.id)] } : d));
    } catch (e) {
      logApiError("achievements.evidence", e);
      const fe = experienceErrorOf(e);
      setNote({ ok: false, msg: fe && te.has(`err.${fe.code}`) ? te(`err.${fe.code}`) : te("fileFailed") });
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!draft || !draft.type || issue || busy || uploading || sending.current) return;
    sending.current = true;
    setBusy(true);
    setNote(null);
    try {
      await submitAchievement({ sourceId: draft.sourceId || undefined, type: draft.type, title: draft.title, achievedOn: draft.achievedOn, description: draft.description, evidenceIds: draft.evidence.map((x) => x.id) });
      setDraft(null);
      setNote({ ok: true, msg: t("sent") });
      await load();
    } catch (e) {
      logApiError("achievements.submit", e);
      const fe = experienceErrorOf(e);
      setNote({ ok: false, msg: fe && t.has(`err.${fe.code}`) ? t(`err.${fe.code}`) : errDetail(e) || t("failed") });
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const approved = (groups ?? []).filter((g) => g.current).length;
  const pending = (groups ?? []).filter((g) => g.pending).length;
  return (
    <section className="ppanel exp ach" aria-labelledby="ach-title" data-ai-target="profile:achievements">
      <div className="ppanel__h exp__h">
        <b className="ppanel__t" id="ach-title">
          <span className="pico">
            <IconStar />
          </span>
          {t("title")}
        </b>
        <button type="button" className="btn btn--pri btn--sm" onClick={() => open(empty())} disabled={!!draft}>
          <IconPlus aria-hidden="true" />
          {t("add")}
        </button>
      </div>
      <p className="exp__lead">{t("lead")}</p>
      {groups?.length ? (
        <div className="exp__sum" role="status">
          <div>
            <b className="sx-num">{approved}</b>
            <small>{t("sumApproved")}</small>
          </div>
          <div data-tone={pending ? "warn" : undefined}>
            <b className="sx-num">{pending}</b>
            <small>{t("sumPending")}</small>
          </div>
        </div>
      ) : null}
      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
      {failed ? <Notice ok={false} msg={t("loadFailed")} /> : null}
      {!groups && !failed ? (
        <div className="exp__grid" aria-hidden="true">
          <div className="exp__card exp__card--ghost" />
        </div>
      ) : null}
      {groups && !groups.length ? (
        <div className="exp__empty">
          <span className="exp__empty-ic" aria-hidden="true">
            <IconAward />
          </span>
          <b>{t("emptyTitle")}</b>
          <p>{t("emptyText")}</p>
          <button type="button" className="btn btn--line btn--sm" onClick={() => open(empty())}>
            <IconPlus aria-hidden="true" />
            {t("add")}
          </button>
        </div>
      ) : null}
      {groups?.length ? (
        <ul className="exp__grid">
          {groups.map((g) => {
            const shown = g.current ?? g.pending ?? g.latest;
            if (!shown) return null;
            const turned = g.latest && (g.latest.status === "rejected" || g.latest.status === "changes_requested") ? g.latest : null;
            const state = g.current ? "approved" : g.pending ? "pending" : turned ? "rejected" : "draft";
            return (
              <li key={g.rootId} className="exp__card" data-s={state}>
                <div className="exp__card-h">
                  <div className="exp__card-t">
                    <b>{shown.title}</b>
                    <small>{t(`type.${shown.type}`)}</small>
                  </div>
                  {!g.pending ? (
                    <button type="button" className="exp__edit" onClick={() => open(draftOf(g.latest ?? shown, g.current?.id ?? ""))} aria-label={t("editNamed", { name: shown.title })} disabled={!!draft}>
                      <IconEdit aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
                <div className="exp__chips">
                  {g.current ? <span className="exp__chip" data-s="approved">{t("status.approved")}</span> : null}
                  {g.pending ? <span className="exp__chip" data-s="pending">{t("status.pending")}</span> : null}
                  {turned ? <span className="exp__chip" data-s="rejected">{t(`status.${turned.status}`)}</span> : null}
                  {g.current ? null : <span className="exp__chip">{t("notPublic")}</span>}
                </div>
                {shown.achievedAt ? (
                  <p className="exp__date">
                    <IconCalendar aria-hidden="true" />
                    {dateOnly(shown.achievedAt, locale)}
                  </p>
                ) : null}
                {shown.description ? <p className="exp__desc">{shown.description}</p> : null}
                {shown.evidence.length ? (
                  <span className="exp__files">
                    {shown.evidence.map((f) => (
                      <button key={f.id} type="button" className="exp__fileb" onClick={() => void downloadAchievementEvidence(f).catch((e) => logApiError("achievements.download", e))}>
                        <IconPaperclip aria-hidden="true" />
                        {f.fileName || te("file")}
                      </button>
                    ))}
                  </span>
                ) : null}
                {g.pending && g.current ? <p className="exp__note" data-tone="warn">{t("pendingKeeps")}</p> : null}
                {turned?.reason ? <p className="exp__note" data-tone="bad">{te("reason", { text: turned.reason })}</p> : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <Modal
        open={!!draft}
        onClose={() => (busy ? undefined : setDraft(null))}
        title={draft?.sourceId ? t("editTitle") : t("addTitle")}
        description={t("verifyNote")}
        icon={<IconStar />}
        size="lg"
        busy={busy}
        dirty={!!draft && (!!draft.title || !!draft.description)}
        footer={
          <>
            {tried && issue ? (
              <small className="exp__issue" role="alert">
                {t(`issue.${issue}`, { n: DESC_MIN })}
              </small>
            ) : null}
            <button type="button" className="btn btn--line" onClick={() => setDraft(null)} disabled={busy}>
              {te("cancel")}
            </button>
            <button type="submit" form="ach-form" className="btn btn--pri" disabled={busy || uploading}>
              {busy ? te("sending") : te("submit")}
            </button>
          </>
        }
      >
        {draft ? (
          <form
            id="ach-form"
            className="exp__form"
            onSubmit={(e) => {
              e.preventDefault();
              setTried(true);
              void save();
            }}
            noValidate
          >
            <fieldset className="exp__sec" data-done={!!draft.type || undefined}>
              <legend className="exp__legend">
                <span className="exp__n" data-done={!!draft.type || undefined} aria-hidden="true">
                  {draft.type ? <IconCheck /> : 1}
                </span>
                <span className="exp__lt">
                  <b>{t("secType")}</b>
                  <small>{t("secTypeHint")}</small>
                </span>
              </legend>
              <div className="ach__types" role="radiogroup" aria-label={t("secType")} data-bad={tried && issue === "type" ? true : undefined}>
                {ACHIEVEMENT_TYPES.map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={draft.type === k} className="ach__type" onClick={() => setDraft({ ...draft, type: k })}>
                    <b>{t(`type.${k}`)}</b>
                    <small>{t(`typeHint.${k}`)}</small>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="exp__sec">
              <legend className="exp__legend">
                <span className="exp__n" aria-hidden="true">
                  2
                </span>
                <span className="exp__lt">
                  <b>{t("secWhat")}</b>
                  <small>{t("secWhatHint")}</small>
                </span>
              </legend>
              <div className="exp__two">
                <label className="exp__f">
                  <span>{t("titleLabel")}</span>
                  <span className="exp__in">
                    <IconAward aria-hidden="true" />
                    <input value={draft.title} maxLength={200} placeholder={t("titlePh")} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-invalid={tried && issue === "title" ? true : undefined} />
                  </span>
                </label>
                <div className="exp__f" data-bad={tried && issue === "date" ? true : undefined}>
                  <span>{t("date")}</span>
                  <DatePicker value={draft.achievedOn} max={today} onChange={(v) => setDraft({ ...draft, achievedOn: v })} placeholder={te("pickDate")} ariaLabel={t("date")} />
                </div>
              </div>
              <label className="exp__f">
                <span>{t("description")}</span>
                <textarea rows={4} maxLength={2000} value={draft.description} onChange={(e) => descStrip.change(e.target.value, e)} onBlur={() => descStrip.blur(draft.description)} placeholder={t("descriptionPh")} aria-invalid={descHits.length > 0 || (tried && issue === "description") || undefined} />
                <span className="exp__meter" data-ok={desc.length >= DESC_MIN || undefined}>
                  <i aria-hidden="true">
                    <b style={{ width: `${Math.min(100, (desc.length / DESC_MIN) * 100)}%` }} />
                  </i>
                  <small className="exp__count" data-short={desc.length < DESC_MIN || undefined}>
                    {desc.length < DESC_MIN ? te("descLeft", { n: DESC_MIN - desc.length }) : te("descCount", { n: desc.length })}
                  </small>
                </span>
              </label>
              <ContactGuardNote hits={descHits} removed={descStrip.removed} />
            </fieldset>
            <fieldset className="exp__sec">
              <legend className="exp__legend">
                <span className="exp__n" aria-hidden="true">
                  3
                </span>
                <span className="exp__lt">
                  <b>{t("secProof")}</b>
                  <small>{t("secProofHint")}</small>
                </span>
              </legend>
              <p className="ach__private">
                <IconLock aria-hidden="true" />
                {t("privateNote")}
              </p>
              <div className="exp__drop" data-busy={uploading || undefined}>
                <label>
                  <span className="exp__drop-ic" aria-hidden="true">
                    <IconUpload />
                  </span>
                  <b>{uploading ? te("uploading") : te("addFile")}</b>
                  <small>{te("evidenceHint")}</small>
                  <input type="file" multiple accept={EVIDENCE_TYPES.join(",")} disabled={uploading} onChange={(e) => void addFiles(e.target.files).finally(() => (e.target.value = ""))} />
                </label>
                {draft.evidence.length ? (
                  <ul>
                    {draft.evidence.map((f) => (
                      <li key={f.id}>
                        <span className="exp__file-ic" aria-hidden="true">
                          <IconFileText />
                        </span>
                        <span>{f.fileName || te("file")}</span>
                        <button type="button" aria-label={te("removeFile", { name: f.fileName || te("file") })} onClick={() => setDraft({ ...draft, evidence: draft.evidence.filter((x) => x.id !== f.id) })}>
                          <IconClose />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </fieldset>
          </form>
        ) : null}
      </Modal>
    </section>
  );
}
