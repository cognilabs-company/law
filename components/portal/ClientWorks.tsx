"use client";

import "./ordersList1920.css";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, ArrowUpRight, CircleCheck, CircleX, Loader, MessageSquareText, Sparkles, Video } from "lucide-react";
import {
  listClientWorks,
  getClientWork,
  isQualityComplaintEvent,
  isUrgentEvent,
  WORKS_PAGE,
  type ClientWork,
  type ClientWorkTab,
  type ClientWorkDetail,
} from "@/lib/services/backend";
import { subscribeUserEvents } from "@/lib/userSocket";
import { asDict, asStr } from "@/lib/http";
import { statusLabel } from "@/lib/labels";
import { shortDateTime } from "@/lib/date";
import { matchesSearch } from "@/lib/searchText";
import { Link } from "@/i18n/navigation";
import Modal from "@/components/admin/Modal";
import CopilotLauncher from "@/components/copilot/CopilotLauncher";
import FilterBar, { type FilterField } from "@/components/filters/FilterBar";
import { Skeleton, EmptyState } from "./DataState";
import {
  IconBriefcase,
  IconAlert,
  IconScale,
  IconChat,
  IconArrowRight,
  IconLayers,
  IconCircleCheck,
  IconSearch,
} from "@/components/icons";
import { initials } from "@/lib/lawyers";
import { personName } from "@/lib/labels";
import { useAiReveal } from "@/lib/guide/targets";
import { profileTabHref } from "@/lib/profileTabs";
import { aiId, aiSeg } from "@/lib/ai/ids";
import { useAiField, useAiSelection } from "@/lib/ai/registry";

// LEXGO_FRONTEND_CLIENT_WORKS_QUALITY_EDITOR_2026-09-29.md §1 and §9.
//
// "Mening hujjatlarim" is the document archive and nothing else; this is
// every legal PROCESS the client has running — work an advocate is doing,
// Tezkor services, orders, cases and complaints. The two screens used to
// show each other's rows, and GET /clients/me/works exists to stop that: it
// is the one list that knows what a "work" is, and it names the separation
// rule in its own response.
//
// The tab strip is the backend's (`tabs`), not ours. A sixth type it adds
// later appears here with its own title and needs no frontend release —
// which also means the type labels below come from that same list rather
// than from a map this file would have to keep in step.

// Each kind of work by its picture, drawn like the client dashboard's (black
// line art in a white circle — public/img/xizmatlar, public/img/sos).
const TYPE_ART: Record<string, string> = {
  document_lawyer_work: "/img/xizmatlar/Huquqiy_hujjatlar.webp",
  urgent_advokat: "/img/xizmatlar/Tezkor_Advokat.webp",
  quality_complaint: "/img/xizmatlar/Shikoyat.webp",
  complaint: "/img/xizmatlar/Shikoyat.webp",
  service_order: "/img/xizmatlar/xizmatlar.webp",
  legal_case: "/img/sos/Sud_jarayoni.webp",
};
const artOf = (type: string) => ({ "--art": `url(${TYPE_ART[type] ?? "/img/xizmatlar/xizmatlar.webp"})` }) as CSSProperties;

// The dashboard's status pill (.cx-pill) per tone: finished green, waiting
// amber, moving blue, closed grey.
const PILL = { done: "ok", waiting: "warn", working: "blue", closed: "mute" } as const;
function ToneIcon({ tone: tn }: { tone: keyof typeof PILL }) {
  if (tn === "done") return <CircleCheck aria-hidden />;
  if (tn === "waiting") return <Loader aria-hidden />;
  if (tn === "closed") return <CircleX aria-hidden />;
  return <Sparkles aria-hidden />;
}

// Where a work of each type is actually worked on. The row links there
// rather than this screen re-implementing five detail views.
const TYPE_HREF: Record<string, string> = {
  document_lawyer_work: "/portal/client/documents",
  urgent_advokat: "/portal/client/urgent",
  quality_complaint: profileTabHref("complaints"),
  complaint: profileTabHref("complaints"),
  service_order: profileTabHref("payments"),
  legal_case: "/portal/client/cases",
};

