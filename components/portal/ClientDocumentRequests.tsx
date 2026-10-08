"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import {
  listClientDocumentFlowPage,
  getDocumentRequestFile,
  getDocumentRequest,
  searchServices,
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
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import FilterBar, { type FilterField } from "@/components/filters/FilterBar";
import { EmptyState } from "./DataState";
import { shortDateTime } from "@/lib/date";
import { docNextActionKey, statusLabel } from "@/lib/labels";
import { matchesSearch } from "@/lib/searchText";
import { Link, useRouter } from "@/i18n/navigation";
import { IconFileText, IconDownload, IconUser, IconClock, IconVideo, IconChat, IconSparkle, IconScale, IconEdit, IconTag, IconSearch, IconCircleCheck } from "@/components/icons";
import { useAiReveal } from "@/lib/guide/targets";
import {
  KIND_ICON,
  docKindOf,
  ModeSelf,
  ModeAi,
  ModeLawyer,
  StepFill,
  StepPay,
  StepReview,
  StepReady,
  IcoCheck,
  IcoCross,
  IcoMinus,
  IcoInfo,
  IcoStack,
  PriceWait,
  PricePaid,
  PriceCancelled,
  PriceTag,
  PriceIncluded,
} from "./docs/DocIcons";
import { aiId, aiSeg } from "@/lib/ai/ids";
import { useAiField, useAiSelection } from "@/lib/ai/registry";

