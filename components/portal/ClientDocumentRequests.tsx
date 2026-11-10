"use client";

import "./documents1920.css";
import { builderRouteOf } from "@/components/portal/docCatalog/builderLink";
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  CircleCheck,
  CircleMinus,
  CircleX,
  Clock,
  Download,
  FileText,
  Hourglass,
  Info,
  Loader,
  MessageSquareText,
  PenLine,
  Scale,
  Search,
  Sparkles,
  Tag,
  UserRound,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import {
  listClientDocumentFlowPage,
  getDocumentRequestFile,
  requestDocumentLawyerReviewGated,
  docPayPhase,
  docRealtimeOf,
  DOC_FLOW_PAGE,
  DOC_PAYMENT_STOPPED,
  type ClientDocFlowItem,
  type ClientDocFlowMode,
  type DocPayPhase,
} from "@/lib/services/backend";
import { onUserSocketResync, subscribeUserEvents } from "@/lib/userSocket";
import { fmtUzs } from "@/lib/money";
import { useDocChatRooms } from "@/lib/useDocChatRooms";
import { useDocRatings } from "@/lib/useDocRatings";
import { ctorPromptAsked, markCtorPromptAsked } from "@/lib/docCtorPrompt";
import DocRatingBox, { DocRatedStars } from "./DocRatingBox";
import { fetchAndDeliver } from "@/lib/download";
import { notify } from "@/lib/toast";
import Modal from "@/components/admin/Modal";
import CopilotLauncher from "@/components/copilot/CopilotLauncher";
import { useCopilotAvailable } from "@/components/copilot/store";
import FilterBar, { type FilterField } from "@/components/filters/FilterBar";
import { EmptyState, ErrorState } from "./DataState";
import { shortDateTime } from "@/lib/date";
import { docNextActionKey, statusLabel } from "@/lib/labels";
import { matchesSearch } from "@/lib/searchText";
import { Link, useRouter } from "@/i18n/navigation";
import { IconEdit, IconCircleCheck } from "@/components/icons";
import { useAiReveal } from "@/lib/guide/targets";
import { KIND_ART, docKindOf } from "./docs/DocIcons";
import { aiId, aiSeg } from "@/lib/ai/ids";
import { useAiField, useAiSelection } from "@/lib/ai/registry";

// Which way this document is being produced — the client filled it in, the
// AI drafted it, or an advocate is writing it. It changes what the card
// means, so it leads the card's meta line as a chip.
const MODE_ICON: Record<string, LucideIcon> = { manual: PenLine, ai: Sparkles, lawyer: Scale };

// The client dashboard's pictures: the black line drawings of
// public/img/xizmatlar sit in white circles (--art), the kind's duotone
// drawing on a light plate (--img) — see documents1920.css.
const art = (name: string) => ({ "--art": `url(/img/xizmatlar/${name}.webp)` }) as CSSProperties;
const plate = (src: string) => ({ "--img": `url(${src})` }) as CSSProperties;

// The status pill in the dashboard's .cx-pill tones: blue while someone is
// working on it, amber while it waits on the client, green when it is done.
// No violet anywhere — that was the old palette.
const PILL: Record<string, { cls: string; Icon: LucideIcon }> = {
  done: { cls: "cx-pill--ok", Icon: CircleCheck },
  waiting: { cls: "cx-pill--blue", Icon: Hourglass },
  working: { cls: "cx-pill--blue", Icon: Sparkles },
  you: { cls: "cx-pill--warn", Icon: PenLine },
  pay: { cls: "cx-pill--warn", Icon: Loader },
  off: { cls: "lxd-pill--err", Icon: CircleX },
  closed: { cls: "lxd-pill--mute", Icon: CircleMinus },
};

type RowPhase = DocPayPhase | "pooled";
const POOL_STATUSES = new Set(["open_pool", "lawyer_review_requested"]);

// Where a request has got to, as one of four states rather than six slugs.
// The pill is coloured by this, so the list can be read down its right edge:
// green is finished, blue is being worked on, amber is waiting on the client.
// Every status the endpoint sends today is covered (verified against
// production: questionnaire, lawyer_review, file_ready, ready_to_generate,
// open_pool, payment_pending); an unknown one lands on "working", which
// claims nothing.
function statusTone(status: string, phase: RowPhase): "done" | "waiting" | "you" | "pay" | "off" | "closed" | "working" {
  if (phase === "wait") return "pay";
  if (phase === "cancelled") return "off";
  if (phase === "pooled") return "waiting";
  if (status === "file_ready" || status === "rated") return "done";
  if (status === "open_pool" || status === "lawyer_review" || status === "lawyer_review_requested" || status === "claimed") return "waiting";
  if (status === "questionnaire" || status === "ready_to_generate" || status === "payment_pending" || status === "awaiting_payment") return "you";
  // The case is over: nothing more will happen on this document.
  if (status === "closed" || status === "cancelled" || status === "rejected") return "closed";
  return "working";
}
// Which rows could carry a rating window, and therefore are worth one detail
// request each. Anything still being worked on cannot have one.
const RATEABLE = new Set(["file_ready", "rated", "closed"]);

type Tone = ReturnType<typeof statusTone>;
type Step = "fill" | "pay" | "review" | "ready";
const STEP_OF: Record<string, Step> = {
  questionnaire: "fill",
  ready_to_generate: "fill",
  payment_pending: "pay",
  awaiting_payment: "pay",
  pending_payment: "pay",
  payment_required: "pay",
  open_pool: "review",
  lawyer_review_requested: "review",
  lawyer_review: "review",
  pending_review: "review",
  in_review: "review",
  review: "review",
  claimed: "review",
  file_ready: "ready",
  rated: "ready",
};