// Green when it is finished, amber while someone else has it, blue while it
// is moving. Unknown statuses land on "working", which claims nothing.
function tone(status: string): "done" | "waiting" | "closed" | "working" {
  if (/^(completed|resolved|closed|file_ready|rated|done|paid)$/.test(status)) return "done";
  if (/^(new|open_pool|pending|under_review|lawyer_review|questionnaire|payment_pending)$/.test(status)) return "waiting";
  if (/^(cancelled|rejected|expired|failed)$/.test(status)) return "closed";
  return "working";
}

type Tr = ((key: string, values?: Record<string, string | number | Date>) => string) & { has: (key: string) => boolean };

const STATUS_NS = ["status", "orderStatus", "orderStage", "paymentStatus", "docStatus"] as const;

function workStatusText(t: Tr, tcm: Tr, status: string, type: string, backend: string): string {
  if (!status) return backend;
  const complaint = type === "complaint" || type === "quality_complaint";
  if (complaint && t.has(`qcAction.${status}`)) return t(`qcAction.${status}`);
  if (STATUS_NS.some((ns) => tcm.has(`${ns}.${status}`))) return statusLabel(tcm, status, type === "document_lawyer_work" ? "docStatus" : undefined);
  if (t.has(`qcAction.${status}`)) return t(`qcAction.${status}`);
  return backend || statusLabel(tcm, status);
}

const ROW_ENTITY: Record<string, string> = {
  document_lawyer_work: "document_lawyer_request",
  urgent_advokat: "urgent_advokat_request",
  service_order: "order",
  legal_case: "case",
};

function rowAiId(r: ClientWork): string {
  if (!r.id) return "";
  if (r.type === "document_lawyer_work") return aiId("documents.my.item", r.id);
  if (r.type === "urgent_advokat") return aiId("urgent_advokat.request", r.id);
  return aiId("works.item", r.id);
}

const URGENT_ROW = /^urgent_advokat\.request\.(?!(?:form|direction|description|submit|channel|kind|kind-picker|lawyer-count|total|modal)(?:\.|$))/;

