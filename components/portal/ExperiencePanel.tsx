"use client";

import "./experience.css";
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactElement, type SVGProps } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import DatePicker from "@/components/DatePicker";
import { IconAward, IconBriefcase, IconBuilding, IconCalendar, IconCheck, IconClock, IconClose, IconEdit, IconFileText, IconHistory, IconLock, IconPaperclip, IconPlus, IconScale, IconShieldCheck, IconTrash, IconTrendingUp, IconUpload } from "@/components/icons";
import Select from "@/components/Select";
import ContactGuardNote, { useContactStrip } from "@/components/ui/ContactGuardNote";
import { dateOnly } from "@/lib/date";
import { errDetail, isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { getServiceCategories, type BackendCategory } from "@/lib/services/backend";
import { categoryName } from "@/lib/categoryNames";
import { uzLabel } from "@/lib/uzScript";
import { findContacts } from "@/lib/contactGuard";
import { onUserSocketResync, subscribeUserEvents } from "@/lib/userSocket";
import {
  EVIDENCE_MAX_BYTES,
  EVIDENCE_TYPES,
  approvedYears,
  cancelExperience,
  downloadExperienceEvidence,
  experienceErrorOf,
  listMyExperience,
  submitExperience,
  uploadExperienceEvidence,
  type ExperienceEvidence,
  type ExperienceGroup,
  type ExperienceItem,
  type ExperienceKind,
  type ExperiencePosition,
  getCategoryTree,
  type CategoryNode,
} from "@/lib/services/experience";
import { getMySellerRating } from "@/lib/services/sellerRating";

// A lawyer's experience (TSK-415946, TSK-920636; contract 2026-10-27 §15,
// §18): one record per workplace with its positions, each with its own
// dates — parallel jobs are separate records and may overlap (the backend
// never counts the same months twice). Every change is a new revision the
// call center checks; the approved one stays in force meanwhile. Evidence
// files go up first and the record carries their ids.
//
// Contract 2026-10-29 §5: the same editor, with kind="pre_advocate_employment",
// is an advocate's employment before advocate status (public bodies or
// private organizations) — one record per organization with its positions,
// no category, never priced and never part of the advocate tenure; the two
// kinds never mix on screen.

type PositionDraft = { key: number; title: string; startedOn: string; endedOn: string; isCurrent: boolean; description: string };
type Draft = {
  sourceId: string;
  categoryId: string;
  subcategoryId: string;
  workplace: string;
  positions: PositionDraft[];
  description: string;
  evidence: ExperienceEvidence[];
};
let keySeq = 0;
const newPosition = (): PositionDraft => ({ key: ++keySeq, title: "", startedOn: "", endedOn: "", isCurrent: true, description: "" });
const emptyDraft = (): Draft => ({ sourceId: "", categoryId: "", subcategoryId: "", workplace: "", positions: [newPosition()], description: "", evidence: [] });
const DESC_MIN = 30;
const asKind = (v: unknown): ExperienceKind | "" => (v === "pre_advocate_employment" || v === "category_experience" ? v : "");
const MAX_POSITIONS = 10;
const day = (iso: string) => iso.slice(0, 10);
const posDraft = (p: ExperiencePosition): PositionDraft => ({ key: ++keySeq, title: p.title, startedOn: day(p.startedAt), endedOn: day(p.endedAt), isCurrent: p.isCurrent, description: p.description });
const draftOf = (it: ExperienceItem, sourceId: string): Draft => ({
  sourceId,
  categoryId: it.categoryId,
  subcategoryId: it.subcategoryId,
  workplace: it.workplace,
  positions: it.positions.length ? it.positions.map(posDraft) : [newPosition()],
  description: it.description,
  evidence: it.evidence,
});

// Whole years and months between two ISO days ("" = today) — only a hint
// beside one position; the record's counted years are the backend's.
function spanOf(from: string, to: string): { y: number; m: number } | null {
  if (!from) return null;
  const a = new Date(`${from}T00:00:00`);
  const b = to ? new Date(`${to}T00:00:00`) : new Date();
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return null;
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  months = Math.max(0, months);
  return { y: Math.floor(months / 12), m: months % 12 };
}

// The first thing still missing, with the position it is in.
export function experienceIssue(d: Draft | null, today: string, noCategory = false): { key: string; pos: number } | null {
  if (!d) return null;
  if (!noCategory && !d.categoryId) return { key: "category", pos: -1 };
  if (!d.workplace.trim()) return { key: "workplace", pos: -1 };
  for (let i = 0; i < d.positions.length; i++) {
    const p = d.positions[i];
    if (!p.title.trim()) return { key: "position", pos: i };
    if (!p.startedOn || p.startedOn > today) return { key: "started", pos: i };
    if (!p.isCurrent && (!p.endedOn || p.endedOn < p.startedOn || p.endedOn > today)) return { key: "ended", pos: i };
  }
  const desc = d.description.trim();
  if (desc.length < DESC_MIN) return { key: "description", pos: -1 };
  if (findContacts(d.description).length) return { key: "contacts", pos: -1 };
  return null;
}

function SecHead({ icon: Icon, done, title, hint, optional }: { icon: ComponentType<SVGProps<SVGSVGElement>>; done: boolean; title: string; hint: string; optional?: boolean }): ReactElement {
  const t = useTranslations("portal.experience");
  return (
    <legend className="exp__legend">
      <span className="exp__n" data-done={done || undefined} aria-hidden="true">
        {done ? <IconCheck /> : <Icon />}
      </span>
      <span className="exp__lt">
        <b>{title}</b>
        <small>{hint}</small>
      </span>
      <em className="exp__tag" data-done={done || undefined}>
        {done ? t("secDone") : optional ? t("optional") : t("required")}
      </em>
    </legend>
  );
}

export default function ExperiencePanel({ kind = "category_experience" }: { kind?: ExperienceKind }): ReactElement {
  const t = useTranslations("portal.experience");
  const pre = kind === "pre_advocate_employment";
  // This kind's own wording where it differs.
  const tk = (k: string) => (pre && t.has(`pre.${k}`) ? t(`pre.${k}`) : t(k));
  const locale = useLocale();
  const [groups, setGroups] = useState<ExperienceGroup[] | null>(null);
  const [backendYears, setBackendYears] = useState<number | null>(null);
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
      getMySellerRating().then(
        (r) => setBackendYears(r?.experienceYears ?? null),
        () => undefined,
      );
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
      (tr) => alive && setTree(tr),
      () => undefined,
    );
    // A review or a review chat reaches the lawyer live: read again, and
    // say so once (by the panel of the record's kind).
    let timer = 0;
    const soon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), 500);
    };
    const off = subscribeUserEvents((e) => {
      const ev = String(e.event ?? "");
      if (!ev.startsWith("marketplace.experience_")) return;
      soon();
      const said = asKind(e.experience_kind ?? (e.experience as { experience_kind?: unknown } | undefined)?.experience_kind);
      if ((said ? said === kind : !pre) && (ev === "marketplace.experience_reviewed" || ev === "marketplace.experience_review_chat_opened")) toast(t(ev.endsWith("reviewed") ? "live.reviewed" : "live.chat"), { tone: "info" });
    });
    const offSync = onUserSocketResync(soon);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      off();
      offSync();
    };
  }, [load, kind, pre, t]);

  const catName = (id: string) => {
    const c = cats.find((x) => x.id === id);
    return c ? uzLabel(categoryName({ slug: c.slug, title: c.name }, locale), locale) : t("noCategory");
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
  const setPos = (i: number, patch: Partial<PositionDraft>) => setDraft((d) => (d ? { ...d, positions: d.positions.map((p, k) => (k === i ? { ...p, ...patch } : p)) } : d));
  const today = new Date().toISOString().slice(0, 10);
  const issue = experienceIssue(draft, today, pre);
  const desc = draft?.description.trim() ?? "";
  const descHits = draft ? findContacts(draft.description) : [];

  async function addFiles(files: FileList | null) {
    if (!draft || !files?.length || uploading) return;
    const list = Array.from(files);
    const wrongType = list.find((f) => !(EVIDENCE_TYPES as readonly string[]).includes(f.type));
    if (wrongType) return setNote({ ok: false, msg: t("fileType", { name: wrongType.name }) });
    const tooBig = list.find((f) => f.size > EVIDENCE_MAX_BYTES);
    if (tooBig) return setNote({ ok: false, msg: t("fileBig", { name: tooBig.name }) });
    setUploading(true);
    setNote(null);
    try {
      const up: ExperienceEvidence[] = [];
      for (const f of list) up.push(await uploadExperienceEvidence(f));
      setDraft((d) => (d ? { ...d, evidence: [...d.evidence, ...up.filter((x) => x.id)] } : d));
    } catch (e) {
      logApiError("experience.evidence", e);
      const fe = experienceErrorOf(e);
      setNote({ ok: false, msg: fe && t.has(`err.${fe.code}`) ? t(`err.${fe.code}`) : t("fileFailed") });
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
      await submitExperience({
        sourceId: draft.sourceId || undefined,
        kind,
        categoryId: draft.categoryId,
        subcategoryId: draft.subcategoryId,
        workplace: draft.workplace,
        positions: draft.positions.map(({ title, startedOn, endedOn, isCurrent, description }) => ({ title, startedOn, endedOn, isCurrent, description })),
        description: draft.description,
        evidenceIds: draft.evidence.map((x) => x.id),
      });
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
  const miss = (k: string, pos = -1) => (tried && issue?.key === k && issue.pos === pos ? true : undefined);
  const periodOf = (p: { startedAt: string; endedAt: string; isCurrent: boolean }) => [p.startedAt ? dateOnly(p.startedAt, locale) : "", p.isCurrent ? t("now") : p.endedAt ? dateOnly(p.endedAt, locale) : ""].filter(Boolean).join(" — ");
  const mine = groups?.filter((g) => (g.current ?? g.pending ?? g.latest)?.kind === kind) ?? null;
  const approved = (mine ?? []).filter((g) => g.current);
  // Category experience only; pre-advocate employment never shows years.
  const years = backendYears ?? approvedYears(approved, today);
  const pending = (mine ?? []).filter((g) => g.pending).length;
  const secDone = {
    area: pre || !!draft?.categoryId,
    work: !!draft && !!draft.workplace.trim() && draft.positions.every((p) => p.title.trim() && p.startedOn && (p.isCurrent || p.endedOn)),
    proof: desc.length >= DESC_MIN && !descHits.length,
    files: !!draft?.evidence.length,
  };
  const doneCount = Object.values(secDone).filter(Boolean).length - (pre ? 1 : 0);
  const secTotal = pre ? 3 : 4;
  const durText = (s: { y: number; m: number } | null) => (s ? (s.y || s.m ? [s.y ? t("durY", { n: s.y }) : "", s.m ? t("durM", { n: s.m }) : ""].filter(Boolean).join(" ") : t("durLess")) : "");

  return (
    <section className={pre ? "ppanel exp exp--pre" : "ppanel exp"} aria-labelledby={`exp-title-${kind}`} data-ai-target={pre ? "profile:pre-advocate" : "profile:experience"}>
      <div className="ppanel__h exp__h">
        <b className="ppanel__t" id={`exp-title-${kind}`}>
          <span className="pico">{pre ? <IconHistory /> : <IconAward />}</span>
          {tk("title")}
        </b>
        <button type="button" className="btn btn--pri btn--sm" onClick={() => open(emptyDraft())} disabled={!!draft}>
          <IconPlus aria-hidden="true" />
          {tk("add")}
        </button>
      </div>
      <p className="exp__lead">{tk("lead")}</p>

      {mine?.length ? (
        <div className="exp__sum" role="status">
          <div>
            <b className="sx-num">{approved.length}</b>
            <small>{tk("sumApproved")}</small>
          </div>
          {pre ? null : (
            <div>
              <b className="sx-num">{years}</b>
              <small>{t("sumYears")}</small>
            </div>
          )}
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
      {mine && !mine.length ? (
        <div className="exp__empty">
          <span className="exp__empty-ic" aria-hidden="true">
            {pre ? <IconBuilding /> : <IconScale />}
          </span>
          <b>{tk("emptyTitle")}</b>
          <p>{tk("emptyText")}</p>
          <button type="button" className="btn btn--line btn--sm" onClick={() => open(emptyDraft())}>
            <IconPlus aria-hidden="true" />
            {tk("add")}
          </button>
        </div>
      ) : null}
      {mine?.length ? (
        <ul className="exp__grid">
          {mine.map((g) => {
            const shown = g.current ?? g.pending ?? g.latest;
            if (!shown) return null;
            const rejected = g.latest?.status === "rejected" ? g.latest : null;
            const state = g.current ? "approved" : g.pending ? "pending" : rejected ? "rejected" : "draft";
            const sub = pre ? "" : subName(shown.categoryId, shown.subcategoryId);
            const head = pre ? t("pre.org") : catName(shown.categoryId);
            return (
              <li key={g.rootId} className="exp__card" data-s={state}>
                <div className="exp__card-h">
                  <div className="exp__card-t">
                    <b>{shown.workplace || head}</b>
                    <small>{[head, sub].filter(Boolean).join(" · ")}</small>
                  </div>
                  {g.pending ? (
                    <button type="button" className="btn btn--soft btn--sm" onClick={() => void cancel(g.pending!.id)} disabled={busy}>
                      {t("cancelPending")}
                    </button>
                  ) : (
                    <button type="button" className="exp__edit" onClick={() => open(draftOf(g.latest ?? shown, g.current?.id ?? ""))} aria-label={t("editNamed", { name: shown.workplace || head })} disabled={!!draft}>
                      <IconEdit aria-hidden="true" />
                    </button>
                  )}
                </div>
                <div className="exp__chips">
                  {g.current ? <span className="exp__chip" data-s="approved">{g.current.years !== null && !pre ? t("status.approvedYears", { n: g.current.years }) : t("status.approved")}</span> : null}
                  {g.pending ? <span className="exp__chip" data-s="pending">{t("status.pending")}</span> : null}
                  {rejected ? <span className="exp__chip" data-s="rejected">{t("status.rejected")}</span> : null}
                  {g.revisionCount > 1 ? <span className="exp__chip">{t("revisions", { n: g.revisionCount })}</span> : null}
                </div>
                {shown.positions.length ? (
                  <ol className="exp__roles">
                    {shown.positions.map((p, i) => (
                      <li key={`${p.title}-${i}`} data-current={p.isCurrent || undefined}>
                        <i aria-hidden="true" />
                        <span>
                          <b>{p.title}</b>
                          <small>
                            <IconCalendar aria-hidden="true" />
                            {periodOf(p)}
                          </small>
                        </span>
                      </li>
                    ))}
                  </ol>
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
        title={draft?.sourceId ? tk("editTitle") : tk("addTitle")}
        description={draft?.sourceId ? t("editNote") : tk("verifyNote")}
        icon={pre ? <IconHistory /> : <IconAward />}
        size="lg"
        busy={busy}
        dirty={!!draft && (!!draft.workplace || !!draft.description)}
        footer={
          <>
            {tried && issue ? (
              <small className="exp__issue" role="alert">
                {issue.pos >= 0 && draft && draft.positions.length > 1 ? `${t("positionN", { n: issue.pos + 1 })}: ` : ""}
                {t(`issue.${issue.key}`, { n: DESC_MIN })}
              </small>
            ) : null}
            <button type="button" className="btn btn--line" onClick={() => setDraft(null)} disabled={busy}>
              {t("cancel")}
            </button>
            <button type="submit" form={`exp-form-${kind}`} className="btn btn--pri" disabled={busy || uploading}>
              {busy ? t("sending") : t("submit")}
            </button>
          </>
        }
      >
        {draft ? (
          <form
            id={`exp-form-${kind}`}
            className="exp__form"
            onSubmit={(e) => {
              e.preventDefault();
              setTried(true);
              void save();
            }}
            noValidate
          >
            <div className="exp__progress" role="status">
              <span>{t("progress", { done: doneCount, total: secTotal })}</span>
              <i aria-hidden="true">
                <b style={{ width: `${(doneCount / secTotal) * 100}%` }} />
              </i>
            </div>

            {pre ? null : (
            <fieldset className="exp__sec" data-done={secDone.area || undefined}>
              <SecHead icon={IconScale} done={secDone.area} title={t("secArea")} hint={t("secAreaHint")} />
              <div className="exp__f" data-bad={bad("category_id") ?? miss("category")}>
                <span id="exp-cat-l">{t("category")}</span>
                <Select
                  value={draft.categoryId}
                  onChange={(v) => setDraft({ ...draft, categoryId: v, subcategoryId: "" })}
                  options={cats.map((c) => ({ value: c.id, label: uzLabel(categoryName({ slug: c.slug, title: c.name }, locale), locale), hint: subsOf(c.id).length ? t("subsN", { n: subsOf(c.id).length }) : undefined }))}
                  placeholder={t("pickCategory")}
                  labelId="exp-cat-l"
                  search
                  disabled={!!draft.sourceId}
                  invalid={!!(bad("category_id") ?? miss("category"))}
                />
                {draft.sourceId ? <small className="exp__help">{t("categoryLocked")}</small> : null}
              </div>
              {subsOf(draft.categoryId).length ? (
                <div className="exp__f">
                  <span id="exp-sub-l">{t("subcategory")}</span>
                  <div className="exp__opts" role="radiogroup" aria-labelledby="exp-sub-l" data-bad={bad("subcategory_id")}>
                    {[{ id: "", title: t("anySubcategory") }, ...subsOf(draft.categoryId)].map((sc) => {
                      const on = draft.subcategoryId === sc.id;
                      return (
                        <button key={sc.id || "all"} type="button" role="radio" aria-checked={on} className="exp__opt" onClick={() => setDraft({ ...draft, subcategoryId: sc.id })}>
                          {on ? <IconCheck aria-hidden="true" /> : null}
                          {sc.id ? uzLabel(sc.title, locale) : sc.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </fieldset>
            )}

            <fieldset className="exp__sec" data-done={secDone.work || undefined}>
              <SecHead icon={IconBriefcase} done={secDone.work} title={tk("secWork")} hint={tk("secWorkHint")} />
              <label className="exp__f">
                <span>{tk("workplace")}</span>
                <span className="exp__in">
                  <IconBuilding aria-hidden="true" />
                  <input value={draft.workplace} maxLength={200} placeholder={tk("workplacePh")} onChange={(e) => setDraft({ ...draft, workplace: e.target.value })} aria-invalid={bad("workplace") ?? miss("workplace")} />
                </span>
              </label>
              <ol className="exp__positions">
                {draft.positions.map((p, i) => {
                  const span = spanOf(p.startedOn, p.isCurrent ? "" : p.endedOn);
                  return (
                    <li key={p.key} className="exp__pos">
                      <div className="exp__pos-h">
                        <span className="exp__pos-n" aria-hidden="true">
                          {i + 1}
                        </span>
                        <b>{t("positionN", { n: i + 1 })}</b>
                        {span ? <em>{durText(span)}</em> : null}
                        {draft.positions.length > 1 ? (
                          <button type="button" className="exp__pos-x" onClick={() => setDraft({ ...draft, positions: draft.positions.filter((x) => x.key !== p.key) })} aria-label={t("removePosition", { n: i + 1 })}>
                            <IconTrash aria-hidden="true" />
                          </button>
                        ) : null}
                      </div>
                      <label className="exp__f">
                        <span>{t("position")}</span>
                        <span className="exp__in">
                          <IconBriefcase aria-hidden="true" />
                          <input value={p.title} maxLength={200} placeholder={t("positionPh")} onChange={(e) => setPos(i, { title: e.target.value })} aria-invalid={bad(`positions.${i}.title`) ?? miss("position", i)} />
                        </span>
                      </label>
                      <div className="exp__seg" role="radiogroup" aria-label={t("period")}>
                        {[true, false].map((cur) => (
                          <button key={String(cur)} type="button" role="radio" aria-checked={p.isCurrent === cur} onClick={() => setPos(i, { isCurrent: cur })}>
                            {cur ? <IconClock aria-hidden="true" /> : <IconCalendar aria-hidden="true" />}
                            {cur ? t("periodNow") : t("periodEnded")}
                          </button>
                        ))}
                      </div>
                      <div className="exp__two">
                        <div className="exp__f" data-bad={bad(`positions.${i}.started_at`) ?? miss("started", i)}>
                          <span>{t("startedAt")}</span>
                          <DatePicker value={p.startedOn} max={today} onChange={(v) => setPos(i, { startedOn: v })} placeholder={t("pickDate")} ariaLabel={`${t("positionN", { n: i + 1 })}: ${t("startedAt")}`} />
                        </div>
                        {p.isCurrent ? (
                          <div className="exp__f">
                            <span>{t("endedAt")}</span>
                            <span className="exp__nowbox">
                              <i aria-hidden="true" />
                              {t("stillHere")}
                            </span>
                          </div>
                        ) : (
                          <div className="exp__f" data-bad={bad(`positions.${i}.ended_at`) ?? miss("ended", i)}>
                            <span>{t("endedAt")}</span>
                            <DatePicker value={p.endedOn} min={p.startedOn || undefined} max={today} onChange={(v) => setPos(i, { endedOn: v })} placeholder={t("pickDate")} ariaLabel={`${t("positionN", { n: i + 1 })}: ${t("endedAt")}`} />
                          </div>
                        )}
                      </div>
                      <label className="exp__f">
                        <span>
                          {t("positionDuties")} <em className="exp__opt-tag">{t("optional")}</em>
                        </span>
                        <textarea rows={2} maxLength={600} value={p.description} placeholder={t("positionDutiesPh")} onChange={(e) => setPos(i, { description: e.target.value })} />
                      </label>
                    </li>
                  );
                })}
              </ol>
              {draft.positions.length < MAX_POSITIONS ? (
                <button type="button" className="exp__addpos" onClick={() => setDraft({ ...draft, positions: [...draft.positions, newPosition()] })}>
                  <IconPlus aria-hidden="true" />
                  {t("addPosition")}
                </button>
              ) : null}
              <p className="exp__help">{tk("parallelNote")}</p>
            </fieldset>

            <fieldset className="exp__sec" data-done={secDone.proof || undefined}>
              <SecHead icon={IconFileText} done={secDone.proof} title={t("secProof")} hint={tk("secProofHint")} />
              <label className="exp__f">
                <span>{t("description")}</span>
                <textarea
                  rows={4}
                  maxLength={2000}
                  value={draft.description}
                  onChange={(e) => descStrip.change(e.target.value, e)}
                  onBlur={() => descStrip.blur(draft.description)}
                  placeholder={t("descriptionPh")}
                  aria-describedby={`exp-desc-g-${kind} exp-desc-n-${kind}`}
                  aria-invalid={descHits.length > 0 || miss("description") || undefined}
                />
                <span className="exp__meter" data-ok={desc.length >= DESC_MIN || undefined}>
                  <i aria-hidden="true">
                    <b style={{ width: `${Math.min(100, (desc.length / DESC_MIN) * 100)}%` }} />
                  </i>
                  <small id={`exp-desc-n-${kind}`} className="exp__count" data-short={desc.length < DESC_MIN || undefined}>
                    {desc.length < DESC_MIN ? t("descLeft", { n: DESC_MIN - desc.length }) : t("descCount", { n: desc.length })}
                  </small>
                </span>
              </label>
              <ContactGuardNote id={`exp-desc-g-${kind}`} hits={descHits} removed={descStrip.removed} />
            </fieldset>

            <fieldset className="exp__sec" data-done={secDone.files || undefined}>
              <SecHead icon={IconPaperclip} done={secDone.files} title={t("secFiles")} hint={t("secFilesHint")} optional />
              <div className="exp__why">
                <div>
                  <IconShieldCheck aria-hidden="true" />
                  <span>
                    <b>{t("why.checkTitle")}</b>
                    <small>{t("why.check")}</small>
                  </span>
                </div>
                <div>
                  <IconLock aria-hidden="true" />
                  <span>
                    <b>{t("why.privateTitle")}</b>
                    <small>{t("why.private")}</small>
                  </span>
                </div>
                {pre ? null : (
                  <div>
                    <IconTrendingUp aria-hidden="true" />
                    <span>
                      <b>{t("why.gainTitle")}</b>
                      <small>{t("why.gain")}</small>
                    </span>
                  </div>
                )}
              </div>
              <div className="exp__drop" data-busy={uploading || undefined}>
                <label>
                  <span className="exp__drop-ic" aria-hidden="true">
                    <IconUpload />
                  </span>
                  <b>{uploading ? t("uploading") : t("addFile")}</b>
                  <small>{t("evidenceHint")}</small>
                  <input type="file" multiple accept={EVIDENCE_TYPES.join(",")} disabled={uploading} onChange={(e) => void addFiles(e.target.files).finally(() => (e.target.value = ""))} />
                </label>
                {draft.evidence.length ? (
                  <ul>
                    {draft.evidence.map((f) => (
                      <li key={f.id}>
                        <span className="exp__file-ic" aria-hidden="true">
                          <IconFileText />
                        </span>
                        <span>{f.fileName || t("file")}</span>
                        <button type="button" aria-label={t("removeFile", { name: f.fileName || t("file") })} onClick={() => setDraft({ ...draft, evidence: draft.evidence.filter((x) => x.id !== f.id) })}>
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
