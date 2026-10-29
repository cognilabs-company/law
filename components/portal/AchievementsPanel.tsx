"use client";

import "./experience.css";
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactElement, type SVGProps } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import DatePicker from "@/components/DatePicker";
import Select from "@/components/Select";
import ListPager from "@/components/ui/ListPager";
import Segmented from "@/components/ui/Segmented";
import FieldError from "@/components/ui/FieldError";
import {
  IconAlert,
  IconCalendar,
  IconCheck,
  IconCircleCheck,
  IconClipboardList,
  IconClose,
  IconDocSearch,
  IconEdit,
  IconFileText,
  IconGavel,
  IconInfo,
  IconLayers,
  IconLock,
  IconPaperclip,
  IconPlus,
  IconGlobe,
  IconRefresh,
  IconScale,
  IconSearch,
  IconSend,
  IconShieldCheck,
  IconSparkle,
  IconStar,
  IconTag,
  IconTrendingUp,
  IconUpload,
} from "@/components/icons";
import ContactGuardNote, { useContactStrip } from "@/components/ui/ContactGuardNote";
import { categoryName } from "@/lib/categoryNames";
import { findContacts } from "@/lib/contactGuard";
import { dateOnly, fmtNum } from "@/lib/date";
import { errDetail, isAborted, isForbidden, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { uzLabel } from "@/lib/uzScript";
import { onUserSocketResync, subscribeUserEvents } from "@/lib/userSocket";
import { getServiceCategories, type BackendCategory } from "@/lib/services/backend";
import type { ExperienceEvidence } from "@/lib/services/experience";
import {
  ACHIEVEMENT_STATUSES,
  acceptOf,
  achievementErrorOf,
  downloadAchievementEvidence,
  fileIssue,
  getAchievementConfig,
  isPendingStatus,
  listMyAchievements,
  submitAchievement,
  uploadAchievementEvidence,
  type Achievement,
  type AchievementConfig,
  type AchievementGroup,
  type AchievementStatus,
  type AchievementErrorField,
} from "@/lib/services/achievements";
import { labelIn } from "@/lib/backendLabel";
import { useAchievementLabels } from "./achievementLabels";

// An advocate's professional achievements (contract 2026-10-29 §2): one
// stage of the case, a full or partial positive result, the category, the
// date and what exactly was reached, with the documents that prove it.
// Everything the form offers comes from the backend's config. Software
// checks the files first (advice only), then a LexGo operator decides; an
// approved achievement counts for the rating. Evidence never goes public.

const PAGE = 50;
const EVENTS = /^marketplace\.achievement_(ai_analysis_completed|reviewed|review_chat_opened)$/;
const STAGE_ICON: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  pre_investigation: IconDocSearch,
  inquiry: IconSearch,
  preliminary_investigation: IconClipboardList,
  court: IconGavel,
};
const RESULT_ICON: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = { full: IconCircleCheck, partial: IconTrendingUp };

type FileRow = { key: number; file: File | null; name: string; state: "uploading" | "done" | "error"; progress: number; error: string; evidence: ExperienceEvidence | null };
type Draft = { sourceId: string; stage: string; result: string; categoryId: string; achievedOn: string; description: string; files: FileRow[] };
let keySeq = 0;
const empty = (): Draft => ({ sourceId: "", stage: "", result: "", categoryId: "", achievedOn: "", description: "", files: [] });
const doneRow = (e: ExperienceEvidence): FileRow => ({ key: ++keySeq, file: null, name: e.fileName, state: "done", progress: 1, error: "", evidence: e });
const draftOf = (a: Achievement): Draft => ({ sourceId: a.id, stage: a.stage, result: a.result, categoryId: a.categoryId, achievedOn: a.achievedAt, description: a.description, files: a.evidence.map(doneRow) });