const FLOW: Step[] = ["fill", "pay", "review", "ready"];
const STEP_KEY = { fill: "flowStepFill", pay: "flowStepPay", review: "flowStepReview", ready: "flowStepReady" } as const;
type StepState = "done" | "now" | "todo" | "skip" | "fail";

function flowOf(item: ClientDocFlowItem, status: string, phase: RowPhase, tone: Tone): { state: Record<Step, StepState>; payDone: boolean } | null {
  const closed = tone === "closed";
  if (closed && !item.file.ready) return null;
  let cur: Step | undefined = phase === "wait" || phase === "cancelled" ? "pay" : phase === "pooled" ? "review" : STEP_OF[status];
  if (closed || (!cur && item.file.ready)) cur = "ready";
  if (!cur) cur = item.mode === "lawyer" || item.lawyerRequestActive ? "review" : "fill";
  const needPay = item.payment.required || cur === "pay" || phase === "pooled";
  const needReview = item.mode === "lawyer" || item.lawyerRequestActive || !!item.assignedLawyer || cur === "review" || phase === "pooled";
  const at = FLOW.indexOf(cur);
  const state = {} as Record<Step, StepState>;
  FLOW.forEach((st, i) => {
    if ((st === "pay" && !needPay) || (st === "review" && !needReview)) state[st] = "skip";
    else if (cur === "ready" || i < at) state[st] = "done";
    else if (i === at) state[st] = phase === "cancelled" ? "fail" : "now";
    else state[st] = "todo";
  });
  return { state, payDone: needPay && state.pay === "done" };
}

const VIEWS = [
  { key: "all", status: "", tone: "neutral" },
  { key: "filling", status: "questionnaire", tone: "warn" },
  { key: "lawyer", status: "lawyer_review", tone: "active" },
  { key: "ready", status: "file_ready", tone: "ok" },
] as const;
const VIEW_LABEL = { all: "statTotal", filling: "statFilling", lawyer: "statLawyer", ready: "statReady" } as const;

// LEXGO_CLIENT_DOCUMENT_REQUESTS_PAGE_FRONTEND.md: one place for the client
// to see every document request they've ever started — however it was
// filled in (self, AI, lawyer) — with its current status/next step, and
// download the finished file the moment it's ready, without having to
// re-open the service it came from to find out.
type TabKey = "all" | ClientDocFlowMode;
const TABS: TabKey[] = ["all", "manual", "ai", "lawyer"];
const asTab = (v: string): TabKey => TABS.find((tb) => tb === v) ?? "all";

