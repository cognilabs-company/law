"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { toast } from "@/lib/toast";
import { logApiError } from "@/lib/http";
import { useAiField } from "@/lib/ai/registry";
import FilterBar from "@/components/filters/FilterBar";
import {
  archiveStudioObject,
  isApprovalFree,
  listStudioObjects,
  STUDIO_STATUSES,
  useStudioAccess,
  useStudioRegistry,
  type StudioConstructor,
  type StudioObject,
} from "@/lib/services/studio";
import { ctorMeta } from "@/lib/studio/constructors";
import StudioShell from "./StudioShell";
import { ConstructorIcon, StudioCodeChip, StudioEmpty, StudioErrorNote, StudioLoading, useStudioText } from "./bits";
import ObjectRows from "./dash/ObjectRows";
import { IconArchive, StudioConfirm, studioEventCode, useStudioRefetch } from "./dash/shared";
import { IconBolt, IconCircleCheck, IconClipboardCheck, IconLayers, IconPlus, IconSearch, IconShieldCheck, IconUser } from "@/components/icons";

const PAGE = 20;

type ListState = {
  key: string;
  phase: "ready" | "error";
  items: StudioObject[];
  total: number;
  more: boolean;
  error: unknown;
};

const NONE: ListState = { key: "", phase: "ready", items: [], total: 0, more: false, error: null };

function mergeById(a: StudioObject[], b: StudioObject[]): StudioObject[] {
  const seen = new Set(a.map((o) => o.id));
  return [...a, ...b.filter((o) => !seen.has(o.id))];
}

