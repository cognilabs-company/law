"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import Modal from "@/components/admin/Modal";
import FilterBar, { type FilterField } from "@/components/filters/FilterBar";
import type { Option } from "@/components/Select";
import { Skeleton } from "@/components/portal/DataState";
import { subscribeUserEvents } from "@/lib/userSocket";
import { useAiField, useAiModal, useAiSelection } from "@/lib/ai/registry";
import {
  complaintMatches,
  complaintStage,
  foldText,
  isComplaintEvent,
  isKnownComplaintStatus,
  listComplaintTargets,
  loadComplaintFeed,
  matchesRef,
  sortStages,
  type ComplaintItem,
  type ComplaintKind,
  type ComplaintStage,
} from "@/lib/services/complaints";
import {
  IconAlert,
  IconArrowRight,
  IconChat,
  IconCircleCheck,
  IconClipboardCheck,
  IconClose,
  IconHeadset,
  IconInfo,
  IconPlus,
  IconRefresh,
  IconSend,
  IconStarRate,
  IconTag,
} from "@/components/icons";
import ComplaintRow from "./ComplaintRow";
import ComplaintDetail from "./ComplaintDetail";
import NewComplaintForm, { emptyDraft, type ComplaintDraft, type WorksState } from "./NewComplaintForm";
import { EmptyArt, rowDomId, useComplaintLabels } from "./bits";

type FeedState = { status: "loading" | "ready" | "error"; items: ComplaintItem[]; manualFailed: boolean; qualityFailed: boolean };
type KindFilter = "all" | ComplaintKind;

const FIRST_FEED: FeedState = { status: "loading", items: [], manualFailed: false, qualityFailed: false };
const KINDS: KindFilter[] = ["all", "manual", "quality"];
const SEARCH_MIN = 5;
const SEARCH_MAX = 120;
const FLOW = [
  { key: "write", Icon: IconSend },
  { key: "review", Icon: IconHeadset },
  { key: "decision", Icon: IconCircleCheck },
] as const;

function stripParams(names: string[]) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const name of names) {
    if (!url.searchParams.has(name)) continue;
    url.searchParams.delete(name);
    changed = true;
  }
  if (changed) window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

const bare = (s: string) => foldText(s).replace(/\s*\(\d+\)$/, "");

function pickOption(options: Option[], raw: string): string | null {
  const want = bare(raw);
  if (!want) return options[0]?.value ?? "";
  const hit =
    options.find((o) => foldText(o.value) === want) ??
    options.find((o) => bare(o.label) === want) ??
    options.find((o) => bare(o.label).startsWith(want));
  return hit ? hit.value : null;
}

