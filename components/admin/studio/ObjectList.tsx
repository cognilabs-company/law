"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { aiId } from "@/lib/ai/ids";
import { toast } from "@/lib/toast";
import { logApiError } from "@/lib/http";
import { useAiField } from "@/lib/ai/registry";
import FilterBar from "@/components/filters/FilterBar";
import {
  archiveStudioRecord,
  cloneStudioObject,
  isApprovalFree,
  listStudioRecords,
  STUDIO_STATUSES,
  studioObjectIdOf,
  useStudioAccess,
  useStudioRegistry,
  type StudioConstructor,
  type StudioRecord,
  type StudioRecordSource,
  type StudioRecords,
  type StudioStatus,
} from "@/lib/services/studio";
import { ctorMeta } from "@/lib/studio/constructors";
import { RiskBadge, SurfaceList } from "./guide";
import StudioShell from "./StudioShell";
import { ConstructorIcon, StudioEmpty, StudioErrorNote, StudioLoading, StudioStatusPill } from "./bits";
import { CtorSequence } from "./GroupFlow";
import { useStudioHuman } from "./human";
import { IconArchive, StudioConfirm, studioEventCode, useStudioRefetch } from "./dash/shared";
import { IconBolt, IconCircleCheck, IconClipboardCheck, IconClock, IconCopy, IconEdit, IconEye, IconHistory, IconInfo, IconLayers, IconLock, IconPlus, IconPower, IconSearch, IconShieldCheck, IconUser } from "@/components/icons";

const PAGE = 50;
const RUNTIME_STATUSES = ["active", "inactive"];

type ListState = {
  key: string;
  phase: "ready" | "error";
  data: StudioRecords | null;
  error: unknown;
};

const NONE: ListState = { key: "", phase: "ready", data: null, error: null };

// Where a record's action leads: a Studio object opens in its editor; a
// form context (view, edit or clone of a runtime record) opens the editor on
// the backend's prepared form. The URL itself is the backend's (§8).
export function recordHref(code: string, url: string): string {
  const oid = studioObjectIdOf(url);
  if (oid) return `/admin/studio/o/${encodeURIComponent(oid)}`;
  if (url.includes("/form-context")) return `/admin/studio/o/new?new=${encodeURIComponent(code)}&ctx=${encodeURIComponent(url)}`;
  return "";
}

function CtorMeta({ code, ctor }: { code: string; ctor: StudioConstructor | null }) {
  const { t, num, where } = useStudioHuman();
  const free = isApprovalFree(code, ctor);
  const req = ctor?.schema.required.length ?? 0;
  return (
    <ul className="stu-olm" aria-label={t("list.meta.label")}>
      {ctor?.experience.whereUsed.length ? (
        <li title={t("list.meta.runtimeHint")}>
          <IconLayers aria-hidden />
          {t("list.meta.runtime")} {where(ctor).join(", ")}
        </li>
      ) : null}
      <li className={free ? "stu-olm__free" : undefined}>
        {free ? <IconBolt aria-hidden /> : <IconShieldCheck aria-hidden />}
        {free ? t("list.meta.free") : t("list.meta.approval")}
      </li>
      {req ? (
        <li>
          <IconClipboardCheck aria-hidden />
          {t("list.meta.required", { n: num(req) })}
        </li>
      ) : null}
      {ctor ? (
        <li className="stu-olm__risk">
          <RiskBadge risk={ctor.experience.risk} compact />
        </li>
      ) : null}
    </ul>
  );
}

// What the constructor does and where its result shows — readable before
// any object of it is opened (spec 10-12 §4).
function CtorAbout({ ctor }: { ctor: StudioConstructor | null }) {
  const { t, whenToUse, result } = useStudioHuman();
  // What it does is the page's lead; here: when to use it, what comes out,
  // and where that shows.
  const x = ctor?.experience;
  if (!ctor || !x) return null;
  return (
    <section className="stu-about" aria-label={t("ux.whatTitle")}>
      <div>
        <h3>{t("ux.when")}</h3>
        <p>{whenToUse(ctor)}</p>
        <small>{result(ctor)}</small>
      </div>
      {ctor.experience.whereUsed.length ? (
        <div>
          <h3>{t("ux.whereTitle")}</h3>
          <SurfaceList surfaces={ctor.experience.whereUsed} />
        </div>
      ) : null}
    </section>
  );
}

