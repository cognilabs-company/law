"use client";

import "./experience.css";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Notice } from "@/components/admin/AdminBits";
import ContactGuardNote, { useContactStrip } from "@/components/ui/ContactGuardNote";
import { dateOnly } from "@/lib/date";
import { errDetail, isAborted, logApiError } from "@/lib/http";
import { getServiceCategories, type BackendCategory } from "@/lib/services/backend";
import { categoryName } from "@/lib/categoryNames";
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
    return c ? categoryName({ slug: c.slug, title: c.name }, locale) : id;
  };
  const subsOf = (categoryId: string) => tree.find((n) => n.id === categoryId)?.children ?? [];
  const subName = (categoryId: string, id: string) => subsOf(categoryId).find((s) => s.id === id)?.title ?? "";
  const open = (d: Draft) => {
    descStrip.reset();
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

  return (
    <section className="exp" aria-label={t("title")} data-ai-target="profile:experience">
      <header className="exp__h">
        <div>
          <b>{t("title")}</b>
          <p>{t("lead")}</p>
        </div>
        {!draft ? (
          <button type="button" className="btn btn--line btn--sm" onClick={() => open(EMPTY)}>
            {t("add")}
          </button>
        ) : null}
      </header>
      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
      {failed ? <Notice ok={false} msg={t("loadFailed")} /> : null}
      {groups && !groups.length && !draft ? <p className="exp__empty">{t("empty")}</p> : null}
      {groups?.length ? (
        <ul className="exp__list">
          {groups.map((g) => {
            const shown = g.current ?? g.pending ?? g.latest;
            if (!shown) return null;
            const rejected = g.latest?.status === "rejected" ? g.latest : null;
            return (
              <li key={g.rootId}>
                <div className="exp__row">
                  <b>{catName(shown.categoryId)}</b>
                  {g.current ? (
                    <span className="exp__chip" data-s="approved">
                      {g.current.years !== null ? t("status.approvedYears", { n: g.current.years }) : t("status.approved")}
                    </span>
                  ) : null}
                  {g.pending ? <span className="exp__chip" data-s="pending">{t("status.pending")}</span> : null}
                  {rejected ? <span className="exp__chip" data-s="rejected">{t("status.rejected")}</span> : null}
                </div>
                <span className="exp__meta">{[subName(shown.categoryId, shown.subcategoryId), shown.workplace, shown.position, period(shown)].filter(Boolean).join(" · ")}</span>
                {shown.stages.length || shown.results.length ? (
                  <span className="exp__tags">
                    {shown.stages.map((s) => (
                      <i key={`s-${s}`}>{t.has(`stage.${s}`) ? t(`stage.${s}`) : s}</i>
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
                      <button key={f.id} type="button" className="btn btn--ghost btn--sm" onClick={() => void downloadExperienceEvidence(f).catch((e) => logApiError("experience.download", e))}>
                        {f.fileName || t("file")}
                      </button>
                    ))}
                  </span>
                ) : null}
                {g.pending && g.current ? <small className="exp__muted">{t("pendingKeeps")}</small> : null}
                {rejected?.rejectionReason ? <small className="exp__reason">{t("reason", { text: rejected.rejectionReason })}</small> : null}
                {!draft ? (
                  <span className="exp__acts">
                    {g.pending ? (
                      <button type="button" className="btn btn--soft btn--sm" onClick={() => void cancel(g.pending!.id)} disabled={busy}>
                        {t("cancelPending")}
                      </button>
                    ) : (
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => open(draftOf(g.latest ?? shown, g.current?.id ?? ""))}>
                        {t("edit")}
                      </button>
                    )}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {draft ? (
        <form
          className="exp__form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          noValidate
        >
          {draft.sourceId ? <p className="exp__muted exp__wide">{t("editNote")}</p> : null}
          <label className="exp__wide">
            <span>{t("category")}</span>
            <select value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value, subcategoryId: "" })} disabled={!!draft.sourceId} aria-invalid={bad("category_id")}>
              <option value="">{t("pickCategory")}</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryName({ slug: c.slug, title: c.name }, locale)}
                </option>
              ))}
            </select>
          </label>
          {subsOf(draft.categoryId).length ? (
            <label className="exp__wide">
              <span>{t("subcategory")}</span>
              <select value={draft.subcategoryId} onChange={(e) => setDraft({ ...draft, subcategoryId: e.target.value })} aria-invalid={bad("subcategory_id")}>
                <option value="">{t("anySubcategory")}</option>
                {subsOf(draft.categoryId).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            <span>{t("workplace")}</span>
            <input value={draft.workplace} maxLength={200} onChange={(e) => setDraft({ ...draft, workplace: e.target.value })} aria-invalid={bad("workplace")} />
          </label>
          <label>
            <span>{t("position")}</span>
            <input value={draft.position} maxLength={200} onChange={(e) => setDraft({ ...draft, position: e.target.value })} aria-invalid={bad("position")} />
          </label>
          <label>
            <span>{t("startedAt")}</span>
            <input type="date" value={draft.startedOn} max={today} onChange={(e) => setDraft({ ...draft, startedOn: e.target.value })} aria-invalid={bad("started_at")} />
          </label>
          <label>
            <span>{t("endedAt")}</span>
            <input type="date" value={draft.isCurrent ? "" : draft.endedOn} min={draft.startedOn || undefined} max={today} disabled={draft.isCurrent} onChange={(e) => setDraft({ ...draft, endedOn: e.target.value })} aria-invalid={bad("ended_at")} />
          </label>
          <label className="exp__check exp__wide">
            <input type="checkbox" checked={draft.isCurrent} onChange={(e) => setDraft({ ...draft, isCurrent: e.target.checked })} />
            <span>{t("isCurrent")}</span>
          </label>
          <fieldset className="exp__wide exp__pick" aria-invalid={bad("stages")}>
            <legend>{t("stages")}</legend>
            {EXPERIENCE_STAGES.map((s) => (
              <label key={s} data-on={draft.stages.includes(s) ? "" : undefined}>
                <input type="checkbox" checked={draft.stages.includes(s)} onChange={() => setDraft({ ...draft, stages: toggle(draft.stages, s) })} />
                {t(`stage.${s}`)}
              </label>
            ))}
          </fieldset>
          <fieldset className="exp__wide exp__pick" aria-invalid={bad("results")}>
            <legend>{t("results")}</legend>
            {EXPERIENCE_RESULTS.map((r) => (
              <label key={r} data-on={draft.results.includes(r) ? "" : undefined}>
                <input type="checkbox" checked={draft.results.includes(r)} onChange={() => setDraft({ ...draft, results: toggle(draft.results, r) })} />
                {t(`result.${r}`)}
              </label>
            ))}
          </fieldset>
          <label className="exp__wide">
            <span>{t("description")}</span>
            <textarea
              rows={4}
              maxLength={2000}
              value={draft.description}
              onChange={(e) => descStrip.change(e.target.value, e)}
              onBlur={() => descStrip.blur(draft.description)}
              placeholder={t("descriptionPh")}
              aria-describedby="exp-desc-g"
              aria-invalid={descHits.length > 0 || undefined}
            />
          </label>
          <div className="exp__wide">
            <ContactGuardNote id="exp-desc-g" hits={descHits} removed={descStrip.removed} />
          </div>
          <div className="exp__wide exp__ev">
            <span>{t("evidence")}</span>
            {draft.evidence.map((f) => (
              <span key={f.id} className="exp__file">
                {f.fileName || t("file")}
                <button type="button" aria-label={t("removeFile", { name: f.fileName || t("file") })} onClick={() => setDraft({ ...draft, evidence: draft.evidence.filter((x) => x.id !== f.id) })}>
                  ×
                </button>
              </span>
            ))}
            <label className="btn btn--line btn--sm" data-busy={uploading || undefined}>
              {uploading ? t("uploading") : t("addFile")}
              <input type="file" hidden multiple accept={EVIDENCE_TYPES.join(",")} disabled={uploading} onChange={(e) => void addFiles(e.target.files).finally(() => (e.target.value = ""))} />
            </label>
            <small className="exp__muted">{t("evidenceHint")}</small>
          </div>
          {issue ? <small className="exp__reason exp__wide">{t(`issue.${issue}`, { n: DESC_MIN })}</small> : null}
          <small className="exp__muted exp__wide">{t("verifyNote")}</small>
          <div className="exp__acts exp__wide">
            <button type="button" className="btn btn--soft btn--sm" onClick={() => setDraft(null)} disabled={busy}>
              {t("cancel")}
            </button>
            <button type="submit" className="btn btn--pri btn--sm" disabled={busy || uploading || !!issue}>
              {busy ? t("sending") : t("submit")}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