// Which way this document is being produced — the client filled it in, the
// AI drafted it, or an advocate is writing it. It changes what the card
// means, so it leads the card rather than hiding in a filter chip.
const MODE_ICON = { manual: IconEdit, ai: IconSparkle, lawyer: IconScale } as const;
const MODE_BADGE = { manual: ModeSelf, ai: ModeAi, lawyer: ModeLawyer } as const;

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
const STEP_ICON = { fill: StepFill, pay: StepPay, review: StepReview, ready: StepReady } as const;
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
  { key: "all", status: "", Icon: IcoStack, tone: "neutral" },
  { key: "filling", status: "questionnaire", Icon: StepFill, tone: "warn" },
  { key: "lawyer", status: "lawyer_review", Icon: StepReview, tone: "active" },
  { key: "ready", status: "file_ready", Icon: StepReady, tone: "ok" },
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
  const tcommon = useTranslations("portal.client.documents");
  const tcm = useTranslations("portal.common");
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
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
      .catch(() => alive && setStatus("error"));
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
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

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
  // The backend points at it with an API path
  // (actions.constructor_continue_url = "/document-requests/{id}"), while the
  // page that renders the constructor is keyed on the SERVICE
  // (/portal/client/services/document/{serviceId}, which resumes exactly this
  // request — see ServiceDocumentRequest). The row names that service itself
  // (`service.id`, on 39 of the 50 live rows), so this is a straight
  // navigation with nothing to look up and nothing to fail.
  //
  // It used to find the service by searching the catalogue for the request's
  // title, and that is the button the client reported as dead: catalogue
  // titles run to 133 characters, /services/search refuses a q longer than
  // 120 with a 422, so every long-titled document landed in the catch below
  // and the constructor never opened. The search survives only as the
  // fallback for a row that names no service, and searchServices trims q now.
  async function openConstructor(item: ClientDocFlowItem) {
    if (openBusy) return;
    if (item.service?.id) {
      setPromptId("");
      setNote(null);
      router.push(`/portal/client/services/document/${item.service.id}`);
      return;
    }
    setOpenBusy(item.id);
    setNote(null);
    try {
      const req = await getDocumentRequest(item.id);
      const hits = await searchServices(item.title || req.title, { limit: 50 }, locale);
      const svc = hits.map((h) => h.service).find((s) => !!s.documentTemplateId && s.documentTemplateId === req.templateId);
      if (!svc) {
        setNote({ ok: false, msg: t("constructorOpenError") });
        setPromptId("");
        return;
      }
      setPromptId("");
      router.push(`/portal/client/services/document/${svc.id}`);
    } catch {
      // The notice lives at the top of the list, which is behind this
      // dialog — leaving it open would have shown the client nothing at all.
      setNote({ ok: false, msg: t("constructorOpenError") });
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
    setNote(null);
    try {
      const r = await requestDocumentLawyerReviewGated(item.id, sendNeed.trim() || tcommon("reviewNeedDefault"));
      setSendId("");
      setFlash((cur) => {
        if (!(item.id in cur)) return cur;
        const next = { ...cur };
        delete next[item.id];
        return next;
      });
      if (r.alreadyExists || !r.canSendLawyerRequest) setNote({ ok: false, msg: r.message || item.lawyerRequestBlockReason || tcommon("lawyerPendingLead") });
      // The fee gate of the lawyer-review endpoint: the request exists but it
      // has not reached the advocates, so it is not reported as sent either.
      else if (r.paymentRequired) setNote({ ok: false, msg: r.message || t("lawyerPayRequired") });
      else setNote({ ok: true, msg: r.message || tcommon("reviewSent") });
      refresh();
    } catch {
      setNote({ ok: false, msg: tcommon("error") });
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
      if (rt.name === "document_request.ready" || rt.name === "document_request.completed") setNote({ ok: true, msg: t("readyToast") });
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
        setNote({ ok: true, msg: t("opCreated") });
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
    setNote(null);
    const ok = await fetchAndDeliver(() => getDocumentRequestFile(item.id), `${item.title || t("title")}.${item.file.format || "docx"}`, true);
    if (!ok) setNote({ ok: false, msg: t("downloadError") });
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
    const ModeIcon = MODE_ICON[item.mode as keyof typeof MODE_ICON] ?? IconFileText;
    const Badge = MODE_BADGE[item.mode as keyof typeof MODE_BADGE] ?? ModeSelf;
    const kind = docKindOf(item.requestedDocumentType, item.title, item.service?.name ?? "");
    const KindIcon = KIND_ICON[kind];
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
        ? { kind: "wait", Icon: PriceWait, label: t("priceWait") }
        : phase === "cancelled"
          ? { kind: "off", Icon: PriceCancelled, label: t("priceCancelled") }
          : flow?.payDone && amount
            ? { kind: "paid", Icon: PricePaid, label: t("pricePaid") }
            : amount
              ? { kind: "info", Icon: PriceTag, label: t("priceInfo") }
              : !item.payment.required && item.mode !== "lawyer" && tone !== "closed"
                ? { kind: "none", Icon: PriceIncluded, label: "" }
                : null;
    const nowTitle = phase ? t(`pay.${phase}.title`) : item.nextAction ? nextActionText(item.nextAction) : "";
    const nowText = phase ? t(`pay.${phase}.text`) : "";
    type ActKey = "download" | "continue" | "chat" | "send";
    const reviewing = flow?.state.review === "now";
    const primary: ActKey | "" = reviewing && room ? "chat" : ready ? "download" : canContinue && (tone === "you" || !room) ? "continue" : room ? "chat" : canSend ? "send" : "";
    const btn = (key: ActKey) => `btn ${primary === key ? "btn--grad" : "btn--line"} btn--sm mdc__btn`;
    const acts: { key: ActKey; node: ReactNode }[] = [];
    if (ready)
      acts.push({
        key: "download",
        node: (
          <button key="download" type="button" className={btn("download")} disabled={dlBusy === item.id} onClick={() => download(item)} data-ai-id={aiId(itemAi, "download")} data-ai-label={t("download")}>
            <IconDownload />
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
            <IconEdit />
            {openBusy === item.id ? tcommon("processingShort") : t("actContinue")}
          </button>
        ),
      });
    if (room)
      acts.push({
        key: "chat",
        node: (
          <Link key="chat" href={`/portal/chat/${room}`} className={btn("chat")} data-ai-id={aiId(itemAi, "chat")} data-ai-label={t("openChat")}>
            <IconChat />
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
            <StepReview />
            {t("actSend")}
          </button>
        ),
      });
    acts.sort((x, y) => (x.key === primary ? 1 : 0) - (y.key === primary ? 1 : 0));
    const cls = [
      "mdc",
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
        data-ai-id={itemAi}
        data-ai-type="list_item"
        data-ai-label={[modeText, statusText].filter(Boolean).join(" · ")}
        data-ai-entity-type="document_request"
        data-ai-entity-id={item.id}
        data-ai-private
      >
        <header className="mdc__h">
          <span className={`mdc__ic mdc__ic--${kind}`} aria-hidden>
            <KindIcon />
            <span className={`mdc__badge mdc__badge--${item.mode}`}>
              <Badge />
            </span>
          </span>
          <div className="mdc__ht">
            <div className="mdc__tl">
              <b className="mdc__t">{item.title || t("title")}</b>
              <em className={`mdc__st mdc__st--${tone}`}>{statusText}</em>
            </div>
            <div className="mdc__meta">
              <span className={`mdc__mode mdc__mode--${item.mode}`}>
                <ModeIcon />
                {modeText}
              </span>
              {workId ? (
                <span className="mdc__wid" title={t("workId")}>
                  {workId}
                </span>
              ) : null}
              {item.requestedDocumentType ? (
                <span>
                  <IconTag />
                  {item.requestedDocumentType}
                </span>
              ) : null}
              {item.assignedLawyer?.name ? (
                <span>
                  <IconUser />
                  {item.assignedLawyer.name}
                </span>
              ) : null}
              {item.meeting ? (
                <span className={item.meeting.active ? "mdc__live" : undefined}>
                  <IconVideo />
                  {item.meeting.active ? t("meetingActive") : item.meeting.status || t("meetingLabel")}
                </span>
              ) : null}
              {item.createdAt ? (
                <span>
                  <IconClock />
                  {shortDateTime(item.createdAt, locale)}
                </span>
              ) : null}
            </div>
          </div>
          {info?.rating.submitted && info.rating.value ? (
            <span className="mdc__stars">
              <DocRatedStars value={info.rating.value} />
            </span>
          ) : null}
        </header>

        {flow ? (
          <ol className="mdc__flow" aria-label={t("flowLabel")}>
            {FLOW.map((st) => {
              const state = flow.state[st];
              const Ico = STEP_ICON[st];
              const sub =
                state === "done"
                  ? st === "pay"
                    ? t("flowPaid")
                    : t("flowDone")
                  : state === "now"
                    ? t("flowNow")
                    : state === "skip"
                      ? t("flowSkip")
                      : state === "fail"
                        ? t("flowFail")
                        : t("flowTodo");
              return (
                <li key={st} className={`mdc__step mdc__step--${state}`} aria-current={state === "now" ? "step" : undefined}>
                  <span className="mdc__dot" aria-hidden>
                    {state === "done" ? <IcoCheck /> : state === "fail" ? <IcoCross /> : state === "skip" ? <IcoMinus /> : <Ico />}
                  </span>
                  <span className="mdc__sl">
                    <b>{t(STEP_KEY[st])}</b>
                    <small>{sub}</small>
                  </span>
                </li>
              );
            })}
          </ol>
        ) : null}

        {nowTitle ? (
          <div
            className={`mdc__now mdc__now--${phase || tone}`}
            role={phase ? "status" : undefined}
            data-ai-id={phase === "wait" ? aiId(itemAi, "payment") : undefined}
            data-ai-type={phase === "wait" ? "payment_gate" : undefined}
            data-ai-label={phase === "wait" ? t("pay.wait.title") : undefined}
          >
            <span className="mdc__nowk">{t("nowLabel")}</span>
            <span className="mdc__nowt">
              <b>{nowTitle}</b>
              {nowText ? <small>{nowText}</small> : null}
            </span>
          </div>
        ) : null}

        {info ? <DocRatingBox id={item.id} rating={info.rating} onRated={refresh} /> : null}

        {price || acts.length || why ? (
          <footer className="mdc__f">
            {price ? (
              <div className={`mdc__price mdc__price--${price.kind}`}>
                <span className="mdc__pi" aria-hidden>
                  <price.Icon />
                </span>
                {price.kind === "none" ? (
                  <span className="mdc__pt">
                    <b className="mdc__pnone">{t("priceNone")}</b>
                  </span>
                ) : (
                  <span className="mdc__pt">
                    {amount ? (
                      <b>
                        {fmtUzs(amount)} <i>{payCur}</i>
                      </b>
                    ) : null}
                    <small>{price.label}</small>
                  </span>
                )}
              </div>
            ) : (
              <span />
            )}
            <div className="mdc__acts">
              {why ? (
                <details className="mdc__why">
                  <summary aria-label={t("whyBlocked")} title={t("whyBlocked")}>
                    <IcoInfo />
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
    <div className="ppanel" data-ai-target="documents:my-documents" data-ai-id="documents.my.page" data-ai-type="section" data-ai-label={t("title")}>
      <div className="ppanel__h">
        <div className="mydocs__ttl">
          <b>{t("title")}</b>
          <span>{t("lead")}</span>
        </div>
      </div>

      <div className="mydocs__views" role="group" aria-label={t("views")} data-ai-target="documents:my-stats" data-ai-id="documents.my.stats" data-ai-type="section">
        {VIEWS.map((v) => {
          const n = stats ? stats[v.key === "all" ? "total" : v.key] : null;
          const on = pick === v.status;
          return (
            <button
              key={v.key}
              type="button"
              className={`mydocs__view mydocs__view--${v.tone}${on ? " is-on" : ""}`}
              aria-pressed={on}
              onClick={() => setPick(v.status)}
              data-ai-id={`documents.my.view.${v.key}`}
              data-ai-label={t(VIEW_LABEL[v.key])}
            >
              <span className="mydocs__viewi" aria-hidden><v.Icon /></span>
              <span className="mydocs__viewt">
                <b>{n ?? "—"}</b>
                <small>{t(VIEW_LABEL[v.key])}</small>
              </span>
            </button>
          );
        })}
      </div>

      <FilterBar
        className="cwk-filters"
        fields={fields}
        search={{ value: q, onChange: setQ, placeholder: t("searchPh"), aiId: "documents.my.search.input" }}
        count={status === "ready" && (!more || needle) ? shown.length : undefined}
        aiId="documents.my.filters"
        aiTarget="documents:my-filters"
      />

      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}

      {status === "loading" ? (
        <div className="mydocs" aria-busy="true" aria-label={tcm("loadingMore")}>
          {[0, 1, 2].map((i) => (
            <div className="mydoc mydoc--skel" key={i} aria-hidden>
              <span className="mydoc__i" />
              <div className="mydoc__m">
                <i className="mydoc__sk mydoc__sk--t" />
                <i className="mydoc__sk mydoc__sk--m" />
                <i className="mydoc__sk mydoc__sk--r" />
              </div>
              <div className="mydoc__side"><i className="mydoc__sk mydoc__sk--b" /></div>
            </div>
          ))}
        </div>
      ) : status === "error" ? (
        <div className="mydocs__fail" role="alert">
          <Notice ok={false} msg={t("loadError")} />
          <button type="button" className="btn btn--line btn--sm" onClick={retry} data-ai-id="documents.my.retry">
            {t("retry")}
          </button>
        </div>
      ) : !shown.length ? (
        rows.length ? (
          <>
            <EmptyState icon={<IconSearch />} title={t("searchEmpty")} text={more ? t("searchEmptyMore") : t("searchEmptyText")} />
            <div className="mydocs__emptyacts">
              <button type="button" className="btn btn--line btn--sm" onClick={resetFilters} data-ai-id="documents.my.reset">
                {t("resetFilters")}
              </button>
            </div>
            {loadMoreBtn}
          </>
        ) : filtered ? (
          <>
            <EmptyState icon={<IconSearch />} title={t("searchEmpty")} text={t("filterEmptyText")} />
            <div className="mydocs__emptyacts">
              <button type="button" className="btn btn--line btn--sm" onClick={resetFilters} data-ai-id="documents.my.reset">
                {t("resetFilters")}
              </button>
            </div>
          </>
        ) : (
          <>
            <EmptyState icon={<IconFileText />} title={t("empty")} text={t("emptyText")} />
            <div className="mydocs__emptyacts">
              <Link href="/portal/client/services" className="btn btn--grad btn--sm" data-ai-id="documents.my.browse">
                <IconFileText />
                {t("browse")}
              </Link>
            </div>
          </>
        )
      ) : (
        <div className="mydocs" data-ai-id="documents.my.list" data-ai-type="list">
          {urgent.length ? (
            <section className="mydocs__sec mydocs__sec--you" aria-labelledby="mydocs-sec-you">
              <header className="mydocs__sech">
                <h3 id="mydocs-sec-you">{t("secYou")}<em>{urgent.length}</em></h3>
                <p>{t("secYouHint")}</p>
              </header>
              {urgent.map(card)}
            </section>
          ) : null}
          {others.length ? (
            <section className="mydocs__sec" aria-labelledby={urgent.length ? "mydocs-sec-rest" : undefined}>
              {urgent.length ? (
                <header className="mydocs__sech">
                  <h3 id="mydocs-sec-rest">{t("secRest")}<em>{others.length}</em></h3>
                </header>
              ) : null}
              {others.map(card)}
            </section>
          ) : null}
          {loadMoreBtn}
        </div>
      )}

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
          className="cform"
          style={{ maxWidth: "none" }}
          data-ai-id="documents.my.continue-prompt"
          data-ai-type="modal"
          data-ai-label={promptRow?.constructorAction?.title || tcommon("lawyerGateTitle")}
          data-ai-entity-type="document_request"
          data-ai-entity-id={promptRow?.id || undefined}
        >
          <p className="dexit__lead">
            <span className="dexit__i"><IconScale /></span>
            {promptRow?.constructorAction?.message || tcommon("lawyerGateLead")}
          </p>
          {promptRow?.lawyerRequestBlockReason ? <p className="dgate__note">{promptRow.lawyerRequestBlockReason}</p> : null}
          <div className="dexit__btns">
            <button type="button" className="btn btn--line btn--full" onClick={() => setPromptId("")}>
              {tcommon("lawyerGateWait")}
            </button>
            <button type="button" className="btn btn--grad btn--full" disabled={!!openBusy} onClick={() => promptRow && void openConstructor(promptRow)}>
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
          className="cform"
          style={{ maxWidth: "none" }}
          data-ai-id="documents.my.review"
          data-ai-type="modal"
          data-ai-label={tcommon("reviewOpen")}
          data-ai-entity-type="document_request"
          data-ai-entity-id={sendRow?.id || undefined}
        >
          <div className="docreview" data-ai-private>
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
          <div className="dexit__btns">
            <button type="button" className="btn btn--line btn--full" onClick={() => setSendId("")} disabled={sendBusy}>
              {tcommon("reviewCancel")}
            </button>
            <button type="button" className="btn btn--grad btn--full" disabled={sendBusy} onClick={() => sendRow && void sendToLawyer(sendRow)} data-ai-id="documents.my.review.submit">
              {sendBusy ? tcommon("processingShort") : tcommon("reviewSubmit")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