function RecordStatus({ r }: { r: StudioRecord }) {
  const { anyStatus } = useStudioHuman();
  if (r.source === "studio" && (STUDIO_STATUSES as string[]).includes(r.status)) return <StudioStatusPill status={r.status as StudioStatus} raw={r.status} />;
  const k = RUNTIME_STATUSES.includes(r.status) ? r.status : "";
  const Glyph = k === "active" ? IconCircleCheck : k === "inactive" ? IconPower : IconInfo;
  return (
    <span className={`stu-st stu-st--rt-${k || "other"}`}>
      <Glyph aria-hidden />
      {anyStatus(r.status)}
    </span>
  );
}

function ListBody({ code, ctor, canEdit, canArchive }: { code: string; ctor: StudioConstructor | null; canEdit: boolean; canArchive: boolean }) {
  const { t, num, ctorName, when } = useStudioHuman();
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [source, setSource] = useState<"" | StudioRecordSource>("");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [offset, setOffset] = useState(0);
  const [list, setList] = useState<ListState>(NONE);
  const [retryBusy, setRetryBusy] = useState(false);
  const [target, setTarget] = useState<StudioRecord | null>(null);
  const [archBusy, setArchBusy] = useState(false);
  const [archErr, setArchErr] = useState<unknown>(null);
  const [cloneOf, setCloneOf] = useState<StudioRecord | null>(null);
  const [cloneTitle, setCloneTitle] = useState("");
  const [cloneBusy, setCloneBusy] = useState(false);
  const [cloneErr, setCloneErr] = useState<unknown>(null);
  const [flashId, setFlashId] = useState("");
  const seq = useRef(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useAiField("admin.studio.list.search.input", { get: () => q, set: setQ });

  // The search goes to the backend a moment after the last key.
  useEffect(() => {
    const h = setTimeout(() => {
      setTerm(q.trim());
      setOffset(0);
    }, 350);
    return () => clearTimeout(h);
  }, [q]);

  const key = `${code}|${status}|${source}|${term}|${offset}`;
  const blocked = Boolean(ctor && (ctor.availability === "blocked" || ctor.missingRequired.length));
  const mayWrite = canEdit && !blocked;

  const fetchRows = useCallback(async (): Promise<boolean> => {
    const k = `${code}|${status}|${source}|${term}|${offset}`;
    const my = ++seq.current;
    try {
      const data = await listStudioRecords(code, { q: term, status, source, limit: PAGE, offset });
      if (my !== seq.current) return true;
      setList({ key: k, phase: "ready", data, error: null });
      return true;
    } catch (e) {
      if (my !== seq.current) return true;
      logApiError("studio.records", e);
      setList((cur) => (cur.key === k && cur.data ? { ...cur, error: e } : { ...NONE, key: k, phase: "error", error: e }));
      return false;
    }
  }, [code, status, source, term, offset]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  useStudioRefetch(
    () => void fetchRows(),
    (e) => {
      const c = studioEventCode(e);
      return !c || c === code;
    },
  );

  async function retry() {
    setRetryBusy(true);
    try {
      await fetchRows();
    } finally {
      setRetryBusy(false);
    }
  }

  function flash(id: string) {
    setFlashId(id);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashId(""), 2400);
  }

  async function doArchive() {
    if (!target) return;
    const r = target;
    setArchBusy(true);
    setArchErr(null);
    try {
      await archiveStudioRecord(r.actions.archive);
      setTarget(null);
      toast(t("list.archived", { title: r.title || t("list.untitled") }), { tone: "ok" });
      flash(r.id);
      void fetchRows();
    } catch (e) {
      logApiError("studio.archive", e);
      setArchErr(e);
    } finally {
      setArchBusy(false);
    }
  }

  function askClone(r: StudioRecord) {
    // A runtime record is copied through the backend's clone form.
    const href = recordHref(code, r.actions.clone);
    if (href && !studioObjectIdOf(r.actions.clone) && r.actions.clone.includes("/form-context")) {
      router.push(href);
      return;
    }
    setCloneErr(null);
    setCloneTitle(t("flow.cloneName", { title: r.title || t("list.untitled") }).slice(0, 200));
    setCloneOf(r);
  }

  async function doClone() {
    if (!cloneOf || !cloneTitle.trim()) return;
    setCloneBusy(true);
    setCloneErr(null);
    try {
      const made = await cloneStudioObject(cloneOf.actions.clone, cloneTitle.trim());
      setCloneOf(null);
      toast(t("flow.cloned"), { tone: "ok" });
      if (made.id) router.push(`/admin/studio/o/${encodeURIComponent(made.id)}`);
      else void fetchRows();
    } catch (e) {
      logApiError("studio.clone", e);
      setCloneErr(e);
    } finally {
      setCloneBusy(false);
    }
  }

  const statusOpts = [
    { value: "", label: t("common.all") },
    ...RUNTIME_STATUSES.map((s) => ({ value: s, label: t(`flow.rstatus.${s}`) })),
    ...STUDIO_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
  ];
  const sourceOpts = [
    { value: "", label: t("flow.source.all") },
    { value: "runtime", label: t("flow.source.runtime") },
    { value: "studio", label: t("flow.source.studio") },
  ];
  const current = list.key === key;
  const data = current ? list.data : null;
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const filtered = Boolean(status || source || term);
  const resetAll = () => {
    setStatus("");
    setSource("");
    setQ("");
    setTerm("");
    setOffset(0);
  };
  const createHref = `/admin/studio/o/new?new=${encodeURIComponent(code)}${data?.createUrl ? `&ctx=${encodeURIComponent(data.createUrl)}` : ""}`;
  const newBtn = mayWrite ? (
    <Link href={createHref} className="btn btn--pri btn--sm" data-ai-id="admin.studio.list.empty.create" data-ai-type="link" data-ai-label={t("flow.create")}>
      <IconPlus aria-hidden />
      {t("flow.create")}
    </Link>
  ) : null;

  let content;
  if (!current && !list.data) content = <StudioLoading rows={4} />;
  else if (list.phase === "error" && current) content = <StudioErrorNote error={list.error} onRetry={() => void retry()} busy={retryBusy} />;
  else if (current && !rows.length && !filtered && offset === 0)
    content = (
      <StudioEmpty icon={ctorMeta(code).icon} tone="brand" title={t("list.emptyTitle")} text={canEdit ? t("list.emptyText", { name: ctorName(code, ctor?.title) }) : t("list.emptyRead")}>
        {newBtn}
      </StudioEmpty>
    );
  else if (current && !rows.length)
    content = (
      <StudioEmpty icon={IconSearch} title={t("list.noResults")} text={t("list.noResultsText")}>
        <button type="button" className="btn btn--line btn--sm" onClick={resetAll} data-ai-id="admin.studio.list.reset" data-ai-type="button" data-ai-label={t("list.reset")}>
          {t("list.reset")}
        </button>
      </StudioEmpty>
    );
  else {
    const shown = rows.length ? rows : list.data?.items ?? [];
    content = (
      <>
        {list.error ? <StudioErrorNote error={list.error} onRetry={() => void retry()} busy={retryBusy} compact /> : null}
        <div className={`stu-ol stu-rl${!current ? " is-loading" : ""}`} data-ai-id="admin.studio.list.table" data-ai-type="table" data-ai-label={t("list.title")} aria-busy={!current}>
          <div className="stu-ol__hd stu-rl__hd" aria-hidden>
            <span>{t("list.col.title")}</span>
            <span>{t("flow.col.source")}</span>
            <span>{t("list.col.status")}</span>
            <span>{t("list.col.updated")}</span>
            <span />
          </div>
          <ul className="stu-ol__list">
            {shown.map((r) => {
              const title = r.title || t("list.untitled");
              const view = recordHref(code, r.actions.view);
              const edit = recordHref(code, r.actions.edit);
              return (
                <li
                  key={`${r.source}-${r.id}`}
                  className={`stu-orow stu-rl__row${r.status === "archived" ? " is-archived" : ""}${flashId === r.id ? " is-flash" : ""}`}
                  data-ai-id={aiId("admin.studio.list.item", r.id)}
                  data-ai-type="list_item"
                  data-ai-entity-type={r.source === "studio" ? "studio_object" : "studio_runtime_record"}
                  data-ai-entity-id={r.id}
                  data-ai-label={title}
                >
                  <div className="stu-orow__main">
                    {view ? (
                      <Link href={view} className="stu-orow__t" tabIndex={-1}>
                        {title}
                      </Link>
                    ) : (
                      <span className="stu-orow__t">{title}</span>
                    )}
                    <span className="stu-orow__meta">
                      {r.version ? (
                        <span>
                          <IconHistory aria-hidden />
                          {t("list.version", { v: r.version })}
                        </span>
                      ) : null}
                      {r.owner ? (
                        <span>
                          <IconUser aria-hidden />
                          {r.owner}
                        </span>
                      ) : null}
                      {r.source === "runtime" && r.studioObjectId ? <span className="stu-rl__linked">{t("flow.hasDraft")}</span> : null}
                    </span>
                  </div>
                  <span>
                    <span className={`stu-src stu-src--${r.source}`}>{t(`flow.source.${r.source}`)}</span>
                  </span>
                  <span className="stu-orow__st">
                    <RecordStatus r={r} />
                  </span>
                  <span className="stu-orow__time">
                    {r.updatedAt ? (
                      <>
                        <IconClock aria-hidden />
                        {when(r.updatedAt)}
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                  <span className="stu-orow__acts">
                    {view ? (
                      <Link href={view} className="stu-orow__icon" aria-label={t("flow.viewAria", { title })} title={t("flow.view")} data-ai-id={aiId("admin.studio.list.item", r.id, "view")} data-ai-type="link" data-ai-label={t("flow.view")}>
                        <IconEye aria-hidden />
                      </Link>
                    ) : null}
                    {edit && mayWrite ? (
                      <Link href={edit} className="btn btn--soft btn--sm" aria-label={t("flow.editAria", { title })} data-ai-id={aiId("admin.studio.list.item", r.id, "edit")} data-ai-type="link" data-ai-label={t("flow.edit")}>
                        <IconEdit aria-hidden />
                        {t("flow.edit")}
                      </Link>
                    ) : null}
                    {r.actions.clone && mayWrite ? (
                      <button type="button" className="stu-orow__icon" onClick={() => askClone(r)} aria-label={t("flow.cloneAria", { title })} title={t("flow.clone")} data-ai-id={aiId("admin.studio.list.item", r.id, "clone")} data-ai-type="button" data-ai-label={t("flow.clone")}>
                        <IconCopy aria-hidden />
                      </button>
                    ) : null}
                    {r.actions.archive && canArchive && r.status !== "archived" ? (
                      <button
                        type="button"
                        className="stu-orow__icon"
                        onClick={() => {
                          setArchErr(null);
                          setTarget(r);
                        }}
                        disabled={archBusy}
                        aria-label={t("list.archiveAria", { title })}
                        title={t("actions.archive")}
                        data-ai-id={aiId("admin.studio.list.item", r.id, "archive")}
                        data-ai-type="button"
                        data-ai-label={t("actions.archive")}
                      >
                        {archBusy && target?.id === r.id ? <span className="stu-spin" aria-hidden /> : <IconArchive aria-hidden />}
                      </button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="stu-ol__foot">
          <span className="stu-ol__count">
            {t("flow.range", { from: num(total ? offset + 1 : 0), to: num(offset + shown.length), total: num(total) })}
            {data && (data.runtimeTotal || data.studioTotal) ? <small> · {t("flow.split", { runtime: num(data.runtimeTotal), studio: num(data.studioTotal) })}</small> : null}
          </span>
          <span className="stu-rl__pager">
            <button type="button" className="btn btn--line btn--sm" onClick={() => setOffset((o) => Math.max(0, o - PAGE))} disabled={offset === 0 || !current} data-ai-id="admin.studio.list.prev" data-ai-type="button" data-ai-label={t("flow.prev")}>
              {t("flow.prev")}
            </button>
            <button type="button" className="btn btn--line btn--sm" onClick={() => setOffset((o) => o + PAGE)} disabled={offset + PAGE >= total || !current} data-ai-id="admin.studio.list.next" data-ai-type="button" data-ai-label={t("flow.next")}>
              {t("flow.next")}
            </button>
          </span>
        </div>
      </>
    );
  }

  return (
    <>
      <CtorMeta code={code} ctor={ctor} />
      {ctor ? <CtorSequence ctor={ctor} /> : null}
      <CtorAbout ctor={ctor} />
      <FilterBar
        className="uf--tray"
        fields={[
          {
            key: "status",
            label: t("list.filter.status"),
            icon: IconCircleCheck,
            value: status,
            empty: "",
            onChange: (v: string) => {
              setStatus(v);
              setOffset(0);
            },
            options: statusOpts,
            aiId: "admin.studio.list.filters.status",
          },
          {
            key: "source",
            label: t("flow.col.source"),
            icon: IconLayers,
            value: source,
            empty: "",
            onChange: (v: string) => {
              setSource(v as "" | StudioRecordSource);
              setOffset(0);
            },
            options: sourceOpts,
            aiId: "admin.studio.list.filters.source",
          },
        ]}
        search={{ value: q, onChange: setQ, placeholder: t("list.filter.searchPh"), label: t("common.search"), aiId: "admin.studio.list.search.input" }}
        count={data ? total : undefined}
        onReset={resetAll}
        aiId="admin.studio.list.filters"
        aiLabel={t("list.filter.title")}
      />
      {content}
      <StudioConfirm
        open={target !== null}
        title={t("list.archiveTitle")}
        text={t("list.archiveText", { title: target?.title || t("list.untitled") })}
        icon={IconArchive}
        confirmLabel={t("actions.archive")}
        busy={archBusy}
        error={archErr}
        onConfirm={() => void doArchive()}
        onClose={() => setTarget(null)}
        aiId="admin.studio.list.archive-modal"
      />
      <StudioConfirm
        open={cloneOf !== null}
        title={t("flow.cloneTitle")}
        text={t("flow.cloneText")}
        icon={IconCopy}
        tone="brand"
        confirmLabel={t("flow.clone")}
        busy={cloneBusy}
        error={cloneErr}
        onConfirm={() => void doClone()}
        onClose={() => setCloneOf(null)}
        aiId="admin.studio.list.clone-modal"
      >
        <label className="stu-fld">
          <span className="stu-fld__l">{t("flow.cloneLabel")}</span>
          <input value={cloneTitle} onChange={(e) => setCloneTitle(e.target.value.slice(0, 200))} maxLength={200} autoFocus />
        </label>
      </StudioConfirm>
    </>
  );
}

export default function ObjectList({ code }: { code: string }) {
  const { t, ctorName, ctorDesc, what } = useStudioHuman();
  const acc = useStudioAccess();
  const reg = useStudioRegistry();
  const ctor = reg.items.find((c) => c.code === code) ?? reg.items.find((c) => c.code.toUpperCase() === code.toUpperCase()) ?? null;
  const realCode = ctor?.code ?? code;
  const missing = reg.avail === "on" && reg.items.length > 0 && !ctor;
  const name = ctorName(realCode, ctor?.title);
  const blocked = Boolean(ctor && (ctor.availability === "blocked" || ctor.missingRequired.length));
  // The create form as the backend prepares it (form-context?mode=create).
  const createHref = `/admin/studio/o/new?new=${encodeURIComponent(realCode)}${ctor?.operations.formContextEndpoint ? `&ctx=${encodeURIComponent(`${ctor.operations.formContextEndpoint}?mode=create`)}` : ""}`;

  return (
    <StudioShell
      title={missing ? t("list.missingTitle") : name}
      lead={missing ? "" : (ctor ? what(ctor) : "") || ctorDesc(realCode) || t("list.lead")}
      icon={<ConstructorIcon code={realCode} size="lg" />}
      back={{ href: "/admin/studio", label: t("actions.backHome") }}
      actions={
        acc.canEdit && !missing ? (
          blocked ? (
            <span className="btn btn--line btn--sm is-disabled" aria-disabled="true" title={t("flow.blockedTitle")}>
              <IconLock aria-hidden />
              {t("flow.create")}
            </span>
          ) : (
            <Link href={createHref} className="btn btn--pri btn--sm" data-ai-id="admin.studio.list.create" data-ai-type="link" data-ai-label={t("flow.create")}>
              <IconPlus aria-hidden />
              {t("flow.create")}
            </Link>
          )
        ) : null
      }
    >
      {missing ? (
        <StudioEmpty icon={IconSearch} title={t("list.missingTitle")} text={t("list.missingText", { code })}>
          <Link href="/admin/studio" className="btn btn--line btn--sm" data-ai-id="admin.studio.list.missing.back" data-ai-type="link" data-ai-label={t("actions.backHome")}>
            {t("actions.backHome")}
          </Link>
        </StudioEmpty>
      ) : (
        <ListBody key={realCode} code={realCode} ctor={ctor} canEdit={acc.canEdit} canArchive={acc.canArchive} />
      )}
    </StudioShell>
  );
}
