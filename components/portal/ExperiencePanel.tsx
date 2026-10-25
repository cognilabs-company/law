"use client";

import "./experience.css";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import DatePicker from "@/components/DatePicker";
import { IconAward, IconBriefcase, IconCalendar, IconEdit, IconPaperclip, IconPlus, IconScale, IconUpload } from "@/components/icons";
import ContactGuardNote, { useContactStrip } from "@/components/ui/ContactGuardNote";
import { dateOnly } from "@/lib/date";
import { errDetail, isAborted, logApiError } from "@/lib/http";
import { getServiceCategories, type BackendCategory } from "@/lib/services/backend";
import { categoryName } from "@/lib/categoryNames";
import { uzLabel } from "@/lib/uzScript";
import { findContacts } from "@/lib/contactGuard";
import { subscribeUserEvents } from "@/lib/userSocket";
import {
  EVIDENCE_MAX_BYTES,
  EVIDENCE_TYPES,
  EXPERIENCE_RESULTS,
  EXPERIENCE_STAGES,
  cancelExperience,
  downloadExperienceEvidence,
  experienceErrorOf,
  listMyExperience,
  submitExperience,
  uploadExperienceEvidence,
  type ExperienceEvidence,
  type ExperienceGroup,
  type ExperienceItem,
  getCategoryTree,
  type CategoryNode,
} from "@/lib/services/experience";

// A lawyer's experience per category (TSK-659111): each change is a new
// revision that waits for the call center; the approved one stays in force
// meanwhile, and a rejection's reason is shown here. Evidence files go up
// first and the record carries their ids.