// The first thing still missing ("" = ready to send), by the config's rules.
export function achievementIssue(d: Pick<Draft, "stage" | "result" | "categoryId" | "achievedOn" | "description" | "files"> | null, cfg: AchievementConfig | null, today: string): string {
  if (!d) return "";
  if (!d.stage) return "stage";
  if (!d.result) return "result";
  if (!d.categoryId) return "category";
  if (!d.achievedOn || d.achievedOn > today) return "date";
  const n = d.description.trim().length;
  if (cfg && (n < cfg.descMin || (cfg.descMax > 0 && n > cfg.descMax))) return "description";
  if (findContacts(d.description).length) return "contacts";
  if (d.files.some((f) => f.state === "uploading")) return "uploading";
  if (d.files.some((f) => f.state === "error")) return "fileErrors";
  const done = d.files.filter((f) => f.state === "done").length;
  const ev = cfg?.evidence;
  if (ev && done < (ev.required ? Math.max(1, ev.minFiles) : ev.minFiles)) return "files";
  if (ev && ev.maxFiles > 0 && done > ev.maxFiles) return "tooMany";
  return "";
}
// The issue → the field it belongs to.
const ISSUE_FIELD: Record<string, AchievementErrorField> = { stage: "process_stage", result: "result_scope", category: "category_id", date: "achieved_at", description: "description", contacts: "description", files: "evidence", tooMany: "evidence", fileErrors: "evidence", uploading: "evidence" };

function Step({ icon: Icon, done, title, hint }: { icon: ComponentType<SVGProps<SVGSVGElement>>; done: boolean; title: string; hint: string }): ReactElement {
  return (
    <legend className="exp__legend">
      <span className="exp__n" data-done={done || undefined} aria-hidden="true">
        {done ? <IconCheck /> : <Icon />}
      </span>
      <span className="exp__lt">
        <b>{title}</b>
        <small>{hint}</small>
      </span>
    </legend>
  );
}