export default function ClientComplaints() {
  const t = useTranslations("portal.client.complaints");
  const tc = useTranslations("common");
  const tcm = useTranslations("portal.common");
  const L = useComplaintLabels();
  const headId = useId();
  const params = useSearchParams();
  const workParam = params.get("work") ?? "";
  const aboutParam = params.get("about") ?? "";
  const formParam = params.get("new") === "1" || !!aboutParam;
  const formSig = `${formParam}|${aboutParam}`;

  const [feed, setFeed] = useState<FeedState>(FIRST_FEED);
  const [req, setReq] = useState({ n: 0, soft: false });
  const [kind, setKind] = useState<KindFilter>("all");
  const [stagePick, setStagePick] = useState("");
  const [q, setQ] = useState("");
  const [openKey, setOpenKey] = useState("");
  const [highlight, setHighlight] = useState("");
  const [focusRef, setFocusRef] = useState(workParam);
  const [missingRef, setMissingRef] = useState(false);
  const [formOpen, setFormOpen] = useState(formParam);
  const [draft, setDraft] = useState<ComplaintDraft>(() => emptyDraft(aboutParam));
  const [sentId, setSentId] = useState<string | null>(null);
  const [worksWanted, setWorksWanted] = useState(formParam);
  const [worksTick, setWorksTick] = useState(0);
  const [works, setWorks] = useState<WorksState>({ status: "loading", items: [] });

  const [seenWork, setSeenWork] = useState(workParam);
  if (seenWork !== workParam) {
    setSeenWork(workParam);
    if (workParam) {
      setFocusRef(workParam);
      setMissingRef(false);
    }
  }
  const [seenForm, setSeenForm] = useState(formSig);
  if (seenForm !== formSig) {
    setSeenForm(formSig);
    if (formParam) {
      setFormOpen(true);
      setWorksWanted(true);
      if (aboutParam) setDraft((cur) => ({ ...cur, related: aboutParam }));
    }
  }
  if (focusRef && feed.status === "ready") {
    const hit = feed.items.find((x) => matchesRef(x, focusRef));
    if (hit) {
      setFocusRef("");
      setOpenKey(hit.key);
      setHighlight(hit.key);
      setKind("all");
      setStagePick("");
      setQ("");
    } else if (!feed.manualFailed && !feed.qualityFailed) {
      setFocusRef("");
      setMissingRef(true);
    }
  }
  if (openKey && feed.status === "ready" && !feed.items.some((x) => x.key === openKey)) setOpenKey("");

  useEffect(() => {
    let alive = true;
    loadComplaintFeed()
      .then((r) => {
        if (alive) setFeed({ status: "ready", ...r });
      })
      .catch(() => {
        if (alive && !req.soft) setFeed((f) => ({ ...f, status: "error" }));
      });
    return () => {
      alive = false;
    };
  }, [req]);

  const softRefresh = useCallback(() => setReq((r) => ({ n: r.n + 1, soft: true })), []);
  const retry = useCallback(() => {
    setFeed((f) => ({ ...f, status: "loading" }));
    setReq((r) => ({ n: r.n + 1, soft: false }));
  }, []);

  useEffect(
    () =>
      subscribeUserEvents((ev) => {
        if (isComplaintEvent(ev)) softRefresh();
      }),
    [softRefresh],
  );

  useEffect(() => {
    if (!worksWanted) return;
    let alive = true;
    listComplaintTargets()
      .then((items) => {
        if (alive) setWorks({ status: "ready", items });
      })
      .catch(() => {
        if (alive) setWorks((w) => (w.status === "ready" ? w : { status: "error", items: [] }));
      });
    return () => {
      alive = false;
    };
  }, [worksWanted, worksTick]);

  const retryWorks = useCallback(() => {
    setWorks({ status: "loading", items: [] });
    setWorksTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!highlight || feed.status !== "ready") return;
    const el = document.getElementById(rowDomId(highlight));
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
  }, [highlight, feed.status]);

  const items = feed.items;
  const counts = useMemo(() => {
    let manual = 0;
    const stage = new Map<ComplaintStage, number>();
    for (const x of items) {
      if (x.kind === "manual") manual++;
      const s = complaintStage(x.status);
      stage.set(s, (stage.get(s) ?? 0) + 1);
    }
    return { all: items.length, manual, quality: items.length - manual, stage };
  }, [items]);
  const stages = useMemo(() => sortStages([...counts.stage.keys()]), [counts]);
  const bothKinds = counts.manual > 0 && counts.quality > 0;
  const searchable = items.length >= SEARCH_MIN;
  const kindOn: KindFilter = bothKinds ? kind : "all";
  const stageOn = stages.length > 1 && stages.some((s) => s === stagePick) ? stagePick : "";
  const qOn = searchable ? q.trim() : "";
  const shown = useMemo(
    () =>
      items.filter(
        (x) =>
          (kindOn === "all" || x.kind === kindOn) &&
          (!stageOn || complaintStage(x.status) === stageOn) &&
          (!qOn || complaintMatches(x, qOn, [x.category ? L.category(x.category) : "", L.source(x.source)])),
      ),
    [items, kindOn, stageOn, qOn, L],
  );
  const showBar = feed.status === "ready" && items.length > 1 && (bothKinds || stages.length > 1 || searchable);
  const openItem = useMemo(() => items.find((x) => x.key === openKey) ?? null, [items, openKey]);
  const stageOptions = useMemo<Option[]>(
    () => [
      { value: "", label: tcm("filterAllStatuses") },
      ...stages.map((s) => ({ value: s, label: `${L.stage(s)} (${counts.stage.get(s) ?? 0})` })),
    ],
    [stages, counts, tcm, L],
  );
  const kindOptions = useMemo<Option[]>(
    () => KINDS.map((k) => ({ value: k, label: `${t(`filter.${k}`)} (${counts[k]})` })),
    [counts, t],
  );

  function openForm() {
    setSentId(null);
    setFormOpen(true);
    if (!worksWanted) {
      setWorksWanted(true);
      return;
    }
    if (works.status === "error") setWorks({ status: "loading", items: [] });
    setWorksTick((n) => n + 1);
  }

  function closeForm() {
    setFormOpen(false);
    stripParams(["new", "about"]);
  }

  function openRow(key: string) {
    setOpenKey(key);
    setMissingRef(false);
  }

  function closeDetail() {
    setOpenKey("");
    stripParams(["work"]);
  }

  function resetFilters() {
    setKind("all");
    setStagePick("");
    setQ("");
  }

  function pickKind(v: string) {
    setKind(v === "manual" || v === "quality" ? v : "all");
  }

  function onCreated(item: ComplaintItem) {
    const wasError = feed.status === "error";
    setFormOpen(false);
    stripParams(["new", "about"]);
    setDraft(emptyDraft());
    setSentId(item.workId);
    resetFilters();
    setHighlight(item.key);
    if (wasError) {
      retry();
      return;
    }
    setFeed((f) => ({ ...f, status: "ready", items: [item, ...f.items.filter((x) => x.key !== item.key)] }));
    softRefresh();
  }

  useAiField("complaints.filters.status", {
    get: () => stageOn,
    set: (v) => {
      const raw = v.trim().toLowerCase();
      const next = isKnownComplaintStatus(raw) ? complaintStage(raw) : pickOption(stageOptions, v);
      if (next === "") setStagePick("");
      else if (next && stages.some((s) => s === next)) setStagePick(next);
    },
  });
  useAiField("complaints.filters.kind", {
    get: () => kindOn,
    set: (v) => {
      const next = pickOption(kindOptions, v);
      if (next !== null) pickKind(next);
    },
  });
  useAiField("complaints.filters.search", {
    get: () => q,
    set: (v) => setQ(v.slice(0, SEARCH_MAX)),
  });
  useAiSelection("complaint_status", stageOn);
  useAiSelection("complaint_kind", kindOn === "all" ? "" : kindOn);
  useAiModal("complaints.new-modal", () => openForm());

  const fields: FilterField[] = [
    {
      key: "status",
      label: tcm("filterStatus"),
      icon: IconClipboardCheck,
      value: stageOn,
      onChange: setStagePick,
      options: stageOptions,
      hidden: stages.length < 2,
      aiId: "complaints.filters.status",
    },
    {
      key: "kind",
      label: t("filter.label"),
      icon: IconTag,
      value: kindOn,
      onChange: pickKind,
      options: kindOptions,
      empty: "all",
      hidden: !bothKinds,
      aiId: "complaints.filters.kind",
    },
  ];

  return (
    <div className="shk">
      <section className="shk__head" aria-labelledby={headId}>
        <div className="shk__headtop">
          <div className="shk__headtx">
            <h2 id={headId} className="shk__title">
              {t("title")}
            </h2>
            <p className="shk__lead">{t("lead")}</p>
          </div>
          <button
            type="button"
            className="btn btn--grad shk__new"
            data-ai-target="button:new-complaint"
            data-ai-id="complaints.new"
            aria-haspopup="dialog"
            onClick={openForm}
          >
            <IconPlus aria-hidden />
            {t("new")}
          </button>
        </div>
        <ol className="shk__flow" aria-label={t("stepsLabel")}>
          {FLOW.map(({ key, Icon }, i) => (
            <li key={key}>
              <span className="shk__flowic" aria-hidden>
                <Icon />
              </span>
              <span className="shk__flowtx">
                <small>{t("stepN", { n: i + 1 })}</small>
                <b>{t(`steps.${key}`)}</b>
              </span>
            </li>
          ))}
        </ol>
        <div className="shk__foot">
          <p className="shk__auto">
            <IconStarRate aria-hidden />
            <span>{t("auto")}</span>
          </p>
          <Link href="/portal/client/support" className="shk__chat">
            <IconChat aria-hidden />
            <span>{t("chatLink")}</span>
            <IconArrowRight aria-hidden />
          </Link>
        </div>
      </section>

      {sentId !== null ? (
        <div className="shk__note shk__note--ok" role="status">
          <span className="shk__noteic" aria-hidden>
            <IconCircleCheck />
          </span>
          <span className="shk__notetx">
            <b>{t("sent")}</b>
            {sentId ? (
              <span>
                {t("sentRef")} <span className="wid">{sentId}</span>
              </span>
            ) : null}
            <span>{t("sentNext")}</span>
          </span>
          <button type="button" className="shk__x" onClick={() => setSentId(null)} aria-label={tc("a11y.close")}>
            <IconClose />
          </button>
        </div>
      ) : null}
      {missingRef ? (
        <div className="shk__note shk__note--info" role="status">
          <span className="shk__noteic" aria-hidden>
            <IconInfo />
          </span>
          <span className="shk__notetx">{t("linkMissing")}</span>
          <button type="button" className="shk__x" onClick={() => setMissingRef(false)} aria-label={tc("a11y.close")}>
            <IconClose />
          </button>
        </div>
      ) : null}
      {feed.status === "ready" && (feed.manualFailed || feed.qualityFailed) ? (
        <div className="shk__note shk__note--warn" role="status">
          <span className="shk__noteic" aria-hidden>
            <IconAlert />
          </span>
          <span className="shk__notetx">{feed.manualFailed ? t("partialManual") : t("partialQuality")}</span>
          <button type="button" className="btn btn--line btn--sm" onClick={retry}>
            <IconRefresh aria-hidden />
            {tc("retry")}
          </button>
        </div>
      ) : null}

      <section className="shk__panel" aria-label={t("listLabel")}>
        {showBar ? (
          <FilterBar
            fields={fields}
            search={
              searchable
                ? {
                    value: q,
                    onChange: (v) => setQ(v.slice(0, SEARCH_MAX)),
                    placeholder: t("filter.searchPh"),
                    maxLength: SEARCH_MAX,
                    aiId: "complaints.filters.search",
                  }
                : undefined
            }
            count={shown.length}
            onReset={resetFilters}
            aiId="complaints.filters"
            aiTarget="complaints:filters"
          />
        ) : null}

        <div
          className="shk__body"
          data-ai-target="complaints:list"
          data-ai-id="complaints.list"
          data-ai-label={t("listLabel")}
          aria-busy={feed.status === "loading" || undefined}
        >
          {feed.status === "loading" ? (
            <div className="shk__card">
              <Skeleton rows={3} />
            </div>
          ) : feed.status === "error" ? (
            <div className="shk__state" role="alert">
              <span className="shk__stateic" aria-hidden>
                <IconAlert />
              </span>
              <b>{t("loadError")}</b>
              <p>{tcm("loadErrorText")}</p>
              <button type="button" className="btn btn--line btn--sm" onClick={retry}>
                <IconRefresh aria-hidden />
                {tc("retry")}
              </button>
            </div>
          ) : !items.length ? (
            <div className="shk__state">
              <EmptyArt />
              <b>{t("empty")}</b>
              <p>{t("emptyText")}</p>
              <button type="button" className="btn btn--soft btn--sm" aria-haspopup="dialog" onClick={openForm}>
                <IconPlus aria-hidden />
                {t("new")}
              </button>
            </div>
          ) : !shown.length ? (
            <div className="shk__state shk__state--flt">
              <p>{t("filter.empty")}</p>
              <button type="button" className="btn btn--line btn--sm" onClick={resetFilters}>
                {t("filter.reset")}
              </button>
            </div>
          ) : (
            <ul className="shk__list">
              {shown.map((item) => (
                <li key={item.key}>
                  <ComplaintRow item={item} highlighted={highlight === item.key} onOpen={() => openRow(item.key)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <Modal open={!!openItem} onClose={closeDetail} title={openItem ? openItem.subject || L.kind(openItem.kind) : ""}>
        {openItem ? <ComplaintDetail key={openItem.key} item={openItem} /> : null}
      </Modal>
      <Modal open={formOpen} onClose={closeForm} title={t("new")} aiId="complaints.new-modal">
        <NewComplaintForm
          draft={draft}
          onDraft={setDraft}
          works={works}
          onRetryWorks={retryWorks}
          onCancel={closeForm}
          onCreated={onCreated}
        />
      </Modal>
    </div>
  );
}
