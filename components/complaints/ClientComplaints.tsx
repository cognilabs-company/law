"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import { Skeleton } from "@/components/portal/DataState";
import { subscribeUserEvents } from "@/lib/userSocket";
import {
  isComplaintEvent,
  listComplaintTargets,
  loadComplaintFeed,
  matchesRef,
  sortStatuses,
  type ComplaintItem,
  type ComplaintKind,
} from "@/lib/services/complaints";
import {
  IconAlert,
  IconArrowRight,
  IconChat,
  IconCheck,
  IconClipboardCheck,
  IconClose,
  IconPlus,
  IconRefresh,
  IconStarRate,
} from "@/components/icons";
import ComplaintRow from "./ComplaintRow";
import ComplaintDetail from "./ComplaintDetail";
import NewComplaintForm, { emptyDraft, type ComplaintDraft, type WorksState } from "./NewComplaintForm";
import { EmptyArt, rowDomId, useComplaintLabels } from "./bits";

type FeedState = { status: "loading" | "ready" | "error"; items: ComplaintItem[]; manualFailed: boolean; qualityFailed: boolean };
type KindFilter = "all" | ComplaintKind;

const FIRST_FEED: FeedState = { status: "loading", items: [], manualFailed: false, qualityFailed: false };
const KINDS: KindFilter[] = ["all", "manual", "quality"];

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

export default function ClientComplaints() {
  const t = useTranslations("portal.client.complaints");
  const tc = useTranslations("common");
  const tcm = useTranslations("portal.common");
  const L = useComplaintLabels();
  const params = useSearchParams();
  const workParam = params.get("work") ?? "";
  const aboutParam = params.get("about") ?? "";
  const formParam = params.get("new") === "1" || !!aboutParam;
  const formSig = `${formParam}|${aboutParam}`;

  const [feed, setFeed] = useState<FeedState>(FIRST_FEED);
  const [req, setReq] = useState({ n: 0, soft: false });
  const [kind, setKind] = useState<KindFilter>("all");
  const [statusPick, setStatusPick] = useState("");
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
      setStatusPick("");
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
    for (const x of items) if (x.kind === "manual") manual++;
    return { all: items.length, manual, quality: items.length - manual };
  }, [items]);
  const statuses = useMemo(() => sortStatuses([...new Set(items.map((x) => x.status))]), [items]);
  const bothKinds = counts.manual > 0 && counts.quality > 0;
  const kindOn: KindFilter = bothKinds ? kind : "all";
  const statusOn = statuses.length > 1 && statuses.includes(statusPick) ? statusPick : "";
  const shown = useMemo(
    () => items.filter((x) => (kindOn === "all" || x.kind === kindOn) && (!statusOn || x.status === statusOn)),
    [items, kindOn, statusOn],
  );
  const showBar = feed.status === "ready" && items.length > 1 && (bothKinds || statuses.length > 1);
  const openItem = useMemo(() => items.find((x) => x.key === openKey) ?? null, [items, openKey]);
  const statusOptions = useMemo(
    () => [{ value: "", label: tcm("filterAllStatuses") }, ...statuses.map((s) => ({ value: s, label: L.status(s) }))],
    [statuses, tcm, L],
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
    setStatusPick("");
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

  return (
    <div className="shk">
      <section className="shk__intro">
        <span className="shk__introic" aria-hidden>
          <IconClipboardCheck />
        </span>
        <div className="shk__introtx">
          <p className="shk__lead">{t("lead")}</p>
          <p className="shk__auto">
            <IconStarRate aria-hidden />
            <span>{t("auto")}</span>
          </p>
        </div>
        <ol className="shk__steps" aria-label={t("stepsLabel")}>
          <li>
            <span aria-hidden>1</span>
            {t("steps.write")}
          </li>
          <li>
            <span aria-hidden>2</span>
            {t("steps.review")}
          </li>
          <li>
            <span aria-hidden>3</span>
            {t("steps.decision")}
          </li>
        </ol>
        <div className="shk__acts">
          <button type="button" className="btn btn--grad" data-ai-target="button:new-complaint" aria-haspopup="dialog" onClick={openForm}>
            <IconPlus aria-hidden />
            {t("new")}
          </button>
          <Link href="/portal/client/support" className="shk__chat">
            <IconChat aria-hidden />
            <span>{t("chatLink")}</span>
            <IconArrowRight aria-hidden />
          </Link>
        </div>
      </section>

      <section className="ppanel shk__panel" aria-label={t("listLabel")}>
        {sentId !== null ? (
          <div className="shk__note shk__note--ok" role="status">
            <IconCheck aria-hidden />
            <span>
              <b>{t("sent")}</b>
              {sentId ? ` ${t("sentId", { id: sentId })}` : ""}
            </span>
            <button type="button" className="shk__x" onClick={() => setSentId(null)} aria-label={tc("a11y.close")}>
              <IconClose />
            </button>
          </div>
        ) : null}
        {missingRef ? (
          <div className="shk__note shk__note--warn" role="status">
            <IconAlert aria-hidden />
            <span>{t("linkMissing")}</span>
            <button type="button" className="shk__x" onClick={() => setMissingRef(false)} aria-label={tc("a11y.close")}>
              <IconClose />
            </button>
          </div>
        ) : null}
        {feed.status === "ready" && (feed.manualFailed || feed.qualityFailed) ? (
          <div className="shk__note shk__note--warn" role="status">
            <IconAlert aria-hidden />
            <span>{feed.manualFailed ? t("partialManual") : t("partialQuality")}</span>
            <button type="button" className="btn btn--line btn--sm" onClick={retry}>
              <IconRefresh aria-hidden />
              {tc("retry")}
            </button>
          </div>
        ) : null}

        {showBar ? (
          <div className="shk__bar" data-ai-target="complaints:filters">
            {bothKinds ? (
              <div className="shk__kinds" role="group" aria-label={t("filter.label")}>
                {KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={`chip${kindOn === k ? " on" : ""}`}
                    aria-pressed={kindOn === k}
                    onClick={() => setKind(k)}
                  >
                    {t(`filter.${k}`)}
                    <span className="shk__n">{counts[k]}</span>
                  </button>
                ))}
              </div>
            ) : (
              <span />
            )}
            {statuses.length > 1 ? (
              <label className="shk__filt">
                <span>{tcm("filterStatus")}</span>
                <Select value={statusOn} onChange={setStatusPick} ariaLabel={tcm("filterStatus")} options={statusOptions} />
              </label>
            ) : null}
          </div>
        ) : null}

        <div className="shk__body" data-ai-target="complaints:list" aria-busy={feed.status === "loading" || undefined}>
          {feed.status === "loading" ? (
            <Skeleton rows={3} />
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
      <Modal open={formOpen} onClose={closeForm} title={t("new")}>
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