type Draft = {
  sourceId: string;
  categoryId: string;
  subcategoryId: string;
  workplace: string;
  position: string;
  startedOn: string;
  endedOn: string;
  isCurrent: boolean;
  description: string;
  stages: string[];
  results: string[];
  evidence: ExperienceEvidence[];
};
const EMPTY: Draft = { sourceId: "", categoryId: "", subcategoryId: "", workplace: "", position: "", startedOn: "", endedOn: "", isCurrent: true, description: "", stages: [], results: [], evidence: [] };
const DESC_MIN = 30;
const day = (iso: string) => iso.slice(0, 10);
const draftOf = (it: ExperienceItem, sourceId: string): Draft => ({
  sourceId,
  categoryId: it.categoryId,
  subcategoryId: it.subcategoryId,
  workplace: it.workplace,
  position: it.position,
  startedOn: day(it.startedAt),
  endedOn: day(it.endedAt),
  isCurrent: it.isCurrent,
  description: it.description,
  stages: it.stages,
  results: it.results,
  evidence: it.evidence,
});
const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export default function ExperiencePanel(): ReactElement {
  const t = useTranslations("portal.experience");
  const locale = useLocale();
  const [groups, setGroups] = useState<ExperienceGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [cats, setCats] = useState<BackendCategory[]>([]);
  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const sending = useRef(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [fieldErr, setFieldErr] = useState<{ field: string; code: string } | null>(null);
  const [tried, setTried] = useState(false);
  const descStrip = useContactStrip((description) => setDraft((d) => (d ? { ...d, description } : d)));

  const load = useCallback(async () => {
    try {
      setGroups(await listMyExperience());
      setFailed(false);
    } catch (e) {
      if (isAborted(e)) return;
      logApiError("experience.list", e);
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => {
      if (alive) void load();
    });
    getServiceCategories().then(
      (c) => alive && setCats(c),
      () => undefined,
    );
    getCategoryTree().then(
      (t) => alive && setTree(t),
      () => undefined,
    );
    // A review reaches the lawyer as a notification; refetch on it.
    const off = subscribeUserEvents((e) => {
      if (String(e.event ?? "").startsWith("marketplace.experience_")) void load();
    });
    return () => {
      alive = false;
      off();
    };
  }, [load]);

  const catName = (id: string) => {
    const c = cats.find((x) => x.id === id);
    return c ? uzLabel(categoryName({ slug: c.slug, title: c.name }, locale), locale) : "";
  };
  const subsOf = (categoryId: string) => tree.find((n) => n.id === categoryId)?.children ?? [];
  const subName = (categoryId: string, id: string) => uzLabel(subsOf(categoryId).find((s) => s.id === id)?.title ?? "", locale);
  const open = (d: Draft) => {
    descStrip.reset();
    setTried(false);
    setFieldErr(null);
    setNote(null);
    setDraft(d);
  };
  const desc = draft?.description.trim() ?? "";
  const descHits = draft ? findContacts(draft.description) : [];
  const today = new Date().toISOString().slice(0, 10);
  const issue = !draft
    ? ""
    : !draft.categoryId
      ? "category"
      : !draft.workplace.trim()
        ? "workplace"
        : !draft.position.trim()
          ? "position"
          : !draft.startedOn || draft.startedOn > today
            ? "started"
            : !draft.isCurrent && (!draft.endedOn || draft.endedOn < draft.startedOn || draft.endedOn > today)
              ? "ended"
              : desc.length < DESC_MIN
                ? "description"
                : descHits.length
                  ? "contacts"
                  : "";

  async function addFiles(files: FileList | null) {
    if (!draft || !files?.length || uploading) return;
    const list = Array.from(files);
    const bad = list.find((f) => !(EVIDENCE_TYPES as readonly string[]).includes(f.type) || f.size > EVIDENCE_MAX_BYTES);
    if (bad) return setNote({ ok: false, msg: t("fileBad", { name: bad.name }) });
    setUploading(true);
    setNote(null);
    try {
      const up: ExperienceEvidence[] = [];
      for (const f of list) up.push(await uploadExperienceEvidence(f));
      setDraft((d) => (d ? { ...d, evidence: [...d.evidence, ...up.filter((x) => x.id)] } : d));
    } catch (e) {
      logApiError("experience.evidence", e);
      setNote({ ok: false, msg: errDetail(e) || t("fileFailed") });
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!draft || issue || busy || uploading || sending.current) return;
    sending.current = true;
    setBusy(true);
    setNote(null);
    setFieldErr(null);
    try {
      await submitExperience({ ...draft, sourceId: draft.sourceId || undefined, evidenceIds: draft.evidence.map((x) => x.id) });
      setDraft(null);
      setNote({ ok: true, msg: t("sent") });
      await load();
    } catch (e) {
      logApiError("experience.submit", e);
      const fe = experienceErrorOf(e);
      if (fe) setFieldErr(fe);
      setNote({ ok: false, msg: fe && t.has(`err.${fe.code}`) ? t(`err.${fe.code}`) : errDetail(e) || t("failed") });
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    if (busy || sending.current) return;
    sending.current = true;
    setBusy(true);
    setNote(null);
    try {
      await cancelExperience(id);
      setNote({ ok: true, msg: t("cancelled") });
      await load();
    } catch (e) {
      logApiError("experience.cancel", e);
      setNote({ ok: false, msg: errDetail(e) || t("failed") });
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const bad = (field: string) => (fieldErr?.field === field ? true : undefined);
  const period = (it: ExperienceItem) => [it.startedAt ? dateOnly(it.startedAt, locale) : "", it.isCurrent ? t("now") : it.endedAt ? dateOnly(it.endedAt, locale) : ""].filter(Boolean).join(" — ");
  const approved = (groups ?? []).filter((g) => g.current);
  const years = approved.reduce((n, g) => n + (g.current?.years ?? 0), 0);
  const pending = (groups ?? []).filter((g) => g.pending).length;
  // The first missing field is marked on the field itself, not only below.
  const miss = (k: string) => (issue === k && tried ? true : undefined);

  return (
    <section className="ppanel exp" aria-labelledby="exp-title" data-ai-target="profile:experience">
      <div className="ppanel__h exp__h">
        <b className="ppanel__t" id="exp-title">
          <span className="pico">
            <IconAward />
          </span>
          {t("title")}
        </b>
        <button type="button" className="btn btn--pri btn--sm" onClick={() => open(EMPTY)} disabled={!!draft}>
          <IconPlus aria-hidden="true" />
          {t("add")}
        </button>
      </div>
      <p className="exp__lead">{t("lead")}</p>

      {groups?.length ? (
        <div className="exp__sum" role="status">
          <div>
            <b className="sx-num">{approved.length}</b>
            <small>{t("sumApproved")}</small>
          </div>
          <div>
            <b className="sx-num">{years}</b>
            <small>{t("sumYears")}</small>
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
          <div className="exp__card exp__card--ghost" />
        </div>
      ) : null}
      {groups && !groups.length ? (
        <div className="exp__empty">
          <span className="exp__empty-ic" aria-hidden="true">
            <IconScale />
          </span>
          <b>{t("emptyTitle")}</b>
          <p>{t("emptyText")}</p>
          <button type="button" className="btn btn--line btn--sm" onClick={() => open(EMPTY)}>
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
            const rejected = g.latest?.status === "rejected" ? g.latest : null;
            const state = g.current ? "approved" : g.pending ? "pending" : rejected ? "rejected" : "draft";
            const sub = subName(shown.categoryId, shown.subcategoryId);
            return (
              <li key={g.rootId} className="exp__card" data-s={state}>
                <div className="exp__card-h">
                  <div className="exp__card-t">
                    <b>{catName(shown.categoryId)}</b>
                    {sub ? <small>{sub}</small> : null}
                  </div>
                  {g.pending ? (
                    <button type="button" className="btn btn--soft btn--sm" onClick={() => void cancel(g.pending!.id)} disabled={busy}>
                      {t("cancelPending")}
                    </button>
                  ) : (
                    <button type="button" className="exp__edit" onClick={() => open(draftOf(g.latest ?? shown, g.current?.id ?? ""))} aria-label={t("editNamed", { name: catName(shown.categoryId) })} disabled={!!draft}>
                      <IconEdit aria-hidden="true" />
                    </button>
                  )}
                </div>
                <div className="exp__chips">
                  {g.current ? <span className="exp__chip" data-s="approved">{g.current.years !== null ? t("status.approvedYears", { n: g.current.years }) : t("status.approved")}</span> : null}
                  {g.pending ? <span className="exp__chip" data-s="pending">{t("status.pending")}</span> : null}
                  {rejected ? <span className="exp__chip" data-s="rejected">{t("status.rejected")}</span> : null}
                </div>
                <dl className="exp__facts">
                  {shown.workplace || shown.position ? (
                    <div>
                      <dt>
                        <IconBriefcase aria-hidden="true" />
                        <span className="sr-only">{t("workplace")}</span>
                      </dt>
                      <dd>{[shown.position, shown.workplace].filter(Boolean).join(" · ")}</dd>
                    </div>
                  ) : null}
                  {period(shown) ? (
                    <div>
                      <dt>
                        <IconCalendar aria-hidden="true" />
                        <span className="sr-only">{t("period")}</span>
                      </dt>
                      <dd>{period(shown)}</dd>
                    </div>
                  ) : null}
                </dl>
                {shown.stages.length || shown.results.length ? (
                  <span className="exp__tags">
                    {shown.stages.map((st) => (
                      <i key={`s-${st}`}>{t.has(`stage.${st}`) ? t(`stage.${st}`) : st}</i>
                    ))}
                    {shown.results.map((r) => (
                      <i key={`r-${r}`} data-k="result">
                        {t.has(`result.${r}`) ? t(`result.${r}`) : r}
                      </i>
                    ))}
                  </span>
                ) : null}
                {shown.description ? <p className="exp__desc">{shown.description}</p> : null}
                {shown.evidence.length ? (
                  <span className="exp__files">
                    {shown.evidence.map((f) => (
                      <button key={f.id} type="button" className="exp__fileb" onClick={() => void downloadExperienceEvidence(f).catch((e) => logApiError("experience.download", e))}>
                        <IconPaperclip aria-hidden="true" />
                        {f.fileName || t("file")}
                      </button>
                    ))}
                  </span>
                ) : null}
                {g.pending && g.current ? <p className="exp__note" data-tone="warn">{t("pendingKeeps")}</p> : null}
                {rejected?.rejectionReason ? <p className="exp__note" data-tone="bad">{t("reason", { text: rejected.rejectionReason })}</p> : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <Modal
        open={!!draft}
        onClose={() => (busy ? undefined : setDraft(null))}
        title={draft?.sourceId ? t("editTitle") : t("addTitle")}
        description={draft?.sourceId ? t("editNote") : t("verifyNote")}
        icon={<IconAward />}
        size="lg"
        busy={busy}
        dirty={!!draft && (!!draft.workplace || !!draft.description)}
        footer={
          <>
            {tried && issue ? <small className="exp__issue" role="alert">{t(`issue.${issue}`, { n: DESC_MIN })}</small> : null}
            <button type="button" className="btn btn--line" onClick={() => setDraft(null)} disabled={busy}>
              {t("cancel")}
            </button>
            <button type="submit" form="exp-form" className="btn btn--pri" disabled={busy || uploading}>
              {busy ? t("sending") : t("submit")}
            </button>
          </>
        }
      >
        {draft ? (
          <form
            id="exp-form"
            className="exp__form"
            onSubmit={(e) => {
              e.preventDefault();
              setTried(true);
              void save();
            }}
            noValidate
          >
            <fieldset className="exp__sec">
              <legend>
                <span className="exp__n">1</span>
                {t("secArea")}
              </legend>
              <label className="exp__f">
                <span>{t("category")}</span>
                <select value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value, subcategoryId: "" })} disabled={!!draft.sourceId} aria-invalid={bad("category_id") ?? miss("category")}>
                  <option value="">{t("pickCategory")}</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {uzLabel(categoryName({ slug: c.slug, title: c.name }, locale), locale)}
                    </option>
                  ))}
                </select>
              </label>
              {subsOf(draft.categoryId).length ? (
                <label className="exp__f">
                  <span>{t("subcategory")}</span>
                  <select value={draft.subcategoryId} onChange={(e) => setDraft({ ...draft, subcategoryId: e.target.value })} aria-invalid={bad("subcategory_id")}>
                    <option value="">{t("anySubcategory")}</option>
                    {subsOf(draft.categoryId).map((sc) => (
                      <option key={sc.id} value={sc.id}>
                        {uzLabel(sc.title, locale)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </fieldset>

            <fieldset className="exp__sec">
              <legend>
                <span className="exp__n">2</span>
                {t("secWork")}
              </legend>
              <div className="exp__two">
                <label className="exp__f">
                  <span>{t("workplace")}</span>
                  <input value={draft.workplace} maxLength={200} placeholder={t("workplacePh")} onChange={(e) => setDraft({ ...draft, workplace: e.target.value })} aria-invalid={bad("workplace") ?? miss("workplace")} />
                </label>
                <label className="exp__f">
                  <span>{t("position")}</span>
                  <input value={draft.position} maxLength={200} placeholder={t("positionPh")} onChange={(e) => setDraft({ ...draft, position: e.target.value })} aria-invalid={bad("position") ?? miss("position")} />
                </label>
                <div className="exp__f" data-bad={bad("started_at") ?? miss("started")}>
                  <span>{t("startedAt")}</span>
                  <DatePicker value={draft.startedOn} max={today} onChange={(v) => setDraft({ ...draft, startedOn: v })} placeholder={t("pickDate")} ariaLabel={t("startedAt")} />
                </div>
                <div className="exp__f" data-bad={bad("ended_at") ?? miss("ended")}>
                  <span>{t("endedAt")}</span>
                  <DatePicker value={draft.isCurrent ? "" : draft.endedOn} min={draft.startedOn || undefined} max={today} disabled={draft.isCurrent} onChange={(v) => setDraft({ ...draft, endedOn: v })} placeholder={draft.isCurrent ? t("now") : t("pickDate")} ariaLabel={t("endedAt")} />
                </div>
              </div>
              <label className="exp__switch">
                <input type="checkbox" role="switch" checked={draft.isCurrent} onChange={(e) => setDraft({ ...draft, isCurrent: e.target.checked })} />
                <i aria-hidden="true" />
                <span>{t("isCurrent")}</span>
              </label>
            </fieldset>

            <fieldset className="exp__sec">
              <legend>
                <span className="exp__n">3</span>
                {t("secCases")}
              </legend>
              <div className="exp__pick" role="group" aria-label={t("stages")} data-bad={bad("stages")}>
                <small>{t("stages")}</small>
                {EXPERIENCE_STAGES.map((st) => (
                  <label key={st} data-on={draft.stages.includes(st) ? "" : undefined}>
                    <input type="checkbox" checked={draft.stages.includes(st)} onChange={() => setDraft({ ...draft, stages: toggle(draft.stages, st) })} />
                    {t(`stage.${st}`)}
                  </label>
                ))}
              </div>
              <div className="exp__pick" role="group" aria-label={t("results")} data-bad={bad("results")}>
                <small>{t("results")}</small>
                {EXPERIENCE_RESULTS.map((r) => (
                  <label key={r} data-on={draft.results.includes(r) ? "" : undefined} data-k="result">
                    <input type="checkbox" checked={draft.results.includes(r)} onChange={() => setDraft({ ...draft, results: toggle(draft.results, r) })} />
                    {t(`result.${r}`)}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="exp__sec">
              <legend>
                <span className="exp__n">4</span>
                {t("secProof")}
              </legend>
              <label className="exp__f">
                <span>{t("description")}</span>
                <textarea
                  rows={4}
                  maxLength={2000}
                  value={draft.description}
                  onChange={(e) => descStrip.change(e.target.value, e)}
                  onBlur={() => descStrip.blur(draft.description)}
                  placeholder={t("descriptionPh")}
                  aria-describedby="exp-desc-g exp-desc-n"
                  aria-invalid={descHits.length > 0 || miss("description") || undefined}
                />
                <small id="exp-desc-n" className="exp__count" data-short={desc.length < DESC_MIN || undefined}>
                  {desc.length < DESC_MIN ? t("descLeft", { n: DESC_MIN - desc.length }) : t("descCount", { n: desc.length })}
                </small>
              </label>
              <ContactGuardNote id="exp-desc-g" hits={descHits} removed={descStrip.removed} />
              <div className="exp__drop" data-busy={uploading || undefined}>
                <label>
                  <IconUpload aria-hidden="true" />
                  <b>{uploading ? t("uploading") : t("addFile")}</b>
                  <small>{t("evidenceHint")}</small>
                  <input type="file" multiple accept={EVIDENCE_TYPES.join(",")} disabled={uploading} onChange={(e) => void addFiles(e.target.files).finally(() => (e.target.value = ""))} />
                </label>
                {draft.evidence.length ? (
                  <ul>
                    {draft.evidence.map((f) => (
                      <li key={f.id}>
                        <IconPaperclip aria-hidden="true" />
                        <span>{f.fileName || t("file")}</span>
                        <button type="button" aria-label={t("removeFile", { name: f.fileName || t("file") })} onClick={() => setDraft({ ...draft, evidence: draft.evidence.filter((x) => x.id !== f.id) })}>
                          ×
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