export default function ClientWorks() {
  const t = useTranslations("portal.client.works");
  const tcm = useTranslations("portal.common");
  const tl = useTranslations("lxOrders");
  const locale = useLocale();

  const [tab, setTab] = useState("all");
  // The status filter, "" for every status. Sent to the endpoint rather than
  // applied here: ?status= filters server-side (measured — ?status=new
  // answers 14 rows with total 14 out of 87), so a filtered view pages
  // correctly instead of filtering one page of fifty.
  const [pick, setPick] = useState("");
  const [rows, setRows] = useState<ClientWork[]>([]);
  const [tabs, setTabs] = useState<ClientWorkTab[]>([]);
  // Every status this client has actually had, learnt from the unfiltered
  // answers only. Taking it from a filtered one would collapse the menu to
  // the single status just chosen and strand the user inside it.
  const [seen, setSeen] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [moreBusy, setMoreBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);
  const [q, setQ] = useState("");
  const [known, setKnown] = useState<{ sig: string; tab: string; total: number; counts: Record<string, number> } | null>(null);

  // Back to the skeleton during render when the query changes, not in the
  // effect — one render instead of a cascade (the house pattern, see
  // ClientDocumentRequests).
  const query = `${tab}|${pick}`;
  const [prevQuery, setPrevQuery] = useState(query);
  if (prevQuery !== query) { setPrevQuery(query); setStatus("loading"); }

  useEffect(() => {
    let alive = true;
    listClientWorks({ type: tab, status: pick || undefined, limit: WORKS_PAGE, offset: 0 })
      .then((p) => {
        if (!alive) return;
        setRows(p.items);
        setTotal(p.total);
        // Only ever grows from the "all" answer: a filtered call returns the
        // same tab list, but taking it from every answer would let a slow
        // filtered response overwrite the strip mid-click.
        if (p.tabs.length) setTabs(p.tabs);
        if (!pick) {
          setSeen((cur) => {
            const next = new Set(cur);
            p.items.forEach((x) => x.status && next.add(x.status));
            return next.size === cur.length ? cur : [...next];
          });
        }
        setStatus("ready");
      })
      .catch(() => alive && setStatus("error"));
    return () => { alive = false; };
  }, [tab, pick, reloadKey]);

  // §6 plus the modules this list aggregates: a complaint opening, an urgent
  // record moving or a document request changing all change a row here.
  useEffect(() => {
    return subscribeUserEvents((ev) => {
      if (isQualityComplaintEvent(ev.event) || isUrgentEvent(ev.event) || ev.event.startsWith("document_request.")) {
        setKnown(null);
        refresh();
      }
    });
  }, [refresh]);

  async function loadMore() {
    if (moreBusy || rows.length >= total) return;
    setMoreBusy(true);
    try {
      const p = await listClientWorks({ type: tab, status: pick || undefined, limit: WORKS_PAGE, offset: rows.length });
      setRows((cur) => {
        const have = new Set(cur.map((x) => x.id));
        return [...cur, ...p.items.filter((x) => !have.has(x.id))];
      });
      setTotal(p.total);
    } catch {
      // Leave what is on screen; the count already says there is more.
    } finally {
      setMoreBusy(false);
    }
  }

  // What to call a type.
  //
  // Our own translation first, then the backend's tab title, then the slug
  // humanised. Ours leads because the two do not line up: the tab strip
  // offers `quality_complaint` while every complaint row the endpoint returns
  // carries type `complaint` (measured 2026-09-29: 9 rows of `complaint`,
  // and ?type=quality_complaint answers 0). Reading the label off the tabs
  // alone therefore printed a raw humanised "Complaint" on an Uzbek page.
  // The mismatch itself is the backend's to fix — filtering by that tab
  // really does return nothing — and is filed as an ask.
  const typeName = useMemo(() => {
    const m = new Map(tabs.map((x) => [x.key, x.title]));
    return (k: string) => (t.has(`type.${k}`) ? t(`type.${k}`) : m.get(k) || statusLabel(tcm, k) || k);
  }, [tabs, tcm, t]);

  const [openId, setOpenId] = useState("");
  const openRow = useMemo(() => rows.find((r) => r.workId === openId) ?? null, [rows, openId]);

  const strip: ClientWorkTab[] = tabs.length ? tabs : [{ key: "all", title: t("tabAll") }];

  const statusText = (s: string, type = "", backend = "") => workStatusText(t, tcm, s, type, backend);
  const backendLabel = (s: string) => rows.find((r) => r.status === s)?.statusLabel ?? "";

  const needle = q.trim();
  const shown = useMemo(
    () => (needle ? rows.filter((r) => matchesSearch(`${r.title} ${r.workId} ${typeName(r.type)} ${r.assignedLawyer?.name ?? ""}`, needle)) : rows),
    [rows, needle, typeName],
  );

  const exact = useMemo(() => {
    if (pick || status !== "ready" || rows.length < total) return null;
    const m: Record<string, number> = {};
    for (const r of rows) if (r.status) m[r.status] = (m[r.status] ?? 0) + 1;
    return m;
  }, [rows, total, pick, status]);
  const sig = exact ? `${tab}|${rows.length}|${JSON.stringify(exact)}` : "";
  if (exact && known?.sig !== sig) setKnown({ sig, tab, total: rows.length, counts: exact });
  const counts = known && known.tab === tab ? known : null;

  const withCount = (label: string, n?: number) => (n === undefined ? label : `${label} (${n})`);
  const fields: FilterField[] = [
    {
      key: "type",
      label: t("fType"),
      icon: IconLayers,
      value: tab,
      empty: "all",
      onChange: setTab,
      options: strip.map((x) => ({ value: x.key, label: x.key === "all" ? t("allTypes") : typeName(x.key) })),
      aiId: "works.filters.type",
    },
    {
      key: "status",
      label: tcm("filterStatus"),
      icon: IconCircleCheck,
      value: pick,
      onChange: setPick,
      hidden: seen.length < 2,
      options: [
        { value: "", label: withCount(tcm("filterAllStatuses"), counts?.total) },
        ...seen.map((s) => ({ value: s, label: withCount(statusText(s, "", backendLabel(s)), counts ? (counts.counts[s] ?? 0) : undefined) })),
      ],
      aiId: "works.filters.status",
    },
  ];

  useAiField("works.search.input", { get: () => q, set: setQ });
  useAiField("works.filters.type", {
    get: () => tab,
    set: (v) => {
      const w = v.trim().toLowerCase();
      if (!w) {
        setTab("all");
        return;
      }
      const hit = strip.find((x) => x.key.toLowerCase() === w || x.title.toLowerCase() === w || (x.key === "all" ? t("allTypes") : typeName(x.key)).toLowerCase() === w);
      if (hit) setTab(hit.key);
    },
  });
  useAiField(seen.length > 1 ? "works.filters.status" : "", {
    get: () => pick,
    set: (v) => {
      const w = v.trim().toLowerCase();
      if (!w) {
        setPick("");
        return;
      }
      const hit = seen.find((s) => s.toLowerCase() === w || statusText(s, "", backendLabel(s)).toLowerCase() === w);
      if (hit) setPick(hit);
    },
  });
  useAiSelection("works_type", tab);
  useAiSelection("works_status", pick);

  const revealRow = (id: string, base: string) => {
    const rid = id.slice(base.length + 1).split(".")[0] ?? "";
    if (!rid || shown.some((r) => aiSeg(r.id) === rid)) return;
    setQ("");
    if (status !== "ready" || rows.some((r) => aiSeg(r.id) === rid)) return;
    if (tab !== "all" || pick) {
      setTab("all");
      setPick("");
      return;
    }
    if (rows.length < total) void loadMore();
  };
  useAiReveal(/^works\.item\./, (id) => revealRow(id, "works.item"));
  useAiReveal(/^documents\.my\.item\./, (id) => revealRow(id, "documents.my.item"));
  useAiReveal(URGENT_ROW, (id) => revealRow(id, "urgent_advokat.request"));
  useAiReveal("works.list", () => setQ(""));

  const filtered = tab !== "all" || Boolean(pick);

  return (
    <div className="ppanel cwk" data-ai-target={status === "ready" && shown.length ? undefined : "works:list"}>
      {/* The dashboard's section head ("Jarayondagi ishlar"): a small title
          with its count, the way out on the right — the page's big title is
          the shell's. */}
      <div className="ppanel__h cwk__h">
        <h2 className="ppanel__t cx-h3">
          {t("title")}
          {status === "ready" ? <span className="cx-count">{total}</span> : null}
        </h2>
        <span className="ppanel__hact cwk__tools">
          {/* §9's separation, said once where a client might otherwise wonder
              why their documents are not here. */}
          <Link href="/portal/client/documents" className="cwork__sep cx-link">
            {t("documentsLink")}
            <ArrowRight aria-hidden />
          </Link>
          <CopilotLauncher surface="client_work_detail" title={t("title")} className="olx-ai" />
        </span>
      </div>
      <p className="ppanel__note lx-sub cwk__lead">{t("lead")}</p>

      <FilterBar
        className="cwk-filters"
        fields={fields}
        search={{ value: q, onChange: setQ, placeholder: t("searchPh"), aiId: "works.search.input" }}
        count={status === "ready" ? (needle ? shown.length : total) : undefined}
        aiId="works.filters"
        aiTarget="works:filters"
      />

      {status === "loading" ? (
        <Skeleton rows={4} />
      ) : status === "error" ? (
        <EmptyState className="pempty--err" icon={<IconAlert />} title={tcm("loadError")} text={tcm("loadErrorText")} action={{ label: tl("retry"), onClick: refresh }} />
      ) : !rows.length ? (
        filtered ? (
          <EmptyState icon={<IconSearch />} title={t("searchEmpty")} text={t("filterEmptyText")} />
        ) : (
          <EmptyState
            icon={<IconBriefcase />}
            title={t("empty")}
            text={t("emptyText")}
            action={
              <Link href="/portal/client/lawyers" className="btn btn--pri btn--sm">
                {tl("emptyCta")}
                <ArrowRight aria-hidden />
              </Link>
            }
          />
        )
      ) : (
        <>
          {shown.length ? (
            <div className="cworks" data-ai-target="works:list" data-ai-id="works.list" data-ai-type="list">
              {shown.map((r) => {
                const tn = tone(r.status);
                const st = statusText(r.status, r.type, r.statusLabel);
                const rowId = rowAiId(r);
                const lawyer = personName(r.assignedLawyer?.name);
                const operator = personName(r.operator?.name);
                const who = lawyer || operator;
                return (
                  <button
                    type="button"
                    className="cwork cwk-row"
                    key={r.id}
                    onClick={() => setOpenId(r.workId)}
                    data-ai-target={r.id ? `works.item.${r.id}` : undefined}
                    data-ai-id={rowId || undefined}
                    data-ai-type="list_item"
                    data-ai-label={[typeName(r.type), st].filter(Boolean).join(" · ")}
                    data-ai-entity-type={rowId ? ROW_ENTITY[r.type] ?? "work" : undefined}
                    data-ai-entity-id={r.id || undefined}
                    data-ai-private
                  >
                    {/* The dashboard's work card (.cx-work): the kind's picture,
                        title, grey meta line and status pill; the next step;
                        who has it, and the way in. */}
                    <span className="cwork__top cwk-row__h">
                      <span className="cwk-art" style={artOf(r.type)} aria-hidden />
                      <span className="cwork__m cwk-row__ht">
                        <b className="cwork__t">{r.title || typeName(r.type)}</b>
                        <span className="cwork__row cwk-row__meta">
                          {[r.workId, typeName(r.type), r.createdAt ? shortDateTime(r.createdAt, locale) : ""].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <em className={`cwork__st cwork__st--${tn} cx-pill cx-pill--${PILL[tn]}`}>
                        <ToneIcon tone={tn} />
                        {st}
                      </em>
                    </span>
                    {r.nextAction ? <span className="cwork__next">{r.nextAction}</span> : null}
                    <span className="cwk-row__foot">
                      <span className="cx-work__who">
                        {who ? <span className="cx-av" aria-hidden>{initials(who)}</span> : null}
                        {lawyer ? tl("who", { name: lawyer }) : operator ? tl("operator", { name: operator }) : null}
                      </span>
                      <span className="cwk-row__ics">
                        {r.hasChat ? (
                          <span className="cwk-ic" role="img" aria-label={t("hasChat")} title={t("hasChat")}>
                            <MessageSquareText aria-hidden />
                          </span>
                        ) : null}
                        {r.hasMeeting ? (
                          <span className="cwk-ic" role="img" aria-label={t("hasMeeting")} title={t("hasMeeting")}>
                            <Video aria-hidden />
                          </span>
                        ) : null}
                        <span className="cx-iconbtn cwk-row__go" aria-hidden>
                          <ArrowUpRight />
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={<IconSearch />} title={t("searchEmpty")} text={rows.length < total ? t("searchEmptyMore") : t("searchEmptyText")} />
          )}
          {rows.length < total ? (
            <button type="button" className="btn btn--line btn--full" onClick={() => void loadMore()} disabled={moreBusy} data-ai-id="works.load-more">
              {moreBusy ? tcm("processingShort") : t("more", { n: total - rows.length })}
            </button>
          ) : null}
        </>
      )}

      <Modal
        open={!!openRow}
        onClose={() => setOpenId("")}
        title={openRow ? openRow.title || typeName(openRow.type) : ""}
      >
        {openRow ? <WorkDetail row={openRow} typeName={typeName} /> : null}
      </Modal>
    </div>
  );
}

// One work, opened out.
//
// The detail endpoint answers a different set of blocks per type — verified
// against production, one record of each: document_lawyer_work carries
// lawyer_request / document / chat / meeting / rating / complaints, a
// complaint carries complaint / document / lawyer_request / review, urgent
// carries urgent_request, a case carries case / timeline, an order carries
// order / status_history. Rather than five hand-written views that would
// drift, this shows the facts every type has and then the ONE thing its own
// blocks add that the summary does not already say — and sends the client to
// the screen that actually works on it.
function WorkDetail({ row, typeName }: { row: ClientWork; typeName: (k: string) => string }) {
  const t = useTranslations("portal.client.works");
  const tp = useTranslations("portal.client.copilot");
  const tcm = useTranslations("portal.common");
  const locale = useLocale();
  const [detail, setDetail] = useState<ClientWorkDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  // Reset during render, not in the effect: the modal reuses this component
  // when the client opens a second work, and a setState in the effect body is
  // a cascading render (and a lint error in this repo).
  const [prevId, setPrevId] = useState(row.workId);
  if (prevId !== row.workId) { setPrevId(row.workId); setState("loading"); setDetail(null); }

  useEffect(() => {
    let alive = true;
    getClientWork(row.workId)
      .then((d) => { if (alive) { setDetail(d); setState("ready"); } })
      .catch(() => alive && setState("error"));
    return () => { alive = false; };
  }, [row.workId]);

  // The complaint's own text, wherever the block keeps it. A complaint made
  // from a low rating and one made standalone are the same record type but
  // are not filled in the same way, so both spellings are read.
  const complaintText = (() => {
    if (!detail) return "";
    const c = asDict(detail.blocks.complaint);
    const p = asDict(c.payload);
    return asStr(c.complaint ?? c.description ?? c.text ?? p.description ?? p.complaint);
  })();
  // What the operator ruled, once they have.
  const review = (() => {
    if (!detail) return { action: "", note: "" };
    const r = asDict(detail.blocks.review ?? detail.blocks.resolution);
    return { action: asStr(r.action ?? r.status), note: asStr(r.note ?? r.comment ?? r.text) };
  })();
  const roomId = (() => {
    if (!detail) return "";
    const c = asDict(detail.blocks.chat);
    return asStr(c.room_id) || asStr(asDict(detail.blocks.lawyer_request).secure_chat_room_id);
  })();

  const base = TYPE_HREF[row.type] || "";
  const href = base && (row.type === "quality_complaint" || row.type === "complaint") && row.workId ? profileTabHref("complaints", { work: row.workId }) : base;
  const workTitle = row.title || typeName(row.type);
  const entityType = row.type === "service_order" || row.type === "legal_case" ? row.type : roomId ? "secure_chat" : "";
  const entityId = entityType === "secure_chat" ? roomId : row.id;
  const copilotEntity = entityType && entityId ? { type: entityType, id: entityId, code: row.workId || undefined, title: workTitle } : null;

  const tn = tone(row.status);
  // The operator's ruling as a status pill: settled green, refused grey,
  // anything still open amber.
  const verdictTone = /^(resolved|closed|completed)$/.test(review.action) ? "ok" : /^(rejected|cancelled)$/.test(review.action) ? "mute" : "warn";

  return (
    <div className="cwdet">
      {/* The kind's picture, its name and where it stands — the dashboard's
          work card head, opened out. */}
      <div className="cwdet__intro">
        <span className="cwk-art cwk-art--lg" style={artOf(row.type)} aria-hidden />
        <span className="cwdet__kind">{typeName(row.type)}</span>
        <em className={`cx-pill cx-pill--${PILL[tn]}`}>
          <ToneIcon tone={tn} />
          {workStatusText(t, tcm, row.status, row.type, row.statusLabel)}
        </em>
      </div>
      <dl className="cwdet__facts">
        {row.workId ? (<div><dt>{t("fWorkId")}</dt><dd className="cwdet__wid">{row.workId}</dd></div>) : null}
        {row.assignedLawyer?.name ? (<div><dt>{t("fLawyer")}</dt><dd>{row.assignedLawyer.name}</dd></div>) : null}
        {row.operator?.name ? (<div><dt>{t("fOperator")}</dt><dd>{row.operator.name}</dd></div>) : null}
        {row.createdAt ? (<div><dt>{t("fCreated")}</dt><dd>{shortDateTime(row.createdAt, locale)}</dd></div>) : null}
      </dl>

      {row.nextAction ? (
        <p className="cwdet__next"><IconArrowRight />{row.nextAction}</p>
      ) : null}

      {state === "loading" ? (
        <Skeleton rows={2} />
      ) : state === "error" ? (
        <p className="advmuted">{tcm("loadErrorText")}</p>
      ) : (
        <>
          {complaintText ? (
            <section className="cwdet__b">
              <b><IconAlert />{t("bComplaint")}</b>
              <p>{complaintText}</p>
            </section>
          ) : null}
          {review.action || review.note ? (
            <section className="cwdet__b cwdet__b--ok">
              <b>
                <IconScale />
                {t("bReview")}
                {review.action ? (
                  <em className={`cx-pill cx-pill--${verdictTone}`}>{t.has(`qcAction.${review.action}`) ? t(`qcAction.${review.action}`) : review.action}</em>
                ) : null}
              </b>
              {review.note ? <p>{review.note}</p> : null}
            </section>
          ) : null}
        </>
      )}

      <div className="cwdet__acts">
        <CopilotLauncher
          surface={row.hasMeeting ? "client_meeting" : "client_work_detail"}
          entity={copilotEntity}
          title={workTitle}
          label={row.hasMeeting ? tp("meetingPrep") : undefined}
          context={copilotEntity ? undefined : { label: [row.workId, workTitle].filter(Boolean).join(" · "), work_id: row.workId || undefined }}
          className="olx-ai"
        />
        {roomId ? (
          <Link href={`/portal/chat/${roomId}`} className="btn btn--line">
            <IconChat />{t("openChat")}
          </Link>
        ) : null}
        {href ? (
          <Link href={href} className="btn btn--pri">
            {t("openWork")}<IconArrowRight />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