// The backend's workflow (§2: evidence_upload → submission →
// ai_advisory_analysis → operator_review → public_profile), each step with
// its own icon, marked by where this record stands.
const STEP_ICON: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  evidence_upload: IconUpload,
  submission: IconSend,
  ai_advisory_analysis: IconSparkle,
  operator_review: IconShieldCheck,
  public_profile: IconGlobe,
};
const STEP_AT: Partial<Record<AchievementStatus, string>> = { ai_analysis_pending: "ai_advisory_analysis", pending_review: "operator_review", changes_requested: "operator_review", rejected: "operator_review", approved: "public_profile" };
export function WorkTrack({ steps, status }: { steps: readonly string[]; status: AchievementStatus }): ReactElement {
  const t = useTranslations("portal.achievements.workflow");
  const known = steps.filter((s) => STEP_ICON[s] && t.has(s));
  const at = known.indexOf(STEP_AT[status] ?? "");
  const stuck = status === "rejected" || status === "changes_requested";
  return (
    <ol className="ach__track" aria-label={t("title")}>
      {known.map((s, i) => {
        const Icon = STEP_ICON[s];
        const state = status === "approved" || status === "superseded" || i < at ? "done" : i === at ? (stuck ? "bad" : "now") : "todo";
        return (
          <li key={s} data-state={state} aria-current={i === at ? "step" : undefined}>
            <i aria-hidden="true">{state === "done" ? <IconCheck /> : <Icon />}</i>
            <span>{t(s)}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function AchievementsPanel(): ReactElement | null {
  const t = useTranslations("portal.achievements");
  const te = useTranslations("portal.experience");
  const locale = useLocale();
  const [cfg, setCfg] = useState<AchievementConfig | null>(null);
  const [denied, setDenied] = useState(false);
  const L = useAchievementLabels(cfg);
  const [cats, setCats] = useState<BackendCategory[]>([]);
  // The list is paged by revision root (§4): groups[], total = roots.
  const [groups, setGroups] = useState<AchievementGroup[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalRecords, setTotalRecords] = useState(0);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [formNote, setFormNote] = useState("");
  const [fieldErr, setFieldErr] = useState<{ field: AchievementErrorField; msg: string } | null>(null);
  const [tried, setTried] = useState(false);
  const descStrip = useContactStrip((description) => setDraft((d) => (d ? { ...d, description } : d)));
  const shown = useRef(0);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const r = await listMyAchievements({ status, limit: Math.max(PAGE, shown.current), offset: 0 }, signal);
        shown.current = r.groups.length;
        setGroups(r.groups);
        setTotal(r.total);
        setTotalRecords(r.totalRecords);
        setFailed(false);
      } catch (e) {
        if (isAborted(e)) return;
        if (isForbidden(e)) return setDenied(true);
        logApiError("achievements.list", e);
        setFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [status],
  );
  async function more() {
    if (!groups || loading) return;
    setLoading(true);
    try {
      const r = await listMyAchievements({ status, limit: PAGE, offset: groups.length });
      const seen = new Set(groups.map((g) => g.rootId));
      const next = [...groups, ...r.groups.filter((g) => !seen.has(g.rootId))];
      shown.current = next.length;
      setGroups(next);
      setTotal(r.total);
      setTotalRecords(r.totalRecords);
    } catch (e) {
      if (!isAborted(e)) logApiError("achievements.more", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const ctl = new AbortController();
    getAchievementConfig(ctl.signal).then(setCfg, (e) => {
      if (isAborted(e)) return;
      if (isForbidden(e)) return setDenied(true);
      logApiError("achievements.config", e);
    });
    getServiceCategories().then(
      (c) => !ctl.signal.aborted && setCats(c),
      () => undefined,
    );
    return () => ctl.abort();
  }, []);
  useEffect(() => {
    const ctl = new AbortController();
    void Promise.resolve().then(() => load(ctl.signal));
    let timer = 0;
    const soon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), 500);
    };
    // The software check finished, an operator decided or opened a chat.
    const offEv = subscribeUserEvents((e) => {
      const ev = String(e.event ?? "");
      if (!EVENTS.test(ev)) return;
      soon();
      const kind = ev.slice("marketplace.achievement_".length);
      toast(t(`live.${kind}`), { tone: kind === "reviewed" ? "ok" : "info" });
    });
    const offSync = onUserSocketResync(soon);
    return () => {
      ctl.abort();
      window.clearTimeout(timer);
      offEv();
      offSync();
    };
  }, [load, t]);

  const today = new Date().toISOString().slice(0, 10);
  const issue = achievementIssue(draft, cfg, today);
  const desc = draft?.description.trim() ?? "";
  const descMin = cfg?.descMin ?? 0;
  const descMax = cfg?.descMax ?? 0;
  const descHits = draft ? findContacts(draft.description) : [];
  const catName = (id: string, title = "") => {
    const c = cats.find((x) => x.id === id);
    return c ? uzLabel(categoryName({ slug: c.slug, title: c.name }, locale), locale) : title;
  };
  const warning = labelIn(cfg?.warning, locale);
  const open = (d: Draft) => {
    descStrip.reset();
    setTried(false);
    setFieldErr(null);
    setFormNote("");
    setNote(null);
    setDraft(d);
  };
  const setRow = (key: number, patch: Partial<FileRow>) => setDraft((d) => (d ? { ...d, files: d.files.map((f) => (f.key === key ? { ...f, ...patch } : f)) } : d));

  async function upload(row: FileRow) {
    if (!row.file) return;
    setRow(row.key, { state: "uploading", progress: 0, error: "" });
    try {
      const ev = await uploadAchievementEvidence(row.file, (p) => setRow(row.key, { progress: p }));
      setRow(row.key, { state: "done", progress: 1, evidence: ev, name: ev.fileName || row.name });
    } catch (e) {
      logApiError("achievements.evidence", e);
      const fe = achievementErrorOf(e);
      setRow(row.key, { state: "error", error: fe && t.has(`err.${fe.code}`) ? t(`err.${fe.code}`) : t("fileFailed") });
    }
  }
  function addFiles(files: FileList | null) {
    if (!draft || !files?.length || !cfg) return;
    const ev = cfg.evidence;
    const room = ev.maxFiles > 0 ? ev.maxFiles - draft.files.length : Infinity;
    const picked = Array.from(files);
    if (picked.length > room) setFormNote(t("tooManyFiles", { n: ev.maxFiles }));
    else setFormNote("");
    const rows: FileRow[] = picked.slice(0, Math.max(0, room)).map((f) => {
      const bad = fileIssue(f, ev);
      return { key: ++keySeq, file: f, name: f.name, state: bad ? "error" : "uploading", progress: 0, error: bad === "type" ? t("fileType") : bad === "size" ? t("fileBig", { mb: fmtNum(ev.maxBytes / (1024 * 1024), locale, 1) }) : "", evidence: null };
    });
    setDraft((d) => (d ? { ...d, files: [...d.files, ...rows] } : d));
    // One file per request, one after another.
    void rows.filter((r) => r.state === "uploading").reduce((p, r) => p.then(() => upload(r)), Promise.resolve());
  }

  async function save() {
    if (!draft || issue || busy || sending.current) return;
    sending.current = true;
    setBusy(true);
    setNote(null);
    setFormNote("");
    setFieldErr(null);
    try {
      await submitAchievement({
        sourceId: draft.sourceId || undefined,
        stage: draft.stage,
        result: draft.result,
        categoryId: draft.categoryId,
        achievedOn: draft.achievedOn,
        description: draft.description,
        evidenceIds: draft.files.flatMap((f) => (f.state === "done" && f.evidence ? [f.evidence.id] : [])),
      });
      setDraft(null);
      setNote({ ok: true, msg: t("sent") });
      await load();
    } catch (e) {
      logApiError("achievements.submit", e);
      const fe = achievementErrorOf(e);
      const msg = fe && t.has(`err.${fe.code}`) ? t(`err.${fe.code}`) : errDetail(e) || t("failed");
      if (fe?.field === "missing") {
        // Gone meanwhile: read the list again and say so.
        setDraft(null);
        setNote({ ok: false, msg });
        await load();
      } else if (fe && fe.field !== "form" && fe.field !== "file") setFieldErr({ field: fe.field, msg });
      else setFormNote(msg);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const approved = (groups ?? []).filter((g) => g.current).length;
  const pending = (groups ?? []).filter((g) => g.pending).length;
  // A server refusal is written under its field; a local gap only marks the
  // field (its sentence is in the footer, once).
  const errAt = (f: AchievementErrorField) => (fieldErr?.field === f ? fieldErr.msg : "");
  const badAt = (f: AchievementErrorField) => (fieldErr?.field === f || (tried && ISSUE_FIELD[issue] === f) ? true : undefined);
  const filesDone = draft?.files.filter((f) => f.state === "done").length ?? 0;
  const hint = cfg
    ? [
        cfg.evidence.extensions.map((x) => x.toUpperCase()).join(", "),
        cfg.evidence.maxBytes > 0 ? t("upToMb", { mb: fmtNum(cfg.evidence.maxBytes / (1024 * 1024), locale, 1) }) : "",
        cfg.evidence.maxFiles > 0 ? t("filesRange", { min: Math.max(cfg.evidence.minFiles, 1), max: cfg.evidence.maxFiles }) : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <section className="ppanel exp ach" aria-labelledby="ach-title" data-ai-target="profile:achievements">
      <div className="ppanel__h exp__h">
        <b className="ppanel__t" id="ach-title">
          <span className="pico">
            <IconStar />
          </span>
          {t("title")}
        </b>
        <button type="button" className="btn btn--pri btn--sm" onClick={() => open(empty())} disabled={!!draft || !cfg}>
          <IconPlus aria-hidden="true" />
          {t("add")}
        </button>
      </div>
      <p className="exp__lead">{t("lead")}</p>
      <p className="ach__ai">
        <IconSparkle aria-hidden="true" />
        {t("aiAdvisory")}
      </p>
      {denied ? (
        <p className="ach__denied" role="note">
          <IconLock aria-hidden="true" />
          {t("advocateOnly")}
        </p>
      ) : null}
      {groups?.length || status ? (
        <div className="exp__sum" role="status">
          <div>
            <b className="sx-num">{approved}</b>
            <small>{t("sumApproved")}</small>
          </div>
          <div data-tone={pending ? "warn" : undefined}>
            <b className="sx-num">{pending}</b>
            <small>{t("sumPending")}</small>
          </div>
          <div title={totalRecords > total ? t("revisionsTotal", { n: totalRecords }) : undefined}>
            <b className="sx-num">{total}</b>
            <small>{t("sumTotal")}</small>
          </div>
        </div>
      ) : null}
      {groups?.length || status ? (
        <div className="ach__filter">
          <Segmented
            size="sm"
            value={status}
            onChange={(v) => {
              shown.current = 0;
              setGroups(null);
              setStatus(v);
            }}
            label={t("filter")}
            aiId="profile.achievements.filter"
            options={[{ value: "", label: t("all") }, ...ACHIEVEMENT_STATUSES.map((s) => ({ value: s, label: L.status(s) }))]}
          />
        </div>
      ) : null}
      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
      {failed ? <Notice ok={false} msg={t("loadFailed")} /> : null}
      {!groups && !failed && !denied ? (
        <div className="exp__grid" aria-hidden="true">
          <div className="exp__card exp__card--ghost" />
        </div>
      ) : null}
      {groups && !groups.length ? (
        <div className="exp__empty">
          <span className="exp__empty-ic" aria-hidden="true">
            <IconScale />
          </span>
          <b>{status ? t("emptyFiltered") : t("emptyTitle")}</b>
          {status ? null : <p>{t("emptyText")}</p>}
          {status || !cfg ? null : (
            <button type="button" className="btn btn--line btn--sm" onClick={() => open(empty())}>
              <IconPlus aria-hidden="true" />
              {t("add")}
            </button>
          )}
        </div>
      ) : null}
      {groups?.length ? (
        <ul className="exp__grid">
          {groups.map((g) => {
            const a = g.pending ?? g.latest ?? g.current;
            if (!a) return null;
            const state = a.status === "approved" ? "approved" : isPendingStatus(a.status) ? "pending" : a.status === "rejected" || a.status === "changes_requested" ? "rejected" : "draft";
            const SIcon = STAGE_ICON[a.stage] ?? IconScale;
            const turned = a.status === "rejected" || a.status === "changes_requested";
            return (
              <li key={g.rootId} className="exp__card ach__card" data-s={state}>
                <div className="exp__card-h">
                  <span className="ach__stage-ic" aria-hidden="true">
                    <SIcon />
                  </span>
                  <div className="exp__card-t">
                    <b>{L.stage(a.stage)}</b>
                    <small>{L.result(a.result)}</small>
                  </div>
                  {a.status !== "superseded" ? (
                    <button
                      type="button"
                      className="exp__edit"
                      onClick={() => open(draftOf(g.latest ?? a))}
                      aria-label={t("revise")}
                      title={g.pending ? t("revisePending") : t("revise")}
                      disabled={!!draft || !!g.pending || !cfg}
                    >
                      <IconEdit aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
                <div className="exp__chips">
                  <span className="exp__chip" data-s={state === "draft" ? undefined : state}>
                    {L.status(a.status)}
                  </span>
                  {a.version ? <span className="exp__chip">{t("versionN", { n: a.version })}</span> : null}
                  {a.status === "approved" ? null : <span className="exp__chip">{t("notPublic")}</span>}
                </div>
                <p className="exp__date">
                  <IconTag aria-hidden="true" />
                  {catName(a.categoryId, a.categoryTitle) || t("noCategory")}
                  {a.achievedAt ? (
                    <>
                      <IconCalendar aria-hidden="true" />
                      {dateOnly(a.achievedAt, locale)}
                    </>
                  ) : null}
                </p>
                {cfg?.workflow.length ? <WorkTrack steps={cfg.workflow} status={a.status} /> : null}
                {a.description ? <p className="exp__desc">{a.description}</p> : null}
                {a.evidence.length ? (
                  <span className="exp__files">
                    {a.evidence.map((f) => (
                      <button key={f.id} type="button" className="exp__fileb" onClick={() => void downloadAchievementEvidence(f).catch((e) => logApiError("achievements.download", e))}>
                        <IconPaperclip aria-hidden="true" />
                        {f.fileName || te("file")}
                      </button>
                    ))}
                  </span>
                ) : null}
                {a.ai ? (
                  <p className="ach__aistate" data-ai={a.ai}>
                    <IconInfo aria-hidden="true" />
                    {L.ai(a.ai)}
                  </p>
                ) : null}
                {g.pending && g.current ? <p className="exp__note" data-tone="warn">{t("pendingKeeps")}</p> : null}
                {turned && a.reason ? <p className="exp__note" data-tone="bad">{t("operatorReason", { text: a.reason })}</p> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {groups ? <ListPager count={groups.length} total={total} step={PAGE} onMore={() => void more()} loading={loading} /> : null}

      <Modal
        open={!!draft}
        onClose={() => (busy ? undefined : setDraft(null))}
        title={draft?.sourceId ? t("editTitle") : t("addTitle")}
        description={t("verifyNote")}
        icon={<IconStar />}
        size="lg"
        busy={busy}
        dirty={!!draft && (!!draft.description || draft.files.length > 0)}
        footer={
          <>
            {warning ? (
              <p className="ach__warn" role="note">
                <IconAlert aria-hidden="true" />
                {warning}
              </p>
            ) : null}
            {tried && issue ? (
              <small className="exp__issue" role="alert">
                {t(`issue.${issue}`, { min: descMin, max: descMax, n: Math.max(cfg?.evidence.minFiles ?? 1, 1), max_files: cfg?.evidence.maxFiles ?? 0 })}
              </small>
            ) : null}
            <button type="button" className="btn btn--line" onClick={() => setDraft(null)} disabled={busy}>
              {te("cancel")}
            </button>
            <button type="submit" form="ach-form" className="btn btn--pri" disabled={busy}>
              {busy ? te("sending") : te("submit")}
            </button>
          </>
        }
      >
        {draft && cfg ? (
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
            {formNote ? <Notice ok={false} msg={formNote} /> : null}
            <fieldset className="exp__sec" data-done={(!!draft.stage && !!draft.result) || undefined}>
              <Step icon={IconLayers} done={!!draft.stage && !!draft.result} title={t("secStage")} hint={t("secStageHint")} />
              <div className="ach__types" role="radiogroup" aria-label={t("stageLabel")} data-bad={badAt("process_stage")}>
                {cfg.stages.map((s) => {
                  const Icon = STAGE_ICON[s.value] ?? IconScale;
                  return (
                    <button key={s.value} type="button" role="radio" aria-checked={draft.stage === s.value} className="ach__type ach__type--ic" onClick={() => setDraft({ ...draft, stage: s.value })}>
                      <i aria-hidden="true">
                        <Icon />
                      </i>
                      <b>{L.stage(s.value)}</b>
                    </button>
                  );
                })}
              </div>
              <FieldError id="ach-err-process_stage" msg={errAt("process_stage")} />
              <div className="exp__f">
                <span id="ach-res-l">{t("resultLabel")}</span>
                <div className="ach__results" role="radiogroup" aria-labelledby="ach-res-l" data-bad={badAt("result_scope")}>
                  {cfg.results.map((r) => {
                    const Icon = RESULT_ICON[r.value] ?? IconCheck;
                    return (
                      <button key={r.value} type="button" role="radio" aria-checked={draft.result === r.value} className="ach__res" data-r={r.value} onClick={() => setDraft({ ...draft, result: r.value })}>
                        <Icon aria-hidden="true" />
                        {L.result(r.value)}
                      </button>
                    );
                  })}
                </div>
                <FieldError id="ach-err-result_scope" msg={errAt("result_scope")} />
              </div>
            </fieldset>

            <fieldset className="exp__sec" data-done={(!!draft.categoryId && !!draft.achievedOn && desc.length >= descMin && !descHits.length) || undefined}>
              <Step icon={IconFileText} done={!!draft.categoryId && !!draft.achievedOn && desc.length >= descMin && !descHits.length} title={t("secWhat")} hint={t("secWhatHint")} />
              <div className="exp__two">
                <div className="exp__f" data-bad={badAt("category_id")}>
                  <span id="ach-cat-l">{t("category")}</span>
                  <Select
                    value={draft.categoryId}
                    onChange={(v) => setDraft({ ...draft, categoryId: v })}
                    options={cats.map((c) => ({ value: c.id, label: uzLabel(categoryName({ slug: c.slug, title: c.name }, locale), locale) }))}
                    placeholder={t("pickCategory")}
                    labelId="ach-cat-l"
                    search
                    invalid={!!badAt("category_id")}
                  />
                  <FieldError id="ach-err-category_id" msg={errAt("category_id")} />
                </div>
                <div className="exp__f" data-bad={badAt("achieved_at")}>
                  <span>{t("date")}</span>
                  <DatePicker value={draft.achievedOn} max={today} onChange={(v) => setDraft({ ...draft, achievedOn: v })} placeholder={te("pickDate")} ariaLabel={t("date")} />
                  <FieldError id="ach-err-achieved_at" msg={errAt("achieved_at")} />
                </div>
              </div>
              <label className="exp__f">
                <span>{t("description")}</span>
                <textarea
                  rows={5}
                  maxLength={descMax}
                  value={draft.description}
                  onChange={(e) => descStrip.change(e.target.value, e)}
                  onBlur={() => descStrip.blur(draft.description)}
                  placeholder={t("descriptionPh")}
                  aria-invalid={descHits.length > 0 || badAt("description")}
                />
                <span className="exp__meter" data-ok={desc.length >= descMin || undefined}>
                  <i aria-hidden="true">
                    <b style={{ width: `${Math.min(100, (desc.length / descMax) * 100)}%` }} />
                  </i>
                  <small className="exp__count" data-short={desc.length < descMin || undefined}>
                    {desc.length < descMin ? te("descLeft", { n: descMin - desc.length }) : t("descOf", { n: fmtNum(desc.length, locale), max: fmtNum(descMax, locale) })}
                  </small>
                </span>
              </label>
              <FieldError id="ach-err-description" msg={errAt("description")} />
              <ContactGuardNote hits={descHits} removed={descStrip.removed} verifiedLine={false} />
            </fieldset>

            <fieldset className="exp__sec" data-done={(filesDone >= Math.max(cfg.evidence.minFiles, 1) && !draft.files.some((f) => f.state !== "done")) || undefined}>
              <Step icon={IconPaperclip} done={filesDone >= Math.max(cfg.evidence.minFiles, 1) && !draft.files.some((f) => f.state !== "done")} title={t("secProof")} hint={t("secProofHint")} />
              <p className="ach__private">
                <IconLock aria-hidden="true" />
                {t("privateNote")}
              </p>
              <div className="exp__drop" data-bad={badAt("evidence")}>
                {cfg.evidence.maxFiles <= 0 || draft.files.length < cfg.evidence.maxFiles ? (
                  <label>
                    <span className="exp__drop-ic" aria-hidden="true">
                      <IconUpload />
                    </span>
                    <b>{te("addFile")}</b>
                    {hint ? <small>{hint}</small> : null}
                    <input type="file" multiple accept={acceptOf(cfg.evidence) || undefined} onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} aria-label={te("addFile")} />
                  </label>
                ) : null}
                {draft.files.length ? (
                  <ul className="ach__files">
                    {draft.files.map((f) => (
                      <li key={f.key} data-state={f.state}>
                        <span className="exp__file-ic" aria-hidden="true">
                          {f.state === "error" ? <IconAlert /> : f.state === "done" ? <IconCheck /> : <IconFileText />}
                        </span>
                        <span className="ach__fm">
                          <b>{f.name || te("file")}</b>
                          {f.state === "uploading" ? (
                            <i className="ach__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(f.progress * 100)} aria-label={t("uploadingNamed", { name: f.name })}>
                              <b style={{ width: `${Math.round(f.progress * 100)}%` }} />
                            </i>
                          ) : f.state === "error" ? (
                            <small>{f.error}</small>
                          ) : null}
                        </span>
                        <span className="ach__facts">
                          {f.state === "error" && f.file && !fileIssue(f.file, cfg.evidence) ? (
                            <button type="button" aria-label={t("retryNamed", { name: f.name })} onClick={() => void upload(f)}>
                              <IconRefresh />
                            </button>
                          ) : null}
                          {f.state !== "uploading" ? (
                            <button type="button" aria-label={te("removeFile", { name: f.name || te("file") })} onClick={() => setDraft({ ...draft, files: draft.files.filter((x) => x.key !== f.key) })}>
                              <IconClose />
                            </button>
                          ) : (
                            <em>{`${Math.round(f.progress * 100)}%`}</em>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <FieldError id="ach-err-evidence" msg={errAt("evidence")} />
            </fieldset>
          </form>
        ) : null}
      </Modal>
    </section>
  );
}