function CtorMeta({ code, ctor }: { code: string; ctor: StudioConstructor | null }) {
  const { t, num } = useStudioText();
  const free = isApprovalFree(code, ctor);
  const req = ctor?.schema.required.length ?? 0;
  return (
    <ul className="stu-olm" aria-label={t("list.meta.label")}>
      <li>
        <StudioCodeChip code={code} />
      </li>
      {ctor?.runtimeTarget ? (
        <li title={t("list.meta.runtimeHint")}>
          <IconLayers aria-hidden />
          {t("list.meta.runtime")}
          <code>{ctor.runtimeTarget}</code>
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
    </ul>
  );
}

function ListBody({ code, ctor, canEdit, canArchive }: { code: string; ctor: StudioConstructor | null; canEdit: boolean; canArchive: boolean }) {
  const { t, num, ctorName } = useStudioText();
  const [status, setStatus] = useState("");
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState("");
  const [list, setList] = useState<ListState>(NONE);
  const [moreBusy, setMoreBusy] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);
  const [target, setTarget] = useState<StudioObject | null>(null);
  const [archBusy, setArchBusy] = useState(false);
  const [archErr, setArchErr] = useState<unknown>(null);
  const [flashId, setFlashId] = useState("");
  const seq = useRef(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useAiField("admin.studio.list.search.input", { get: () => q, set: setQ });

  const key = `${code}|${status}|${mine ? 1 : 0}`;

  const fetchRows = useCallback(
    async (offset: number, limit: number, append: boolean): Promise<boolean> => {
      const k = `${code}|${status}|${mine ? 1 : 0}`;
      const my = ++seq.current;
      try {
        const res = await listStudioObjects({ constructorCode: code, status: status || undefined, assignedToMe: mine || undefined, limit, offset });
        if (my !== seq.current) return true;
        const page = res.items.filter((o) => !o.code || o.code === code);
        setList((cur) => {
          const items = append && cur.key === k ? mergeById(cur.items, page) : page;
          const total = Math.max(res.total, items.length);
          const more = items.length < total || (res.items.length >= limit && res.total <= offset + res.items.length);
          return { key: k, phase: "ready", items, total, more: more && res.items.length > 0, error: null };
        });
        return true;
      } catch (e) {
        if (my !== seq.current) return true;
        logApiError("studio.objects", e);
        setList((cur) => (cur.key === k && cur.phase === "ready" && (append || cur.items.length) ? { ...cur, error: append ? null : e } : { ...NONE, key: k, phase: "error", error: e }));
        return false;
      }
    },
    [code, status, mine],
  );

  useEffect(() => {
    void fetchRows(0, PAGE, false);
  }, [fetchRows]);

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const current = list.key === key;
  const loaded = current ? list.items.length : 0;
  useStudioRefetch(
    () => void fetchRows(0, Math.max(PAGE, loaded), false),
    (e) => {
      const c = studioEventCode(e);
      return !c || c === code;
    },
  );

  async function loadMore() {
    setMoreBusy(true);
    try {
      const ok = await fetchRows(loaded, PAGE, true);
      if (!ok) toast(t("list.moreFail"), { tone: "err" });
    } finally {
      setMoreBusy(false);
    }
  }

  async function retry() {
    setRetryBusy(true);
    try {
      await fetchRows(0, Math.max(PAGE, loaded), false);
    } finally {
      setRetryBusy(false);
    }
  }

  function askArchive(o: StudioObject) {
    setArchErr(null);
    setTarget(o);
  }

  async function doArchive() {
    if (!target) return;
    const o = target;
    setArchBusy(true);
    setArchErr(null);
    try {
      await archiveStudioObject(o.id);
      setTarget(null);
      setList((cur) => ({ ...cur, items: cur.items.map((x) => (x.id === o.id ? { ...x, status: "archived", statusRaw: "archived" } : x)) }));
      toast(t("list.archived", { title: o.title || t("list.untitled") }), { tone: "ok" });
      setFlashId(o.id);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashId(""), 2400);
      void fetchRows(0, Math.max(PAGE, loaded), false);
    } catch (e) {
      logApiError("studio.archive", e);
      setArchErr(e);
    } finally {
      setArchBusy(false);
    }
  }

  const statusOpts = [{ value: "", label: t("common.all") }, ...STUDIO_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))];
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const rows = current ? list.items : [];
  const shown = terms.length
    ? rows.filter((o) => {
        const hay = [o.title, o.currentVersion, o.createdBy, o.assignedTo].join(" ").toLowerCase();
        return terms.every((w) => hay.includes(w));
      })
    : rows;
  const filtered = Boolean(status) || mine;
  const resetAll = () => {
    setStatus("");
    setMine(false);
    setQ("");
  };

  const newHref = `/admin/studio/o/new?new=${encodeURIComponent(code)}`;
  const newBtn = canEdit ? (
    <Link href={newHref} className="btn btn--pri btn--sm" data-ai-id="admin.studio.list.empty.create" data-ai-type="link" data-ai-label={t("list.new")}>
      <IconPlus aria-hidden />
      {t("list.new")}
    </Link>
  ) : null;

  let content;
  if (!current) content = <StudioLoading rows={4} />;
  else if (list.phase === "error") content = <StudioErrorNote error={list.error} onRetry={() => void retry()} busy={retryBusy} />;
  else if (!rows.length && !filtered)
    content = (
      <StudioEmpty icon={ctorMeta(code).icon} tone="brand" title={t("list.emptyTitle")} text={canEdit ? t("list.emptyText", { name: ctorName(code, ctor?.title) }) : t("list.emptyRead")}>
        {newBtn}
      </StudioEmpty>
    );
  else if (!shown.length)
    content = (
      <StudioEmpty icon={IconSearch} title={t("list.noResults")} text={terms.length && list.more ? t("list.searchLoaded", { n: num(rows.length) }) : t("list.noResultsText")}>
        <button type="button" className="btn btn--line btn--sm" onClick={resetAll} data-ai-id="admin.studio.list.reset" data-ai-type="button" data-ai-label={t("list.reset")}>
          {t("list.reset")}
        </button>
      </StudioEmpty>
    );
  else
    content = (
      <>
        {list.error ? <StudioErrorNote error={list.error} onRetry={() => void retry()} busy={retryBusy} compact /> : null}
        <ObjectRows items={shown} canArchive={canArchive} archivingId={archBusy && target ? target.id : ""} flashId={flashId} onArchive={askArchive} />
        <div className="stu-ol__foot">
          <span className="stu-ol__count">
            {terms.length ? t("list.countSearch", { n: num(shown.length), all: num(rows.length) }) : t("list.count", { n: num(rows.length), total: num(Math.max(list.total, rows.length)) })}
          </span>
          {list.more ? (
            <button type="button" className="btn btn--line btn--sm" onClick={() => void loadMore()} disabled={moreBusy} data-ai-id="admin.studio.list.more" data-ai-type="button" data-ai-label={t("list.more")}>
              {moreBusy ? <span className="stu-spin" aria-hidden /> : null}
              {t("list.more")}
            </button>
          ) : null}
        </div>
      </>
    );

  return (
    <>
      <CtorMeta code={code} ctor={ctor} />
      <FilterBar
        className="uf--tray"
        fields={[
          { key: "status", label: t("list.filter.status"), icon: IconCircleCheck, value: status, empty: "", onChange: setStatus, options: statusOpts, aiId: "admin.studio.list.filters.status" },
          {
            key: "mine",
            label: t("list.filter.mine"),
            icon: IconUser,
            active: mine,
            clear: () => setMine(false),
            aiId: "admin.studio.list.filters.mine",
            aiType: "input",
            node: (
              <label className="stu-check">
                <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
                <span>{t("list.filter.mineText")}</span>
              </label>
            ),
          },
        ]}
        search={{ value: q, onChange: setQ, placeholder: t("list.filter.searchPh"), label: t("common.search"), aiId: "admin.studio.list.search.input" }}
        count={current && list.phase === "ready" ? shown.length : undefined}
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
    </>
  );
}

export default function ObjectList({ code }: { code: string }) {
  const { t, ctorName, ctorDesc } = useStudioText();
  const acc = useStudioAccess();
  const reg = useStudioRegistry();
  const ctor = reg.items.find((c) => c.code === code) ?? reg.items.find((c) => c.code.toUpperCase() === code.toUpperCase()) ?? null;
  const realCode = ctor?.code ?? code;
  const missing = reg.avail === "on" && reg.items.length > 0 && !ctor;
  const name = ctorName(realCode, ctor?.title);

  return (
    <StudioShell
      title={missing ? t("list.missingTitle") : name}
      lead={missing ? "" : ctorDesc(realCode) || t("list.lead")}
      eyebrow={realCode}
      icon={<ConstructorIcon code={realCode} size="lg" />}
      back={{ href: "/admin/studio", label: t("actions.backHome") }}
      actions={
        acc.canEdit && !missing ? (
          <Link href={`/admin/studio/o/new?new=${encodeURIComponent(realCode)}`} className="btn btn--pri btn--sm" data-ai-id="admin.studio.list.create" data-ai-type="link" data-ai-label={t("list.new")}>
            <IconPlus aria-hidden />
            {t("list.new")}
          </Link>
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