export default function ClientDocumentRequests() {
  const t = useTranslations("portal.client.documentRequests");
  const tx = useTranslations("lxDocs");
  const tcommon = useTranslations("portal.client.documents");
  const tcm = useTranslations("portal.common");
  const tn = useTranslations("common.notify");
  const tcp = useTranslations("copilot");
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const copilotFree = useCopilotAvailable(false);
  const copilotChat = useCopilotAvailable(true);
  const nextActionText = (raw: string) => {
    const key = docNextActionKey(raw);
    if (!key) return raw;
    return key === "nextLawyer" ? t("nextLawyerHere") : t(key, { section: t("title") });
  };
  const [tab, setTab] = useState<TabKey>("all");
  // LEXGO_REALTIME_AND_LIGHT_API_FRONTEND.md: /document-requests/service-flow
  // is paged now (the unpaged call was ~2MB for an account with a long
  // history, and it silently capped the list once the backend added a default
  // limit). Explicit state rather than useResource: a paged list owns both
  // "which page am I on" and "is there another", which a single-shot resource
  // hook has nowhere to put.
  const [rows, setRows] = useState<ClientDocFlowItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const [more, setMore] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);
  // The status filter, "" for all of them. Sent to the endpoint, not applied
  // here: ?status= filters server-side (measured — ?status=file_ready answers
  // 47 rows with total 47 out of 121), so a filtered view pages correctly
  // instead of filtering one page of twenty.
  const [pick, setPick] = useState("");
  // Every status this client's documents have actually been in, learnt from
  // the unfiltered answers only — a filtered one would collapse the menu to
  // the single status just chosen.
  const [seen, setSeen] = useState<string[]>([]);
  const [flash, setFlash] = useState<Record<string, "pooled" | "rejected">>({});
  const [fresh, setFresh] = useState<string[]>([]);

  // Back to "loading" the moment the query changes — during render, not in the
  // effect, so there is no extra cascading render (same pattern as useResource).
  const query = `${tab}|${pick}`;
  const [prevQuery, setPrevQuery] = useState(query);
  if (prevQuery !== query) { setPrevQuery(query); setStatus("loading"); }

  useEffect(() => {
    let alive = true;
    listClientDocumentFlowPage({ mode: tab === "all" ? undefined : tab, status: pick || undefined, limit: DOC_FLOW_PAGE, offset: 0 })
      .then((p) => {
        if (!alive) return;
        setRows(p.items);
        setMore(p.hasMore);
        if (!pick) {
          setSeen((cur) => {
            const next = new Set(cur);
            p.items.forEach((x) => x.status && next.add(x.status));
            return next.size === cur.length ? cur : [...next];
          });
        }
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setLoadErr(e);
        setStatus("error");
      });
    return () => { alive = false; };
  }, [tab, pick, reloadKey]);

  async function loadMore() {
    if (moreBusy || !more) return;
    setMoreBusy(true);
    try {
      const p = await listClientDocumentFlowPage({ mode: tab === "all" ? undefined : tab, status: pick || undefined, limit: DOC_FLOW_PAGE, offset: rows.length });
      setRows((cur) => {
        const have = new Set(cur.map((x) => x.id));
        return [...cur, ...p.items.filter((x) => !have.has(x.id))];
      });
      setMore(p.hasMore);
    } catch {
      setMore(false);
    } finally {
      setMoreBusy(false);
    }
  }
  // The four counts at the top. They are about the whole archive, so they
  // cannot come from `rows` — that is one page of twenty, and narrowed by
  // whichever tab is open. Each is the `total` of a one-row query instead:
  // cheap, and exact for the bucket it names. The unfiltered call gives the
  // grand total (service-flow's `total` ignores ?mode — a backend defect the
  // asks list already carries, and the one place where it happens to be the
  // number wanted), and the three status calls are filtered properly, which
  // is measured: ?status=file_ready answers total 47 out of 121.
  //
  // Only the three statuses that can be asked for exactly are shown. A
  // bucket like "everything still in progress" spans half a dozen statuses
  // and would need a request each, so it is not offered rather than
  // estimated.
  const [stats, setStats] = useState<{ total: number; filling: number; ready: number; lawyer: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const count = (status?: string) => listClientDocumentFlowPage({ status, limit: 1, offset: 0 }).then((p) => p.total);
    Promise.all([count(), count("questionnaire"), count("file_ready"), count("lawyer_review")])
      .then(([total, filling, ready, lawyer]) => { if (alive) setStats({ total, filling, ready, lawyer }); })
      // A failed count hides the row; it must never block the list itself.
      .catch(() => { if (alive) setStats(null); });
    return () => { alive = false; };
  }, [reloadKey]);
  // Filters what is loaded. There is no query parameter on this endpoint.
  const [q, setQ] = useState("");
  const [dlBusy, setDlBusy] = useState("");

  // LEXGO_DOCUMENT_TITLE_CONSTRUCTOR_PROMPT_UPDATE_2026-09-29.md §3 L74 /
  // §6 L158: the row whose "Ishingiz Navbatchi advokatga berildi" prompt is
  // open. `?doc=<document_request_id>` opens it straight away — that is the
  // link lib/notifications.ts builds for the
  // `document_constructor_continue_prompt` notification when the payload
  // carries no service_id to go to the constructor with directly.
  // …once. The backend keeps `prompt_required` true for the whole life of the
  // hold, and the ?doc= parameter stays in the URL after the dialog is
  // answered, so this used to re-ask on every visit, every refresh and every
  // back-navigation — the "juda ko'p chiqyapti" report. Two things stop it:
  // the shared per-request memory below (the same one the wait screen uses,
  // so answering in either place counts), and dropping ?doc= from the URL as
  // soon as it has been read.
  const [promptId, setPromptId] = useState(() => {
    const id = params.get("doc") ?? "";
    return id && !ctorPromptAsked(id) ? id : "";
  });
  // Asked, and remembered, the moment the dialog is put on screen — not when
  // it is answered. Closing it with the × or the scrim is an answer too
  // ("not now"), and the one thing that must not happen is being asked again
  // on the next render. The ?doc= parameter goes with it, so a refresh or a
  // Back into this page lands on a plain list.
  useEffect(() => {
    if (!promptId) return;
    markCtorPromptAsked(promptId);
    if (typeof window === "undefined" || !params.get("doc")) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("doc");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [promptId, params]);

  // The row whose constructor is being resolved (see openConstructor), and
  // the row whose "Advokat tekshiruviga yuborish" box is open.
  const [openBusy, setOpenBusy] = useState("");
  const [sendId, setSendId] = useState("");
  const [sendNeed, setSendNeed] = useState("");
  const [sendBusy, setSendBusy] = useState(false);

  // §3 L64 + §5 L117-122: "Ha" opens the held document's OWN constructor.
  // It opens on the template page (builderRouteOf), which needs only the
  // template the request was filled from: catalogue services can be removed
  // while their templates stay, and on 2026-10-22 every row had lost its
  // service — searching the catalogue for it, as this used to, found nothing
  // and showed "Couldn't open the builder".
  async function openConstructor(item: ClientDocFlowItem) {
    if (openBusy) return;
    setOpenBusy(item.id);
    try {
      const href = await builderRouteOf(item);
      setPromptId("");
      if (href) router.push(href);
      else notify.error(t("ctorFailed"), { id: `mydocs-ctor:${item.id}`, body: t("constructorOpenError") });
    } catch {
      // The notice lives at the top of the list, which is behind this
      // dialog — leaving it open would have shown the client nothing at all.
      notify.error(t("ctorFailed"), { id: `mydocs-ctor:${item.id}`, body: t("constructorOpenError") });
      setPromptId("");
    } finally {
      setOpenBusy("");
    }
  }

  // §4 L99-100: a second advocate request for a document that already has a
  // live one is refused, not queued — the answer comes back
  // already_exists=true with can_send_lawyer_request=false and the backend's
  // own sentence. Telling the client "so'rovingiz yuborildi" there would be a
  // straight lie, so nothing is claimed unless the answer says a request was
  // really created, and what is shown instead is the backend's `message`.
  async function sendToLawyer(item: ClientDocFlowItem) {
    if (sendBusy) return;
    setSendBusy(true);
    const nid = `mydocs-review:${item.id}`;
    try {
      const r = await requestDocumentLawyerReviewGated(item.id, sendNeed.trim() || tcommon("reviewNeedDefault"));
      setSendId("");
      setFlash((cur) => {
        if (!(item.id in cur)) return cur;
        const next = { ...cur };
        delete next[item.id];
        return next;
      });
      if (r.alreadyExists || !r.canSendLawyerRequest) notify.warning(tcommon("lawyerSendFailed"), { id: nid, body: r.message || item.lawyerRequestBlockReason || tcommon("lawyerPendingLead") });
      // The fee gate of the lawyer-review endpoint: the request exists but it
      // has not reached the advocates, so it is not reported as sent either.
      else if (r.paymentRequired) notify.warning(tcommon("gateTitle"), { id: nid, body: r.message || t("lawyerPayRequired") });
      else notify.success(tcommon("reviewSentTitle"), { id: nid, body: r.message || undefined });
      refresh();
    } catch (e) {
      notify.error(tcommon("reviewFailed"), { id: nid, error: e });
    } finally {
      setSendBusy(false);
    }
  }

  // LEXGO_FRONTEND_DOCUMENT_CALLCENTER_EDITOR_FLOW.md §"Realtime": this is
  // the page the client is told to come back to, so it must not need a
  // manual reload to show that an advocate claimed the work, started a
  // meeting, or sent the finished file. `refresh()` keeps what is on screen
  // while it refetches, so an event never flashes the list back to a skeleton.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const later = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 600);
    };
    const off = subscribeUserEvents((ev) => {
      const rt = docRealtimeOf(ev);
      if (!rt) return;
      // MD §"Client tayyor file ko'rishi" — the exact notice the client gets.
      if (rt.name === "document_request.ready" || rt.name === "document_request.completed") notify.success(t("readyToast"), { id: "mydocs-ready" });
      if (rt.ids.length && rt.kind !== "changed") {
        const mark = rt.kind === "pooled" || rt.kind === "rejected" ? rt.kind : "";
        setFlash((cur) => {
          const next = { ...cur };
          for (const id of rt.ids) {
            if (mark) next[id] = mark;
            else delete next[id];
          }
          return next;
        });
      }
      if (rt.kind === "created") {
        notify.info(t("opCreated"), { id: "mydocs-created" });
        if (rt.ids.length) setFresh(rt.ids);
      }
      later();
    });
    const offSync = onUserSocketResync(refresh);
    return () => {
      if (timer) clearTimeout(timer);
      off();
      offSync();
    };
  }, [refresh, t]);

  // The chat room is not on the list row — see useDocChatRooms. Only rows
  // that could have one are asked about; a document the client fills in
  // themselves never does.
  const chatIds = rows.filter((r) => r.mode === "lawyer" || r.assignedLawyer).map((r) => r.id);
  const rooms = useDocChatRooms(chatIds, reloadKey);
  // The 15-minute rating window, and the work id, per finished row — see
  // useDocRatings for why they are not simply read off this list.
  const rated = useDocRatings(rows.filter((r) => RATEABLE.has(r.status)).map((r) => r.id), reloadKey);

  // The rows the two modals below are about. Looked up rather than copied
  // into state so a refresh (a socket event, a send) keeps the open modal on
  // the row's current server truth; `?doc=` can name a row that is not on
  // this page yet, and then nothing opens rather than an empty prompt.
  // What the list actually renders: the loaded rows, narrowed by the search
  // box. Matched against the things a client would type — the document title,
  // its public work id, and the service it came from.
  const needle = q.trim();
  const shown = needle ? rows.filter((r) => matchesSearch(`${r.title} ${r.workId} ${r.service?.name ?? ""}`, needle)) : rows;

  const promptRow = rows.find((r) => r.id === promptId) ?? null;
  const sendRow = rows.find((r) => r.id === sendId) ?? null;

  useAiField("documents.my.search.input", { get: () => q, set: setQ });
  useAiField("documents.my.filters.mode", {
    get: () => tab,
    set: (v) => {
      const w = v.trim().toLowerCase();
      const hit = TABS.find((tb) => tb === w || t(`tab_${tb}`).toLowerCase() === w);
      if (hit || !w) setTab(hit ?? "all");
    },
  });
  useAiField(seen.length > 1 ? "documents.my.filters.status" : "", {
    get: () => pick,
    set: (v) => {
      if (!v || seen.includes(v)) setPick(v);
    },
  });
  useAiField(sendRow ? "documents.my.review.need" : "", { get: () => sendNeed, set: setSendNeed, sensitive: true, fillable: true });
  useAiSelection("my_documents_tab", tab);
  useAiReveal("documents.my.list", () => setQ(""));
  useAiReveal(/^documents\.my\.item\./, (id) => {
    const rid = id.slice("documents.my.item.".length).split(".")[0] ?? "";
    setQ("");
    if (!rid || rows.some((r) => aiSeg(r.id) === rid)) return;
    if (tab !== "all" || pick) {
      setTab("all");
      setPick("");
      return;
    }
    if (more) void loadMore();
  });

  const fields: FilterField[] = [
    {
      key: "mode",
      label: t("filterMode"),
      icon: IconEdit,
      value: tab,
      empty: "all",
      onChange: (v) => setTab(asTab(v)),
      options: TABS.map((tb) => ({ value: tb, label: t(`tab_${tb}`) })),
      aiId: "documents.my.filters.mode",
    },
    {
      key: "status",
      label: tcm("filterStatus"),
      icon: IconCircleCheck,
      value: pick,
      onChange: setPick,
      hidden: seen.length < 2,
      options: [{ value: "", label: tcm("filterAllStatuses") }, ...seen.map((s) => ({ value: s, label: statusLabel(tcm, s, "docStatus") || s }))],
      aiId: "documents.my.filters.status",
    },
  ];

  async function download(item: ClientDocFlowItem) {
    if (!item.file.ready || dlBusy) return;
    setDlBusy(item.id);
    const ok = await fetchAndDeliver(() => getDocumentRequestFile(item.id), `${item.title || t("title")}.${item.file.format || "docx"}`, true);
    if (ok) notify.dismiss(`mydocs-dl:${item.id}`);
    else notify.error(t("downloadError"), { id: `mydocs-dl:${item.id}`, body: item.title || undefined, action: { label: tn("retry"), onClick: () => void download(item) } });
    setDlBusy("");
  }

  function describe(item: ClientDocFlowItem) {
    const room = item.secureChatRoomId || rooms[item.id];
    const ready = item.file.ready;
    const basePhase = docPayPhase(item.status, item.mode === "lawyer", item.payment.required);
    const mark = flash[item.id];
    const phase: RowPhase =
      mark === "rejected" && basePhase ? "cancelled" : mark === "pooled" && (basePhase === "wait" || POOL_STATUSES.has(item.status)) ? "pooled" : basePhase;
    const shownStatus =
      phase === "pooled" && !POOL_STATUSES.has(item.status) ? "open_pool" : phase === "cancelled" && !DOC_PAYMENT_STOPPED.has(item.status) ? "payment_cancelled" : item.status;
    const tone: Tone = statusTone(shownStatus, phase);
    return { item, room, ready, phase, shownStatus, tone };
  }
  const described = shown.map(describe);
  const urgent = described.filter((v) => v.tone === "pay" || v.tone === "you");
  const others = described.filter((v) => v.tone !== "pay" && v.tone !== "you");
  const filtered = tab !== "all" || !!pick || !!needle;
  function resetFilters() {
    setTab("all");
    setPick("");
    setQ("");
  }
  function retry() {
    setStatus("loading");
    refresh();
  }

  function card({ item, room, ready, phase, shownStatus, tone }: ReturnType<typeof describe>) {
    const ModeIcon = MODE_ICON[item.mode] ?? FileText;
    const kind = docKindOf(item.requestedDocumentType, item.title, item.service?.name ?? "");
    const payCur = item.payment.currency && !/^uzs$/i.test(item.payment.currency) ? item.payment.currency : tcommon("som");
    const canContinue = !!item.constructorAction?.available && !!(item.constructorUrls.continueUrl || item.constructorAction?.continueUrl);
    const blocked = !item.canSendLawyerRequest;
    const canSend = item.mode === "manual" && tone !== "closed" && phase !== "wait" && phase !== "pooled" && !blocked;
    const why = blocked && item.lawyerRequestBlockReason && item.mode === "manual" && !ready && tone !== "closed" ? item.lawyerRequestBlockReason : "";
    const info = rated[item.id];
    const workId = item.workId || info?.workId || "";
    const itemAi = aiId("documents.my.item", item.id);
    const modeText = t.has(`tab_${item.mode}`) ? t(`tab_${item.mode}`) : item.mode;
    const statusText = shownStatus === item.status ? statusLabel(tcm, item.status, "docStatus") || item.statusLabel : statusLabel(tcm, shownStatus, "docStatus");
    const flow = flowOf(item, shownStatus, phase, tone);
    const servicePrice = item.service?.price ?? 0;
    const amount = item.payment.amount > 0 ? item.payment.amount : servicePrice > 0 ? servicePrice : 0;
    const price =
      phase === "wait"
        ? { kind: "wait", label: t("priceWait") }
        : phase === "cancelled"
          ? { kind: "off", label: t("priceCancelled") }
          : flow?.payDone && amount
            ? { kind: "paid", label: t("pricePaid") }
            : amount
              ? { kind: "info", label: t("priceInfo") }
              : !item.payment.required && item.mode !== "lawyer" && tone !== "closed"
                ? { kind: "none", label: "" }
                : null;
    const nowTitle = phase ? t(`pay.${phase}.title`) : item.nextAction ? nextActionText(item.nextAction) : "";
    const nowText = phase ? t(`pay.${phase}.text`) : "";
    // The dashboard's 4-segment bar: one segment per step this document
    // actually goes through (a step it skips is not drawn), filled up to the
    // one it is on, and "n/total · what happens now" under it.
    const steps = flow ? FLOW.filter((st) => flow.state[st] !== "skip") : [];
    const at = flow ? steps.findIndex((st) => flow.state[st] === "now" || flow.state[st] === "fail") : -1;
    const stepN = at >= 0 ? at + 1 : steps.filter((st) => flow?.state[st] === "done").length;
    const stepCur = at >= 0 ? steps[at] : steps[steps.length - 1];
    const stepTone = tone === "pay" || tone === "you" ? "warn" : tone === "done" ? "ok" : "blue";
    const pill = PILL[tone] ?? PILL.working;
    // An advocate who has taken the work is working on it, not awaited.
    const PillIcon = tone === "waiting" && (shownStatus === "claimed" || shownStatus === "lawyer_review") ? Sparkles : pill.Icon;
    type ActKey = "download" | "continue" | "chat" | "send" | "copilot";
    const reviewing = flow?.state.review === "now";
    const primary: ActKey | "" = reviewing && room ? "chat" : ready ? "download" : canContinue && (tone === "you" || !room) ? "continue" : room ? "chat" : canSend ? "send" : "";
    const btn = (key: ActKey) => `btn ${primary === key ? "btn--pri" : "btn--line"} btn--sm mdc__btn lxd-btn`;
    const acts: { key: ActKey; node: ReactNode }[] = [];
    const docTitle = item.title || t("title");
    if (room ? copilotChat : copilotFree)
      acts.push({
        key: "copilot",
        node: (
          <CopilotLauncher
            key="copilot"
            variant="icon"
            surface="client_document_detail"
            entity={room ? { type: "secure_chat", id: room, code: workId || undefined, title: docTitle } : null}
            title={docTitle}
            label={tcp("place.aboutItem", { title: docTitle })}
            context={room ? undefined : { label: [workId, docTitle].filter(Boolean).join(" · "), work_id: workId || undefined }}
            aiId={aiId(itemAi, "copilot")}
            className="lxd-ai"
          />
        ),
      });
    if (ready)
      acts.push({
        key: "download",
        node: (
          <button key="download" type="button" className={btn("download")} disabled={dlBusy === item.id} onClick={() => download(item)} data-ai-id={aiId(itemAi, "download")} data-ai-label={t("download")}>
            <Download aria-hidden />
            {dlBusy === item.id ? tcommon("processingShort") : t("download")}
          </button>
        ),
      });
    if (canContinue)
      acts.push({
        key: "continue",
        node: (
          <button
            key="continue"
            type="button"
            className={btn("continue")}
            disabled={!!openBusy}
            onClick={() => (item.constructorAction?.promptRequired ? setPromptId(item.id) : void openConstructor(item))}
            data-ai-id={aiId(itemAi, "continue")}
            data-ai-label={t("constructorContinue")}
            title={t("constructorContinue")}
          >
            <PenLine aria-hidden />
            {openBusy === item.id ? tcommon("processingShort") : t("actContinue")}
          </button>
        ),
      });
    // The chat opens in the cabinet's own messenger, so the client stays in
    // the dashboard shell (the standalone /portal/chat/{room} has no sidebar).
    if (room)
      acts.push({
        key: "chat",
        node: (
          <Link key="chat" href={`/portal/client/messages?room=${encodeURIComponent(room)}`} className={btn("chat")} data-ai-id={aiId(itemAi, "chat")} data-ai-label={t("openChat")}>
            <MessageSquareText aria-hidden />
            {t("actChat")}
          </Link>
        ),
      });
    if (canSend)
      acts.push({
        key: "send",
        node: (
          <button
            key="send"
            type="button"
            className={btn("send")}
            disabled={sendBusy}
            onClick={() => {
              setSendId(item.id);
              setSendNeed("");
            }}
            data-ai-id={aiId(itemAi, "review")}
            data-ai-label={tcommon("reviewOpen")}
            title={tcommon("reviewOpen")}
          >
            <Scale aria-hidden />
            {t("actSend")}
          </button>
        ),
      });
    acts.sort((x, y) => (x.key === primary ? 1 : 0) - (y.key === primary ? 1 : 0));
    const cls = [
      "mdc",
      "lxd-doc",
      `mdc--${tone}`,
      ready ? "mdc--ready" : "",
      tone === "closed" || tone === "off" ? "mdc--closed" : "",
      promptId === item.id ? "mdc--flag" : "",
      fresh.includes(item.id) ? "mdc--fresh" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <article
        className={cls}
        key={item.id}
        data-ai-target={`documents.item.${item.id}`}
        data-ai-id={itemAi}
        data-ai-type="list_item"
        data-ai-label={[modeText, statusText].filter(Boolean).join(" · ")}
        data-ai-entity-type="document_request"
        data-ai-entity-id={item.id}
        data-ai-private
      >
        <header className="lxd-doc__h">
          {/* The kind's duotone drawing on a light plate, like the
              dashboard's area cards — in place of the gradient glyph tile. */}
          <span className={`lxd-doc__art lxd-doc__art--${kind}`} style={plate(KIND_ART[kind])} aria-hidden />
          <div className="lxd-doc__main">
            <b className="mdc__t lxd-doc__t">{item.title || t("title")}</b>
            <div className="lxd-doc__meta">
              <span className={`lxd-tag lxd-tag--${item.mode}`}>
                <ModeIcon aria-hidden />
                {modeText}
              </span>
              {workId ? (
                <span className="lxd-tag lxd-tag--id" title={t("workId")}>
                  {workId}
                </span>
              ) : null}
              {item.requestedDocumentType ? (
                <span>
                  <Tag aria-hidden />
                  {item.requestedDocumentType}
                </span>
              ) : null}
              {item.assignedLawyer?.name ? (
                <span>
                  <UserRound aria-hidden />
                  {item.assignedLawyer.name}
                </span>
              ) : null}
              {item.meeting ? (
                <span className={item.meeting.active ? "lxd-doc__live" : undefined}>
                  <Video aria-hidden />
                  {item.meeting.active ? t("meetingActive") : item.meeting.status || t("meetingLabel")}
                </span>
              ) : null}
              {item.createdAt ? (
                <span>
                  <Clock aria-hidden />
                  {shortDateTime(item.createdAt, locale)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="lxd-doc__side">
            <em className={`cx-pill ${pill.cls} lxd-doc__st`}>
              <PillIcon aria-hidden />
              {statusText}
            </em>
            {info?.rating.submitted && info.rating.value ? (
              <span className="mdc__stars">
                <DocRatedStars value={info.rating.value} />
              </span>
            ) : null}
          </div>
        </header>

        {steps.length || nowTitle ? (
          <div
            className={`lxd-doc__flow lxd-doc__flow--${stepTone}`}
            role={phase ? "status" : "group"}
            aria-label={t("flowLabel")}
            data-ai-id={phase === "wait" ? aiId(itemAi, "payment") : undefined}
            data-ai-type={phase === "wait" ? "payment_gate" : undefined}
            data-ai-label={phase === "wait" ? t("pay.wait.title") : undefined}
          >
            {steps.length ? (
              <span className={`cx-steps cx-steps--${stepTone} lxd-steps`} style={{ "--n": steps.length } as CSSProperties} aria-hidden>
                {steps.map((st) => {
                  const state = flow?.state[st];
                  return <i key={st} className={state === "done" ? "on" : state === "now" ? "on now" : state === "fail" ? "fail" : ""} />;
                })}
              </span>
            ) : null}
            {/* As the dashboard writes it: "2/4 · what happens now". The
                step's own name stands in when the backend sends no next
                action. One run of text, so a long line wraps between words. */}
            <span className="cx-work__stage lxd-doc__stage">
              {steps.length && stepCur ? <b>{`${stepN}/${steps.length}`}</b> : null}
              {steps.length && stepCur ? " · " : null}
              {nowTitle || (stepCur ? t(STEP_KEY[stepCur]) : "")}
            </span>
            {nowText ? <small className="lxd-doc__note">{nowText}</small> : null}
          </div>
        ) : null}

        {info ? <DocRatingBox id={item.id} rating={info.rating} onRated={refresh} /> : null}

        {price || acts.length || why ? (
          <footer className="mdc__f lxd-doc__foot">
            {price ? (
              <div className={`lxd-price lxd-price--${price.kind}`}>
                {price.kind === "none" ? (
                  <small>{t("priceNone")}</small>
                ) : (
                  <>
                    {amount ? (
                      <b>
                        {fmtUzs(amount)} <i>{payCur}</i>
                      </b>
                    ) : null}
                    <small>{price.label}</small>
                  </>
                )}
              </div>
            ) : (
              <span />
            )}
            <div className="mdc__acts lxd-doc__acts">
              {why ? (
                <details className="mdc__why lxd-why">
                  <summary className="lxd-why__btn" aria-label={t("whyBlocked")} title={t("whyBlocked")}>
                    <Info aria-hidden />
                  </summary>
                  <p role="note">{why}</p>
                </details>
              ) : null}
              {acts.map((a) => a.node)}
            </div>
          </footer>
        ) : null}
      </article>
    );
  }

  const loadMoreBtn = more ? (
    <button type="button" className="btn btn--line btn--full ntmore" onClick={() => void loadMore()} disabled={moreBusy} data-ai-id="documents.my.load-more">
      {moreBusy ? tcm("loadingMore") : tcm("loadMore")}
    </button>
  ) : null;

  return (
    <div className="lxd" data-ai-target="documents:my-documents" data-ai-id="documents.my.page" data-ai-type="section" data-ai-label={t("title")}>
      {/* The page's own title is the shell header's "Mening hujjatlarim";
          this is the dashboard's navy feature card under it: the "Huquqiy
          hujjatlar" drawing in a white circle, what the page is for, the AI
          helper, and the four counts — each a quick filter by status. */}
      <header className="lxd-hero">
        <span className="lxd-hero__art" style={art("Huquqiy_hujjatlar")} aria-hidden />
        <div className="lxd-hero__main">
          <h2 className="lxd-hero__t">{t("lead")}</h2>
          <p className="lxd-hero__s">{tx("heroSub")}</p>
        </div>
        <div className="lxd-hero__tools">
          <CopilotLauncher surface="client_document_detail" title={t("title")} className="lxd-hero__ai" />
        </div>
        <div className="mydocs__views lxd-views" role="group" aria-label={t("views")} data-ai-target="documents:my-stats" data-ai-id="documents.my.stats" data-ai-type="section">
          {VIEWS.map((v) => {
            const n = stats ? stats[v.key === "all" ? "total" : v.key] : null;
            const on = pick === v.status;
            return (
              <button
                key={v.key}
                type="button"
                className={`mydocs__view mydocs__view--${v.tone} lxd-view${on ? " is-on" : ""}`}
                aria-pressed={on}
                onClick={() => setPick(v.status)}
                data-ai-id={`documents.my.view.${v.key}`}
                data-ai-label={t(VIEW_LABEL[v.key])}
              >
                <small className="lxd-view__k">{t(VIEW_LABEL[v.key])}</small>
                <b className="lxd-view__n">{n ?? "—"}</b>
              </button>
            );
          })}
        </div>
      </header>

      <section className="lx-card lxd-box" aria-label={t("title")}>
        <FilterBar
          className="cwk-filters lxd-find"
          fields={fields}
          search={{ value: q, onChange: setQ, placeholder: t("searchPh"), aiId: "documents.my.search.input" }}
          count={status === "ready" && (!more || needle) ? shown.length : undefined}
          aiId="documents.my.filters"
          aiTarget="documents:my-filters"
        />

        {status === "loading" ? (
          <div className="mydocs lxd-skels" aria-busy="true" aria-label={tcm("loadingMore")}>
            {[0, 1, 2].map((i) => (
              <div className="cx-skel lxd-skel" key={i} aria-hidden />
            ))}
          </div>
        ) : status === "error" ? (
          <div data-ai-id="documents.my.retry" data-ai-label={t("retry")}>
            <ErrorState title={t("loadError")} error={loadErr} onRetry={retry} />
          </div>
        ) : !shown.length ? (
          rows.length ? (
            <>
              <EmptyState
                icon={<Search aria-hidden />}
                title={t("searchEmpty")}
                text={more ? t("searchEmptyMore") : t("searchEmptyText")}
                action={
                  <button type="button" className="btn btn--line btn--sm" onClick={resetFilters} data-ai-id="documents.my.reset">
                    {t("resetFilters")}
                  </button>
                }
              />
              {loadMoreBtn}
            </>
          ) : filtered ? (
            <EmptyState
              icon={<Search aria-hidden />}
              title={t("searchEmpty")}
              text={t("filterEmptyText")}
              action={
                <button type="button" className="btn btn--line btn--sm" onClick={resetFilters} data-ai-id="documents.my.reset">
                  {t("resetFilters")}
                </button>
              }
            />
          ) : (
            <EmptyState
              className="lxd-empty"
              icon={<span className="lxd-empty__art" style={art("Huquqiy_hujjatlar")} aria-hidden />}
              title={t("empty")}
              text={t("emptyText")}
              action={
                <Link href="/portal/client/services" className="btn btn--pri btn--sm" data-ai-id="documents.my.browse">
                  <FileText aria-hidden />
                  {t("browse")}
                </Link>
              }
            />
          )
        ) : (
          <div className="mydocs lxd-list" data-ai-id="documents.my.list" data-ai-type="list">
            {urgent.length ? (
              <section className="mydocs__sec mydocs__sec--you lxd-sec lxd-sec--you" aria-labelledby="mydocs-sec-you">
                <header className="mydocs__sech lxd-sec__h">
                  <h3 id="mydocs-sec-you" className="cx-h3">
                    {t("secYou")}
                    <span className="cx-count lxd-count--warn">{urgent.length}</span>
                  </h3>
                  <p className="lx-sub">{t("secYouHint")}</p>
                </header>
                <div className="lxd-grid">{urgent.map(card)}</div>
              </section>
            ) : null}
            {others.length ? (
              <section className="mydocs__sec lxd-sec" aria-labelledby="mydocs-sec-rest">
                <header className="mydocs__sech lxd-sec__h">
                  <h3 id="mydocs-sec-rest" className="cx-h3">
                    {urgent.length ? t("secRest") : tx("listTitle")}
                    <span className="cx-count">{others.length}</span>
                  </h3>
                </header>
                <div className="lxd-grid">{others.map(card)}</div>
              </section>
            ) : null}
            {loadMoreBtn}
          </div>
        )}
      </section>

      {/* §3 L74 + §5 L116: the two-button prompt, in the backend's own title
          and message. Measured on 2026-09-29: its title is byte-identical to
          portal.client.documents.lawyerGateTitle, while its message is one
          short question where the local lead still promised a document filled
          in "0 dan" — which stopped being true when the backend started
          handing back the held row's own constructor. The server's text wins;
          the local strings are the fallback for a deployment that sends none,
          and the button labels stay local because the backend names the two
          actions ("open_constructor" / "wait_for_lawyer") without wording
          them. */}
      <Modal open={!!promptRow} onClose={() => setPromptId("")} title={promptRow?.constructorAction?.title || tcommon("lawyerGateTitle")}>
        <div
          className="cform lxd-dlg"
          style={{ maxWidth: "none" }}
          data-ai-id="documents.my.continue-prompt"
          data-ai-type="modal"
          data-ai-label={promptRow?.constructorAction?.title || tcommon("lawyerGateTitle")}
          data-ai-entity-type="document_request"
          data-ai-entity-id={promptRow?.id || undefined}
        >
          {/* The on-duty advocate's own drawing (the dashboard's "Tezkor
              Navbatchi Advokat"), since this is about the work being with them. */}
          <div className="lxd-dlg__intro">
            <span className="lxd-dlg__art" style={art("Tezkor_Advokat")} aria-hidden />
            <p className="dexit__lead lxd-dlg__lead">{promptRow?.constructorAction?.message || tcommon("lawyerGateLead")}</p>
          </div>
          {promptRow?.lawyerRequestBlockReason ? (
            <p className="dgate__note lxd-dlg__note">
              <Info aria-hidden />
              {promptRow.lawyerRequestBlockReason}
            </p>
          ) : null}
          <div className="dexit__btns lxd-dlg__btns">
            <button type="button" className="btn btn--line btn--full" onClick={() => setPromptId("")}>
              {tcommon("lawyerGateWait")}
            </button>
            <button type="button" className="btn btn--pri btn--full" disabled={!!openBusy} onClick={() => promptRow && void openConstructor(promptRow)}>
              <PenLine aria-hidden />
              {openBusy ? tcommon("processingShort") : tcommon("lawyerGateOpen")}
            </button>
          </div>
        </div>
      </Modal>

      {/* "Advokat tekshiruviga yuborish" from the list. Same endpoint and the
          same wording as the one inside the builder, so a client who meets
          both is not told two different things. */}
      <Modal open={!!sendRow} onClose={() => setSendId("")} title={tcommon("reviewOpen")}>
        <div
          className="cform lxd-dlg"
          style={{ maxWidth: "none" }}
          data-ai-id="documents.my.review"
          data-ai-type="modal"
          data-ai-label={tcommon("reviewOpen")}
          data-ai-entity-type="document_request"
          data-ai-entity-id={sendRow?.id || undefined}
        >
          <div className="lxd-dlg__intro">
            <span className="lxd-dlg__art" style={art("Advokat_tekshiruvi")} aria-hidden />
            <p className="lxd-dlg__lead">{tx("sendLead")}</p>
          </div>
          <div className="docreview lxd-dlg__field" data-ai-private>
            <label htmlFor="mydoc-review-need">{tcommon("reviewNeedLabel")}</label>
            <textarea
              id="mydoc-review-need"
              rows={3}
              value={sendNeed}
              onChange={(e) => setSendNeed(e.target.value)}
              placeholder={tcommon("reviewNeedDefault")}
              data-ai-id="documents.my.review.need"
              data-ai-label={tcommon("reviewNeedLabel")}
              data-ai-private
            />
          </div>
          <div className="dexit__btns lxd-dlg__btns">
            <button type="button" className="btn btn--line btn--full" onClick={() => setSendId("")} disabled={sendBusy}>
              {tcommon("reviewCancel")}
            </button>
            <button type="button" className="btn btn--pri btn--full" disabled={sendBusy} onClick={() => sendRow && void sendToLawyer(sendRow)} data-ai-id="documents.my.review.submit">
              <Scale aria-hidden />
              {sendBusy ? tcommon("processingShort") : tcommon("reviewSubmit")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
