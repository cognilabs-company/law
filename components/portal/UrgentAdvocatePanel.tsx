"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  getUrgentCatalog,
  createUrgentRequest,
  listMyUrgentRequests,
  cancelUrgentRequest,
  urgentPrice,
  urgentMinutes,
  urgentChannels,
  isPriorPurchaseRequired,
  isUrgentEvent,
  isMissingRoute,
  rateUrgentRequest,
  ratingOpen,
  isRatingClosed,
  opensComplaint,
  type QualityComplaint,
  type UrgentCatalog,
  type UrgentService,
  type UrgentRequest,
  type UrgentGroup,
  type UrgentCreated,
} from "@/lib/services/backend";
import { subscribeUserEvents, onUserSocketResync } from "@/lib/userSocket";
import { contactBlockedOf, errDetail, logApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { dateTimeFull } from "@/lib/date";
import { statusLabel } from "@/lib/labels";
import { Link } from "@/i18n/navigation";
import Modal from "@/components/admin/Modal";
import CallRoom from "@/components/chat/CallRoom";
import { Skeleton, EmptyState } from "./DataState";
// The five-point star the rating rows draw. It is not in components/icons.tsx
// because it carries pathLength="360" for the dashed idle animation, and that
// attribute belongs to the rating widgets rather than to every caller of a
// shared icon; DocRatingBox is where it is defined and both rating windows use
// the same one so the two cannot drift apart. IconStar, which this row used to
// draw, is the four-point sparkle icons.tsx itself notes "reads as AI, not as
// one of five".
import { RateStar } from "./DocRatingBox";
// The wait clock the three client order forms share (wp-hourglass). Defined
// in NewDocumentOrder because that module is already the shared one of the
// document forms; imported here rather than re-declared so the mark a client
// sees while an urgent request is out is the same mark they saw while a
// document request was out.
import NewDocumentOrder, { WaitClock } from "./NewDocumentOrder";
import { Notice } from "@/components/admin/AdminBits";
import {
  IconVideo,
  IconChat,
  IconUsers,
  IconScale,
  IconBolt,
  IconCheck,
  IconClock,
  IconLock,
  IconAlert,
  IconArrowRight,
  IconFileText,
  IconClose,
  IconChevronRight,
  IconChevronLeft,
  IconLayers,
  IconPhone,
  IconVideoConsult,
  IconExpressCall,
  IconTrafficCase,
  IconChatConsult,
  IconSecondOpinion,
  IconOpinionPanel,
} from "@/components/icons";

// LEXGO_URGENT_ADVOCATE_FRONTEND_UPDATE.md — "Tezkor Advokat xizmati online".
// One module, four services. The two "second opinion" ones are only sold to a
// client who has bought from LexGo before (backend 402
// previous_lexgo_purchase_required), which this screen states up front rather
// than letting the client fill a whole form and then be refused.

// One icon per service, each drawn for that service by name — see the
// "Tezkor advokat" block in components/icons.tsx. The generic set that used
// to sit here (camera / bolt / warning triangle / chat bubble / scales /
// crowd) described the medium at best, and inside the "Ikkinchi fikr" dialog
// it described nothing at all: the scales are what every legal screen on the
// site already uses, and a crowd is not a panel of advocates.
const ICONS: Record<string, typeof IconVideo> = {
  video_consultation: IconVideoConsult,
  // Straight to whoever is on duty (payload.assignment_mode = on_duty_pool).
  express_video_consultation: IconExpressCall,
  traffic_accident_consultation: IconTrafficCase,
  chat_consultation: IconChatConsult,
  second_opinion_single: IconSecondOpinion,
  second_opinion_group: IconOpinionPanel,
};

// The documented payload sends the direction as the Uzbek slug
// (directions: ["jinoiy"]). The label beside it is the ordinary translated
// practice area, so the picker reads in the UI language whatever it sends.
const DIRECTIONS: { slug: string; area: string }[] = [
  { slug: "jinoiy", area: "criminal" },
  { slug: "fuqarolik", area: "civil" },
  { slug: "oila", area: "family" },
  { slug: "mehnat", area: "labor" },
  { slug: "mamuriy", area: "administrative" },
  { slug: "iqtisodiy", area: "economic" },
  { slug: "soliq", area: "tax" },
];

const GROUP = "second_opinion_group";
// The two video consultations are one decision with two answers — ordinary,
// which queues in the call-center pool, and express, which rings whoever is
// on duty right now. The catalog marks them (variant: ordinary | express)
// but does not group them, so the grouping is made here and merged with
// whatever the backend does send. Written as a group rather than as two
// cards because side by side they read as unrelated services at two prices.
const VIDEO_GROUP = "video_consultation_kind";
const VIDEO_ITEMS = ["video_consultation", "express_video_consultation"];

// The running order of the grid, by service key. The catalog sends video,
// express_video, traffic_accident, chat, and the two second opinions, which
// put the road-accident card second and the chat fourth; chat belongs second
// instead, because it is the one route a client can take from a place where
// they cannot speak, and the road accident is a single situation rather than
// a general way of reaching an advocate. Only the named keys are ranked: a
// service the backend adds later has no rank, so it keeps its catalog
// position and falls in after these.
const CARD_ORDER = ["video_consultation", "chat_consultation", "traffic_accident_consultation"];

// The immediate call an express or YTX order opens, as this screen needs it:
// the session to join plus the three facts its header has to state.
//
// `serviceKind` is carried rather than assumed to be express.
// LEXGO_EXPRESS_VIDEOKONSULTATSIYA_AUDIO_CALL_FRONTEND_2026_09_28.md L36 —
// "`traffic_accident_consultation` ham shu immediate audio call flow bilan
// ishlaydi" — and the live catalog agrees: both services answer
// immediate_call: true (GET /urgent-advokat/catalog, read 2026-09-29), so a
// hardcoded "Express videokonsultatsiya" title mislabelled every road-accident
// call. `lawyer` is the on-duty advocate the create response names in
// `assigned_lawyer` (same MD, L51-56): the client is about to speak to a
// person and should be told who before the room opens.
type LiveCall = { call: NonNullable<UrgentCreated["call"]>; workId: string; serviceKind: string; lawyer: string };

// The 15-minute rating window, as mm:ss. Counted down from the backend's own
// `rating_deadline_at` rather than from fifteen, so a detail left open all
// night shows the truth — the same reasoning, and the same shape, as
// DocRatingBox's private `clock()`. It is copied rather than imported because
// that helper is module-private to DocRatingBox and this workpackage does not
// own that file; the lead may lift one of the two into a shared module.
function ratingClock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function UrgentAdvocatePanel() {
  const t = useTranslations("portal.client.urgent");
  const te = useTranslations("enums");
  const tcm = useTranslations("portal.common");
  // The two document flows name themselves in portal.client.newDoc — the
  // document card lists them, and one wording for both screens is the point.
  const tnd = useTranslations("portal.client.newDoc");
  const locale = useLocale();

  const [cat, setCat] = useState<UrgentCatalog | null>(null);
  const [catState, setCatState] = useState<"loading" | "ready" | "error">("loading");
  const [mine, setMine] = useState<UrgentRequest[]>([]);
  const [mineState, setMineState] = useState<"loading" | "ready" | "error">("loading");
  const [reload, setReload] = useState(0);

  // ?service=<key> opens the page already on that service — the dashboard's
  // road-accident card links straight to the one it names.
  const params = useSearchParams();
  const [pick, setPick] = useState(() => params.get("service") ?? "");
  // The grouped card whose kinds are on offer, by card key. It survives the
  // move to the form step so the Back button knows where it came from.
  const [kindPick, setKindPick] = useState("");
  // The document card's dialog. It is not a Tezkor service and has no catalog
  // entry — see the card itself, at the end of the grid.
  const [docsOpen, setDocsOpen] = useState(false);
  // Which step of the ONE order dialog is showing, "" for shut. The kind
  // chooser and the configurator used to be two different things in two
  // different places — a <Modal> for "which kind?" and then an in-page panel
  // below the grid for everything else. They are one dialog now, so the box
  // that opens on the press is the box the order finishes in, and Back from
  // the form returns to the kinds instead of dropping the client on the grid.
  //
  // ?service=<key> arrives already meaning "order this one" (the dashboard's
  // road-accident card links here), so it opens on the form. Read from the
  // query in the initialiser, beside `pick`, rather than corrected by an
  // effect afterwards.
  const [step, setStep] = useState<"" | "kind" | "form">(() => (params.get("service") ? "form" : ""));
  // LexGo Express Videokonsultatsiya, 2026-09-28: the express and YTX kinds
  // do not queue. The POST comes back with an on-duty advocate already
  // assigned and an audio call ringing, so the client goes straight into the
  // call rather than to a list of requests. Verified live: status
  // "meeting_active", immediate_call true, call_type "audio".
  const [live, setLive] = useState<LiveCall | null>(null);
  // Stored as a PREFERENCE and resolved against what the picked service
  // offers, rather than corrected by an effect after the fact: switching to a
  // chat-only service must not leave one render showing a video price.
  const [channelPref, setChannelPref] = useState("video");
  const [lawyers, setLawyers] = useState(3);
  const [dirs, setDirs] = useState<string[]>([]);
  const [need, setNeed] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  // Which required field blocked the last press, "" when none did. The send
  // is NOT disabled for these — see submit(). Cleared the moment the client
  // fixes what it names. Same shape as the consent gate in
  // components/portal/DocumentLawyerAssist.tsx, deliberately: one press must
  // not produce two different vocabularies for "fill this in".
  const [miss, setMiss] = useState<"" | "dirs" | "need">("");
  // A failed POST, shown INSIDE the dialog. It used to go to the page-level
  // banner, which would now be behind a dialog the client is still standing
  // in — and closing the dialog to show it would throw away everything they
  // typed just to say "try again".
  const [formErr, setFormErr] = useState("");
  // The 402 second-opinion refusal, as its own modal rather than an inline
  // line — see the gate component below.
  const [gate, setGate] = useState("");
  const [openId, setOpenId] = useState("");
  // The request this visit created, highlighted in the list below so the
  // client can see the thing they just made.
  const [fresh, setFresh] = useState("");

  useEffect(() => {
    let alive = true;
    getUrgentCatalog()
      .then((c) => { if (alive) { setCat(c); setCatState("ready"); } })
      .catch((e) => { if (alive) { logApiError("urgent catalog", e); setCatState("error"); } });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    listMyUrgentRequests()
      .then((r) => { if (alive) { setMine(r); setMineState("ready"); } })
      // A client who has never ordered one gets an empty list, not an error;
      // anything else is a real failure and says so.
      .catch((e) => {
        if (!alive) return;
        logApiError("urgent requests", e);
        // A module the backend has not enabled reads as an empty list, not as
        // a broken page.
        setMineState(isMissingRoute(e) ? "ready" : "error");
      });
    return () => { alive = false; };
  }, [reload]);

  // Realtime: claimed, scheduled, meeting created, completed, cancelled. The
  // client's list is refetched on the event instead of polled — the MD's
  // "WS event kelganda list/detailni refetch qilish yetarli".
  const refetch = useCallback(() => setReload((k) => k + 1), []);
  const again = useRef(refetch);
  useEffect(() => { again.current = refetch; }, [refetch]);
  useEffect(() => {
    const off = subscribeUserEvents((e) => { if (isUrgentEvent(e.event)) again.current(); });
    const offSync = onUserSocketResync(() => again.current());
    return () => { off(); offSync(); };
  }, []);

  const services = useMemo(() => cat?.services ?? [], [cat]);
  // The catalog says which services the client should see as one choice
  // (groups[].items). Rendered in catalog order: the group takes the slot of
  // its first member and the rest are folded into it.
  const cards = useMemo(() => {
    const backend = cat?.groups ?? [];
    // Only when both kinds are actually on offer, and never over a group the
    // backend has started sending itself.
    const haveBoth = VIDEO_ITEMS.every((k) => services.some((x) => x.key === k));
    const claimed = new Set(backend.flatMap((g) => g.items));
    const groups: UrgentGroup[] =
      haveBoth && !VIDEO_ITEMS.some((k) => claimed.has(k))
        ? [...backend, { key: VIDEO_GROUP, title: "", items: VIDEO_ITEMS }]
        : backend;
    const owner = new Map<string, UrgentGroup>();
    for (const g of groups) for (const k of g.items) owner.set(k, g);
    const out: { key: string; group?: UrgentGroup; items: UrgentService[] }[] = [];
    const placed = new Set<string>();
    for (const s of services) {
      const g = owner.get(s.key);
      if (!g) { out.push({ key: s.key, items: [s] }); continue; }
      if (placed.has(g.key)) continue;
      placed.add(g.key);
      out.push({ key: g.key, group: g, items: services.filter((x) => g.items.includes(x.key)) });
    }
    // A card ranks as the best-ranked service inside it, so the video box
    // leads on video_consultation whichever of its two kinds is picked. The
    // sort is stable, so everything unranked shares CARD_ORDER.length and
    // stays in the order the catalog sent it.
    const rank = (items: UrgentService[]) =>
      items.reduce((best, x) => {
        const i = CARD_ORDER.indexOf(x.key);
        return i >= 0 && i < best ? i : best;
      }, CARD_ORDER.length);
    return out.sort((a, b) => rank(a.items) - rank(b.items));
  }, [services, cat]);
  const sel = useMemo(() => services.find((s) => s.key === pick), [services, pick]);
  // The record the detail modal is showing, re-read from the live list so a
  // realtime refetch updates what is open instead of freezing a copy.
  const openReq = useMemo(() => mine.find((r) => r.id === openId), [mine, openId]);
  const kindCard = useMemo(() => cards.find((c) => c.key === kindPick && c.group), [cards, kindPick]);
  const channels = urgentChannels(sel);
  const channel = channels.includes(channelPref) ? channelPref : channels[0] || "video";

  // Which group a service belongs to, if any — the same list the cards were
  // built from, so the form's switch and the grid never disagree.
  const groupsAll = useMemo(() => cards.filter((c) => c.group).map((c) => c.group!), [cards]);
  const groupOf = (x: UrgentService | undefined) =>
    x ? groupsAll.find((g) => g.items.includes(x.key)) : undefined;
  // A group's heading: the backend's own title when it sent one, else ours.
  const groupTitle = (g: UrgentGroup) => (g.title ? g.title : t.has(`groups.${g.key}`) ? t(`groups.${g.key}`) : g.key);
  // What a service is, in one sentence. Keyed on the service so a card the
  // backend adds later simply shows nothing rather than the wrong text.
  const about = (k: string) => (t.has(`about.${k}`) ? t(`about.${k}`) : "");

  const isGroup = sel?.key === GROUP;
  const price = urgentPrice(sel, channel, isGroup ? lawyers : 1);
  const minutes = urgentMinutes(sel, channel);

  // Picking no longer toggles. While the configurator was an in-page panel a
  // second press on the same card was the only way to fold it away again; the
  // dialog has its own close, and a card that un-picked itself on the press
  // that was meant to re-open the order was simply a dead press.
  function choose(s: UrgentService) {
    setPick(s.key);
    setNote(null);
    setGate("");
    setMiss("");
    setFormErr("");
    if (s.key === GROUP) setLawyers(Math.max(s.lawyerCountMin || 2, 3));
  }

  // Open the dialog on the kinds of a grouped card, or straight on the form
  // for a card that stands for a single service.
  function openKinds(key: string) {
    setKindPick(key);
    setStep("kind");
  }
  function openForm(s: UrgentService) {
    choose(s);
    setStep("form");
  }

  function toggleDir(slug: string) {
    setDirs((cur) => (cur.includes(slug) ? cur.filter((x) => x !== slug) : [...cur, slug]));
    // Touching the chips answers the complaint about the chips, whichever way
    // the press went — the warning must not outlive the thing it pointed at.
    setMiss((m) => (m === "dirs" ? "" : m));
  }

  async function submit() {
    if (!sel || busy) return;
    // The gate is HERE and not on the button's `disabled`, which is the whole
    // point of this change: the send used to carry
    // disabled={busy || !need.trim() || !dirs.length}, so a client who had
    // missed a field pressed a control that could not be pressed and was told
    // nothing at all. One field at a time, in the order the form asks for
    // them, marked on the control itself and given focus — which inside a
    // scrolling dialog also brings it back into view.
    if (!dirs.length) {
      setMiss("dirs");
      document.getElementById("ua-dirs")?.focus();
      return;
    }
    if (need.trim().length < 10) {
      setMiss("need");
      document.getElementById("ua-need")?.focus();
      return;
    }
    setMiss("");
    setBusy(true);
    setNote(null);
    setGate("");
    setFormErr("");
    try {
      const created = await createUrgentRequest({
        serviceKind: sel.key,
        channel,
        need: need.trim(),
        directions: dirs,
        lawyerCount: isGroup ? lawyers : undefined,
      });
      // The whole form resets, not just the text: leaving the practice areas
      // ticked meant the next order silently inherited the last one's.
      setNeed("");
      setDirs([]);
      setPick("");
      // The order is placed, so the dialog has nothing left to ask. Shut
      // before anything else so that on the immediate-call branch below the
      // Modal's unmount (which restores body overflow) runs in the same
      // commit that mounts CallRoom, rather than a call opening behind a
      // dialog that is still holding the page's scroll.
      setStep("");
      setFresh(created.request.id);
      setReload((k) => k + 1);
      if (created.immediateCall && created.call) {
        // Straight into the room. No "your request was sent" banner — it was
        // not sent anywhere, it is ringing. The kind and the named on-duty
        // advocate travel with the session so the call header can say which
        // service this is and who is on the other end.
        setLive({
          call: created.call,
          workId: created.request.workId,
          serviceKind: sel.key,
          lawyer: created.request.assignedLawyerName,
        });
        return;
      }
      if (created.immediateCall) {
        // Same MD, L82: the flow is "immediate_call=true VA call_session
        // bo'lsa". The code used to read only the first half and would have
        // dropped the client on a silent screen when the backend found nobody
        // free — there is then no session to join and the request has simply
        // been queued instead. The backend supplies a ready Uzbek sentence for
        // this case in `message`; it is preferred over ours whenever it sent
        // one. (Reasoned, not observed: reaching it needs a POST with every
        // on-duty advocate busy, which a read-only probe cannot arrange.)
        setNote({ ok: true, msg: created.message || t("noDutyLawyer") });
        return;
      }
      // Only the immediate-call branch above prefers the backend's sentence:
      // the express MD names `message` for that one case, and an ordinary
      // queued order has a better Uzbek line of its own here.
      setNote({ ok: true, msg: t("sent") });
    } catch (e) {
      if (isPriorPurchaseRequired(e)) {
        // The gate is a Modal of its own and its whole job is to send the
        // client somewhere else, so this dialog stands down rather than the
        // two stacking two scrims and two body-overflow locks on one page.
        // Nothing typed is lost: `need` and `dirs` are still in state, so
        // picking one of the gate's alternatives reopens the form as it was.
        setStep("");
        setGate(errDetail(e) || t("priorPurchase"));
        return;
      }
      logApiError("urgent request", e);
      setFormErr(errDetail(e) || t("sendError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ua">
      {/* ── Hero: what the module is, and the three numbers that govern
             every meeting inside it. ───────────────────────────────── */}
      <header className="ua__hero">
        <span className="ua__pulse" aria-hidden><IconBolt /></span>
        <div className="ua__heromain">
          <h1 className="ua__title">{cat?.title || t("title")}</h1>
          <p className="ua__sub">{t("lead")}</p>
        </div>
        {cat ? (
          <dl className="ua__meta">
            <div><dt>{t("metaMinutes")}</dt><dd>{t("minutesN", { n: cat.meetingDefaultMinutes })}</dd></div>
            <div><dt>{t("metaFree")}</dt><dd>{t("minutesN", { n: cat.freeExtensionOnceMinutes })}</dd></div>
            <div><dt>{t("metaPaid")}</dt><dd>{t("perMinute", { price: fmtUzs(cat.paidExtensionPricePerMinute) })}</dd></div>
          </dl>
        ) : null}
      </header>

      {note ? (
        <div className={`uadone${note.ok ? " uadone--ok" : " uadone--err"}`} role="status">
          <span className="uadone__i" aria-hidden>{note.ok ? <IconCheck /> : <IconAlert />}</span>
          <div>
            <b>{note.msg}</b>
            {note.ok ? <span>{t("sentNext")}</span> : null}
          </div>
          <button type="button" className="uadone__x" onClick={() => setNote(null)} aria-label={tcm("close")}>
            <IconClose />
          </button>
        </div>
      ) : null}

      {/* ── The four services ─────────────────────────────────────── */}
      {catState === "loading" ? (
        <Skeleton rows={4} />
      ) : catState === "error" ? (
        <EmptyState icon={<IconAlert />} title={tcm("loadError")} text={tcm("loadErrorText")} />
      ) : (
        <div className="ua__grid" data-ai-target="section:urgent-services">
          {cards.map((card) => {
            // A group card stands for whichever of its members is picked, and
            // offers the first one when nothing is.
            const s = card.group ? card.items.find((x) => x.key === pick) ?? card.items[0] : card.items[0];
            if (!s) return null;
            const Icon = card.group ? ICONS[card.items[0].key] ?? IconScale : ICONS[s.key] ?? IconScale;
            const on = card.group ? card.items.some((x) => x.key === pick) : pick === s.key;
            const chans = urgentChannels(s);
            const name = card.group ? groupTitle(card.group) : t.has(`kinds.${s.key}`) ? t(`kinds.${s.key}`) : s.title;
            const lead = about(card.group ? card.group.key : s.key);
            // Straight to whoever is on duty, rather than queued for the
            // call-center — the single fastest fact about a service, and only
            // sayable about a box whose kinds agree on it.
            const now = card.items.every((x) => x.immediateCall);
            const agree = now || card.items.every((x) => !x.immediateCall);
            const how = agree ? (now ? t("deliveryNow") : t("deliveryPool")) : t("deliveryVaries");
            return (
              <button
                key={card.key}
                type="button"
                className={`uacard${on ? " on" : ""}`}
                data-ai-target={card.key === VIDEO_GROUP ? "urgent:video-consultation" : `urgent:${card.key.replace(/_/g, "-")}`}
                // aria-pressed is gone: every card now opens the order dialog,
                // so none of them is a toggle any more and announcing one as
                // pressed described state the button no longer owns. The `on`
                // class stays — it marks the service the client last
                // configured, which is worth seeing behind the dialog.
                aria-haspopup="dialog"
                onClick={() => (card.group ? openKinds(card.key) : openForm(s))}
              >
                <span className="uacard__i"><Icon /></span>
                <b className="uacard__t">{name}</b>
                {/* Two lines at rest; the card grows on hover and on keyboard
                    focus to show the rest, plus how the work is delivered and
                    which kinds a grouped box holds. */}
                {lead ? <span className="uacard__d">{lead}</span> : null}
                <span className="uacard__f">
                  {/* Only channels the order form can actually send. The
                      catalog also sets supports_chat on the video service —
                      that means "messaging inside it", not "orderable as
                      chat", and advertising it here promised a choice the
                      form does not offer. */}
                  {chans.includes("video") ? <em><IconVideo />{t("chVideo")}</em> : null}
                  {chans.includes("chat") ? <em><IconChat />{t("chChat")}</em> : null}
                  {urgentMinutes(s, chans[0] || "video") ? <em><IconClock />{t("minutesN", { n: urgentMinutes(s, chans[0] || "video") })}</em> : null}
                  {card.group ? <em className="uacard__kinds"><IconLayers />{t("kindsN", { n: card.items.length })}</em> : null}
                  {now ? <em className="uacard__now"><IconBolt />{t("immediate")}</em> : null}
                </span>
                {s.requiresPriorPurchase ? (
                  <span className="uacard__lock"><IconLock />{t("priorPurchaseShort")}</span>
                ) : null}
                <span className="uacard__go" aria-hidden><IconArrowRight /></span>

                {/* What the dialog would tell you, on hover and on keyboard
                    focus. It is absolutely positioned, so the grid row never
                    grows and the page underneath cannot jump — the reason the
                    in-flow version had to go. A touch device never fires
                    hover and is given nothing here; it taps the card and gets
                    the dialog, which carries the same sentences. Marked
                    aria-hidden because every fact in it is already on the card
                    or one tap away, and a screen reader should not hear the
                    service described twice. */}
                <span className="uacard__peek" aria-hidden>
                  <b>{name}</b>
                  {lead ? <span>{lead}</span> : null}
                  <em>{how}</em>
                  {card.group ? (
                    <span className="uacard__peekk">
                      {card.items.map((x) => (
                        <b key={x.key}>{t.has(`kinds.${x.key}`) ? t(`kinds.${x.key}`) : x.title}</b>
                      ))}
                    </span>
                  ) : null}
                  {s.requiresPriorPurchase ? <em>{t("priorPurchaseShort")}</em> : null}
                </span>

                {/* The card stretches to fit this; it is not floated over
                    anything, so it is readable at any width and cannot be
                    clipped by the viewport. No prices — those belong to the
                    order form, once there is something to price. */}
                <span className="uacard__more">
                  <span className="uacard__morei">
                    <span className="uacard__how">{how}</span>
                  </span>
                </span>
              </button>
            );
          })}

          {/* ── Huquqiy hujjatlar bo'yicha ishlash ────────────────────
              The one card on this grid with no catalog entry behind it, and
              written by hand for that reason. GET /urgent-advokat/catalog
              sells consultations — time with an advocate — while this is the
              other thing a duty advocate does: write the document, or read
              the one the client already has. Both routes exist already
              (POST /services/…/document-lawyer/request-with-files, the
              from-scratch and review-existing flows of NewDocumentOrder);
              what was missing was any way to reach them from the screen a
              client opens when they want an advocate now.

              So it is a real card, not a service: no price, no channel, no
              meeting minutes, and its own dialog rather than the order form.
              Rendered last so the paid consultations keep the top of the
              grid. */}
          <button
            type="button"
            className="uacard uacard--docs"
            aria-haspopup="dialog"
            onClick={() => setDocsOpen(true)}
          >
            <span className="uacard__i"><IconFileText /></span>
            <b className="uacard__t">{t("docs.title")}</b>
            <span className="uacard__d">{t("docs.lead")}</span>
            <span className="uacard__f">
              <em className="uacard__kinds"><IconLayers />{t("kindsN", { n: 2 })}</em>
            </span>
            <span className="uacard__go" aria-hidden><IconArrowRight /></span>

            <span className="uacard__peek" aria-hidden>
              <b>{t("docs.title")}</b>
              <span>{t("docs.lead")}</span>
              <em>{t("deliveryPool")}</em>
              <span className="uacard__peekk">
                <b>{tnd("scratchTitle")}</b>
                <b>{tnd("reviewTitle")}</b>
              </span>
            </span>

            <span className="uacard__more">
              <span className="uacard__morei">
                <span className="uacard__how">{t("deliveryPool")}</span>
              </span>
            </span>
          </button>
        </div>
      )}

      {/* The two document flows, in the dialog the card opens. The AI
          analysis card NewDocumentOrder also offers is turned off here: a
          client who pressed "Huquqiy hujjatlar bo'yicha ishlash" on the
          Tezkor Advokat grid asked for an advocate. */}
      <Modal open={docsOpen} onClose={() => setDocsOpen(false)} title={t("docs.title")} wide>
        <NewDocumentOrder showAnalysis={false} onClose={() => setDocsOpen(false)} />
      </Modal>

      {/* ── The client's own requests ─────────────────────────────── */}
      <section className="ppanel">
        <div className="ppanel__h">
          <b className="ppanel__t"><span className="pico"><IconClock /></span>{t("mine")}</b>
        </div>
        {mineState === "loading" ? (
          <Skeleton rows={2} />
        ) : mineState === "error" ? (
          <EmptyState icon={<IconAlert />} title={tcm("loadError")} text={tcm("loadErrorText")} />
        ) : !mine.length ? (
          <EmptyState icon={<IconBolt />} title={t("mineEmpty")} text={t("mineEmptyText")} />
        ) : (
          <ul className="ua__list">
            {mine.map((r) => {
              const RowIcon = ICONS[r.serviceKind] ?? IconScale;
              const on = openId === r.id;
              const kind = t.has(`kinds.${r.serviceKind}`) ? t(`kinds.${r.serviceKind}`) : r.serviceTitle || r.serviceKind;
              return (
              <li
                key={r.id}
                className={`ua__row ua__row--tap${on ? " ua__row--on" : ""}${fresh === r.id ? " ua__row--fresh" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={t("detailsOf", { kind })}
                onClick={() => setOpenId(r.id)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  // Space scrolls the page and Enter re-fires on the row's own
                  // buttons unless this is the row itself being activated.
                  if (e.target !== e.currentTarget) return;
                  e.preventDefault();
                  setOpenId(r.id);
                }}
              >
                <span className="ua__rowi"><RowIcon /></span>
                <div className="ua__rowm">
                  {/* The name and the work id used to be two adjacent text
                      runs in one <b>, and .ua__wid is nowrap, so the last
                      word of the name and the 21-character id were a single
                      unbreakable run: 29 of 40 rows overflowed .ua__rowm by
                      up to 57px at 400px. As flex items they are two boxes
                      and the id drops to its own line when the name needs
                      the width. */}
                  <b className="ua__rowt">
                    {kind}
                    {r.workId ? <em className="ua__wid" title={t("workId")}>{r.workId}</em> : null}
                  </b>
                  <span>{[r.need, r.createdAt ? dateTimeFull(r.createdAt, locale) : ""].filter(Boolean).join(" · ")}</span>
                  {r.scheduledAt ? (
                    <span className="ua__when"><IconClock />{t("scheduled", { when: dateTimeFull(r.scheduledAt, locale) })}</span>
                  ) : null}
                  {r.groupLawyers.length ? (
                    <span className="ua__when"><IconUsers />{t("panelOf", { names: r.groupLawyers.map((g) => g.name).join(", ") })}</span>
                  ) : null}
                  {/* LEXGO_EXPRESS_…md L104-120 and L137-141: an immediate
                      order carries payload.call_status and payload.call_channel
                      alongside the request's own status. They say two things
                      `status` cannot. A record sitting at "meeting_active"
                      with call_status "calling" is a phone still ringing, not
                      a meeting under way — the live list has exactly such a
                      row (LGT-20260928-224E46AF, call_status "calling",
                      call_channel "audio") and it read identically to a
                      running one. And the channel is the audio/video answer
                      for a service whose NAME says video, so it is stated
                      rather than inferred from the service key. An unknown
                      value from a later backend is printed as it came rather
                      than swallowed. */}
                  {r.callStatus || r.callChannel ? (
                    <span className={`ua__call${r.callStatus === "calling" ? " ua__call--ring" : ""}`}>
                      <IconPhone />
                      {r.callStatus
                        ? t.has(`callState.${r.callStatus}`) ? t(`callState.${r.callStatus}`) : r.callStatus
                        : null}
                      {r.callChannel ? (
                        <em className="ua__callch">
                          {r.callChannel === "audio" ? t("chAudio") : r.callChannel === "video" ? t("chVideo") : r.callChannel}
                        </em>
                      ) : null}
                    </span>
                  ) : null}
                </div>
                {/* The row itself opens the detail, so anything clickable in
                    here must keep its own click to itself. */}
                <div className="ua__rowr" onClick={(e) => e.stopPropagation()}>
                  <em className={`creq__badge ua__st ua__st--${r.status || "open"}`}>{statusLabel(tcm, r.status)}</em>
                  {r.secureChatRoomId ? (
                    <Link href="/portal/client/messages" className="btn btn--line btn--sm"><IconChat />{t("openChat")}</Link>
                  ) : null}
                  <button type="button" className="btn btn--soft btn--sm" onClick={() => setOpenId(r.id)}>
                    {t("details")}<IconChevronRight />
                  </button>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* An express or YTX request is a call, not a queue entry: it opens
          here the moment the backend answers. `callType` comes off the
          session the backend made, which is audio even for the kind whose
          name says video.

          The header used to be hardcoded to the express service name, so a
          YTX call (same immediate flow — express MD L36) announced itself as
          an express consultation. It now names the kind that was actually
          ordered and the advocate the response assigned (`assigned_lawyer`,
          MD L51-56), so the client can see who picked up before anyone
          speaks. */}
      {live ? (
        <CallRoom
          roomId={live.call.roomId}
          callId={live.call.id}
          callType={live.call.callType === "video" ? "video" : "audio"}
          isCaller
          lk={{ url: live.call.livekitUrl, token: live.call.livekitToken, room: live.call.livekitRoom, hints: live.call.hints, quality: live.call.quality }}
          title={
            [
              t.has(`kinds.${live.serviceKind}`) ? t(`kinds.${live.serviceKind}`) : "",
              live.lawyer,
              live.workId,
            ].filter(Boolean).join(" · ") || undefined
          }
          onEnd={() => { setLive(null); setReload((k) => k + 1); }}
        />
      ) : null}

      {/* ── The order dialog: which kind, then the order itself ─────
          Measured on this page before the change (CDP, real client
          session): picking a service dropped the configurator in below the
          card grid at y=656.5 in a 1100-tall viewport — 443.5 of its
          618.5px on screen, 71.7%, with the submit button at y=1205.9,
          106px under the fold. At 400×860 the same press put the panel at
          y=1554.7 with 0 of its 911.1px visible and the button at y=2378,
          and nothing scrolled: on a phone, tapping a service card produced
          no visible change whatsoever. A dialog puts the whole order in
          the viewport on every press, at every width.

          The kind chooser is step ONE of this same dialog rather than a
          second dialog handing over to it. Two dialogs in sequence show
          the page between them and make Escape from the form mean "back
          to the grid"; one dialog that swaps its contents is a single
          gesture, and Back from the form returns to the kinds. A card that
          stands for one service opens straight on the form and never sees
          step one. */}
      <Modal
        open={step === "kind" ? !!kindCard : step === "form" ? !!sel : false}
        onClose={() => setStep("")}
        title={
          step === "kind" && kindCard
            ? groupTitle(kindCard.group!)
            : sel
              ? t.has(`kinds.${sel.key}`) ? t(`kinds.${sel.key}`) : sel.title
              : ""
        }
      >
        {/* The two steps are separate children rather than one element whose
            class changes, so React really unmounts one and mounts the other
            and the swap animation (.uastep) plays instead of being skipped
            on a reused DOM node. */}
        {step === "kind" && kindCard ? (
          <div className="uakind uastep">
            {about(kindCard.group!.key) ? <p className="uakind__lead">{about(kindCard.group!.key)}</p> : null}
            <div className="uakind__grid">
              {kindCard.items.map((x) => {
                const XIcon = ICONS[x.key] ?? IconScale;
                return (
                  <button
                    key={x.key}
                    type="button"
                    className="uakind__c"
                    onClick={() => openForm(x)}
                  >
                    <span className="uakind__i"><XIcon /></span>
                    <b>{t.has(`kinds.${x.key}`) ? t(`kinds.${x.key}`) : x.title}</b>
                    {about(x.key) ? <span>{about(x.key)}</span> : null}
                    <span className="uakind__f">
                      {x.immediateCall ? <em className="uakind__now"><IconBolt />{t("immediate")}</em> : null}
                      {x.requiresPriorPurchase ? <em className="uakind__lock"><IconLock />{t("priorPurchaseShort")}</em> : null}
                    </span>
                    <em className="uakind__go" aria-hidden><IconArrowRight /></em>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === "form" && sel ? (
          <div className="uaform uastep">
            {/* Everything the client answers scrolls; the price and the send
                do not — see .uaform__foot below. */}
            <div className="cform uaform__body">
              {/* Back to the kinds, and only for a service that came from a
                  grouped card: for the others there is nothing behind this
                  step and the button would be a lie. */}
              {groupOf(sel) ? (
                <button
                  type="button"
                  className="rf__link uaform__back"
                  onClick={() => { setKindPick(groupOf(sel)!.key); setStep("kind"); }}
                >
                  {/* t.has guards the one string this workpackage asks for:
                      the label reads better than the generic one, but the
                      dialog must not break on a locale that has not been
                      given it yet, and portal.common.back is the same idea in
                      fewer words. */}
                  <IconChevronLeft />{t.has("backToKinds") ? t("backToKinds") : tcm("back")}
                </button>
              ) : null}

              <p className="uaform__lead">{t("formLead")}</p>

              {channels.length > 1 ? (
                <div>
                  <label>{t("channel")}</label>
                  <div className="segs segs--sm" role="tablist" aria-label={t("channel")}>
                    {channels.map((c) => (
                      <button key={c} type="button" role="tab" className="seg" aria-selected={channel === c} onClick={() => setChannelPref(c)}>
                        {c === "video" ? <IconVideo /> : <IconChat />}
                        {c === "video" ? t("chVideo") : t("chChat")}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* A grouped service is one box on the grid; which of its kinds
                  it means was answered on step one, and this row is how the
                  client changes that answer without going back for it. */}
              {groupOf(sel) ? (
                <div>
                  <label>{t.has(`groupKind.${groupOf(sel)!.key}`) ? t(`groupKind.${groupOf(sel)!.key}`) : t("opinionKind")}</label>
                  <div className="segs segs--sm" role="tablist" aria-label={t.has(`groupKind.${groupOf(sel)!.key}`) ? t(`groupKind.${groupOf(sel)!.key}`) : t("opinionKind")}>
                    {groupOf(sel)!.items.map((k) => {
                      const m = services.find((x) => x.key === k);
                      if (!m) return null;
                      const MIcon = ICONS[k] ?? IconScale;
                      return (
                        <button key={k} type="button" role="tab" className="seg" aria-selected={sel.key === k} onClick={() => choose(m)}>
                          <MIcon />
                          {t.has(`kinds.${k}`) ? t(`kinds.${k}`) : m.title}
                          {/* Only one of the two needs a previous LexGo service;
                              saying which, here, beats a 402 after the form. */}
                          {m.requiresPriorPurchase ? <IconLock className="seg__lock" /> : null}
                        </button>
                      );
                    })}
                  </div>
                  {/* What the chosen kind actually changes — the price is not
                      the difference that matters. */}
                  {about(sel.key) ? <p className="ua__kindnote">{about(sel.key)}</p> : null}
                </div>
              ) : null}

              {isGroup ? (
                <div>
                  <label htmlFor="ua-n">{t("lawyerCount")}</label>
                  <div className="ua__count">
                    <button type="button" className="btn btn--line btn--sm" onClick={() => setLawyers((n) => Math.max(sel.lawyerCountMin || 2, n - 1))} aria-label={t("less")}>−</button>
                    <b id="ua-n">{lawyers}</b>
                    <button type="button" className="btn btn--line btn--sm" onClick={() => setLawyers((n) => Math.min(sel.lawyerCountMax || 7, n + 1))} aria-label={t("more")}>+</button>
                    <span className="advmuted">{t("lawyerRange", { min: sel.lawyerCountMin || 2, max: sel.lawyerCountMax || 7 })}</span>
                  </div>
                </div>
              ) : null}

              {/* Said before the form is filled, not after the backend has
                  refused it — the 402 gate is the fallback, not the warning.
                  Straight off the catalog's own flag, so a service the backend
                  opens up stops warning the moment it does. */}
              {sel.requiresPriorPurchase ? (
                <p className="ua__pre"><IconLock />{t("priorPurchaseNote")}</p>
              ) : null}

              <div>
                <label id="ua-dirs-l">{t("directions")}</label>
                {/* A multi-select of buttons is neither an input nor a
                    checkbox, so the house pattern's aria-invalid goes on the
                    GROUP and the whole group is what turns red — marking one
                    arbitrary chip would read as "this chip is wrong". It is
                    focusable at tabIndex -1 only so a failed press can bring
                    it back into view inside the scrolling body; it stays out
                    of the tab order, where the seven chips already are. */}
                <div
                  id="ua-dirs"
                  role="group"
                  tabIndex={-1}
                  aria-labelledby="ua-dirs-l"
                  aria-invalid={miss === "dirs" || undefined}
                  aria-describedby={miss === "dirs" ? "ua-dirs-bad" : undefined}
                  className={`chiprow uaform__chips${miss === "dirs" ? " is-bad" : ""}`}
                >
                  {DIRECTIONS.map((d) => (
                    <button key={d.slug} type="button" className="fchip" aria-pressed={dirs.includes(d.slug)} onClick={() => toggleDir(d.slug)}>
                      {te.has(`areas.${d.area}`) ? te(`areas.${d.area}`) : d.slug}
                    </button>
                  ))}
                </div>
                {miss === "dirs" ? (
                  <p className="cform__bad" id="ua-dirs-bad" role="alert"><IconAlert />{t("missDirection")}</p>
                ) : (
                  <span className="rf__hint">{t("directionsHint")}</span>
                )}
              </div>

              <div>
                <label htmlFor="ua-need">{t("need")}</label>
                <textarea
                  id="ua-need"
                  rows={4}
                  value={need}
                  // Cleared when the value SATISFIES the rule rather than on
                  // the first keystroke: the sentence says "at least 10
                  // characters", and dropping the warning after one letter
                  // only to fail the same press again is worse than letting it
                  // stand until the field is actually fixed.
                  onChange={(e) => {
                    setNeed(e.target.value);
                    if (e.target.value.trim().length >= 10) setMiss((m) => (m === "need" ? "" : m));
                  }}
                  placeholder={t("needPh")}
                  aria-invalid={miss === "need" || undefined}
                  aria-describedby={miss === "need" ? "ua-need-bad" : undefined}
                  className={miss === "need" ? "is-bad" : undefined}
                />
                {miss === "need" ? (
                  <p className="cform__bad" id="ua-need-bad" role="alert"><IconAlert />{t("missNeed", { n: 10 })}</p>
                ) : (
                  <span className="rf__hint">{t("needHint")}</span>
                )}
              </div>

              {/* Everything about the order that is read once and then
                  remembered. The one number that must survive every scroll —
                  the total — is not here; it is in the pinned footer. */}
              <div className="ua__sum">
                {minutes ? (
                  <div className="ua__sumrow ua__sumrow--sub">
                    <span><IconClock />{t("meetingLen")}</span>
                    <span>{t("minutesN", { n: minutes })}</span>
                  </div>
                ) : null}
                {isGroup ? (
                  <div className="ua__sumrow ua__sumrow--sub">
                    <span><IconUsers />{t("perLawyerNote")}</span>
                    <span>{fmtUzs(urgentPrice(sel, channel, 1))} × {lawyers}</span>
                  </div>
                ) : null}
                <p className="ua__next"><IconCheck />{isGroup ? t("nextGroup") : t("next")}</p>
                {/* express / YTX go to the on-duty advocate rather than the
                    ordinary pool, which is the whole reason to pay more. Read
                    off the catalog's own immediate_call flag instead of the two
                    service keys it used to name: the live catalog sets it on
                    express AND on traffic_accident_consultation (GET
                    /urgent-advokat/catalog, 2026-09-29), which is exactly what
                    the express MD's L36 says, and a third immediate kind the
                    backend adds would have kept the pool wording. */}
                {sel.immediateCall ? (
                  <>
                    <p className="ua__next"><IconBolt />{t("onDuty")}</p>
                    {/* LEXGO_EXPRESS_…md L160-162: "Bu xizmat nomi frontendda
                        hali ham `Express videokonsultatsiya` bo'lishi mumkin,
                        lekin backend real ulanishni audio call sifatida
                        ochadi." The client is paying for something called a
                        video consultation and will be put into an audio room —
                        said here, before the button, rather than discovered
                        when the camera never turns on. Verified on the live
                        record LGT-20260928-224E46AF, whose payload carries
                        call_channel "audio" for an express order. */}
                    <p className="ua__next ua__next--audio"><IconPhone />{t("audioNote")}</p>
                  </>
                ) : null}
                {sel.supportsFiles || sel.supportsVoice ? <p className="ua__next ua__next--muted"><IconChat />{t("filesInChat")}</p> : null}
              </div>

              {/* A failed POST belongs in the dialog the client is standing
                  in, beside the form that produced it. */}
              {formErr ? <Notice ok={false} msg={formErr} /> : null}
            </div>

            {/* Pinned, because at 400×860 the filled fields measured 787.8px
                inside a dialog the viewport caps at 774px: the total and the
                send would otherwise scroll out of sight exactly while the
                client is deciding whether to press. The button's only
                `disabled` is the POST being out — a missing field is answered
                by submit(), not by a control that cannot be pressed. */}
            <div className="uaform__foot">
              <div className="uaform__price">
                <span>{t("total")}</span>
                <b>{fmtUzs(price)} {te("currency")}</b>
              </div>
              <button
                type="button"
                className="btn btn--grad btn--lg uaform__send"
                disabled={busy}
                aria-busy={busy || undefined}
                onClick={() => void submit()}
              >
                {busy ? <WaitClock /> : null}
                {busy ? t("sending") : t("submit")}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* The detail, as a modal rather than an accordion inside the list. */}
      <Modal
        open={!!openReq}
        onClose={() => setOpenId("")}
        title={openReq ? (t.has(`kinds.${openReq.serviceKind}`) ? t(`kinds.${openReq.serviceKind}`) : openReq.serviceTitle || openReq.serviceKind) : ""}
        wide
      >
        {openReq ? (
          <MyRequestDetail
            key={openReq.id}
            id={`uad-${openReq.id}`}
            req={openReq}
            onCancelled={() => { setOpenId(""); setReload((k) => k + 1); }}
          />
        ) : null}
      </Modal>

      <SecondOpinionGate
        message={gate}
        onClose={() => setGate("")}
        onPick={(key) => {
          setGate("");
          const s = services.find((x) => x.key === key);
          // Back into the dialog, not merely "selected": the gate closed the
          // order dialog to get out of its own way, and the client's need
          // text and directions are still in state, so the form they were
          // refused reopens filled in on the service that is actually open
          // to them.
          if (s) openForm(s);
        }}
        // Offered only while the backend really does leave it open.
        hasSingle={services.some((s) => s.key === "second_opinion_single" && !s.requiresPriorPurchase)}
        hasVideo={services.some((s) => s.key === "video_consultation")}
        hasChat={services.some((s) => s.key === "chat_consultation")}
      />
    </div>
  );
}

// ── One of the client's own requests, opened out ───────────────────
// There is no GET /urgent-advokat/requests/{id} — the list already returns the
// full record — so the detail is rendered straight off the row rather than
// fetched again.
function MyRequestDetail({ id, req, onCancelled }: { id: string; req: UrgentRequest; onCancelled: () => void }) {
  const t = useTranslations("portal.client.urgent");
  const tcm = useTranslations("portal.common");
  // Shared with the document rating window, which is why the five words for
  // one..five stars live in their own namespace instead of once per widget.
  const tr = useTranslations("portal.client.rate");
  const tcb = useTranslations("common");
  const locale = useLocale();
  // WHICH request is out, not merely that one is. The rating window and the
  // cancel confirmation can both be on screen at once (a completed request
  // inside its 15-minute rating window still offers cancel while the backend
  // lists it in nextStatuses), and they shared a single boolean: sending a
  // rating put the cancel button into its "Bekor qilinmoqda…" face, and
  // confirming a cancel put the rating button into "Yuborilmoqda…". Harmless
  // while it was only a word; a clock on a control that is doing nothing is
  // exactly the lie this workpackage is told not to tell. Both still lock
  // together — two POSTs about one request must not race — but only the one
  // actually in flight wears the wait.
  const [busy, setBusy] = useState<"" | "rate" | "cancel">("");
  const [err, setErr] = useState("");
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  // The 15-minute rating window the backend opens on completion.
  const [stars, setStars] = useState(0);
  // The star the pointer or the keyboard is on, 0 for none — a preview of what
  // a click would give. Only `stars` is ever sent.
  const [rHover, setRHover] = useState(0);
  const [rComment, setRComment] = useState("");
  // §4 of the 2026-09-29 MD: one or two stars opens a quality complaint on
  // the backend, and the rating body carries its text. Asked for beside the
  // stars, while the work is still on screen.
  const [rComplaint, setRComplaint] = useState("");
  const [rQc, setRQc] = useState<QualityComplaint | null>(null);
  const [rDone, setRDone] = useState(false);
  // The window having shut is NOT the same answer as a rating having been
  // given, and both used to set rDone: a client who missed the fifteen
  // minutes was thanked for a rating they never left. Its own flag now, so
  // the 409 the backend answers ("Muddati o'tsa 409", FULL_DOCS §39) shows
  // the closed card below instead.
  const [rClosed, setRClosed] = useState(false);
  const [rErr, setRErr] = useState("");
  // Ticks the countdown, from a timer callback — never from an effect body.
  const [now, setNow] = useState(() => Date.now());

  const canCancel = req.nextStatuses.includes("cancelled");
  // FULL_DOCS §39 (L1361-1385) and the §51 checklist line "Rating timer 15
  // minut chiqadi / 15 minutdan keyin rating yopiladi": the urgent card had
  // stars and no clock, so the window expired in silence and the send then
  // failed with a 409 the client could not have predicted. The deadline is
  // the backend's own `rating.deadline_at` — verified live on
  // LGT-20260928-EBA06E95, which answers
  // {available: true, deadline_at: "2026-09-28T09:06:14.742794+00:00"} —
  // and the remaining time is computed from it rather than counted down from
  // fifteen, so a modal left open overnight cannot offer a window that shut
  // hours ago. This is the same contract DocRatingBox already honours for
  // documents.
  const deadline = req.rating.deadlineAt ? Date.parse(req.rating.deadlineAt) : NaN;
  const timed = !Number.isNaN(deadline);
  const left = timed ? deadline - now : Infinity;
  const canRate = !rDone && !rClosed && ratingOpen(req.rating) && left > 0;
  // The window was open and ran out under the client's eyes, or the backend
  // refused a late send. Either way there is something to say — a card that
  // simply vanished looked like a bug.
  const rShut = rClosed || (!rDone && !req.rating.submitted && req.rating.available && timed && left <= 0);

  // One interval for the whole window; the dependency is `timed`, not `left`,
  // so the timer is not torn down and rebuilt on every tick.
  useEffect(() => {
    if (!timed) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [timed]);
  // What the star row should look like right now: the hovered star while the
  // pointer is on it, otherwise the one that was picked.
  const rShown = rHover || stars;

  async function rate() {
    if (!stars || busy) return;
    setBusy("rate");
    setRErr("");
    try {
      setRQc(await rateUrgentRequest(req.id, stars, rComment.trim(), rComplaint));
      setRDone(true);
    } catch (e) {
      // Already rated, or the window has closed — both are 409 and both are
      // an answer, not a failure. They are not the SAME answer, though, and
      // `rating.submitted` is what tells them apart: without a rating on the
      // record the 409 can only mean the fifteen minutes are up.
      if (isRatingClosed(e)) { if (req.rating.submitted) setRDone(true); else setRClosed(true); return; }
      logApiError("urgent rating", e);
      setRErr(contactBlockedOf(e) ? tcb("contactBlocked") : errDetail(e) || t("rateError"));
    } finally {
      setBusy("");
    }
  }

  async function cancel() {
    if (busy) return;
    setBusy("cancel");
    setErr("");
    try {
      await cancelUrgentRequest(req.id, reason.trim() || t("cancelDefaultReason"));
      onCancelled();
    } catch (e) {
      logApiError("urgent cancel", e);
      setErr(errDetail(e) || t("cancelError"));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="uamore" id={id}>
      {/* The rating window, while it is open. It closes 15 minutes after the
          work is completed, so this block simply stops rendering. */}
      {canRate ? (
        <div className="uamore__block urate">
          {/* The clock sits on the title row, where the document rating window
              already puts it (.drate__left), so a client who has rated a
              finished document meets the same widget here. aria-live is
              "off": a value that changes once a second would be read out once
              a second, and the minutes remaining are not news on every tick —
              the deadline is also spelled out in words underneath. */}
          <div className="urate__h">
            <b><RateStar />{t("rateTitle")}</b>
            {timed ? (
              <span className="urate__left" aria-live="off"><IconClock />{t("rateLeft", { time: ratingClock(left) })}</span>
            ) : null}
          </div>
          <span className="advmuted">{t("rateLead")}</span>
          {/* Two classes for two questions. `on` means "draw this one gold"
              and follows the preview, so the row fills and empties as the
              pointer crosses it; `set` means "this is the rating that will be
              sent" and only changes on a click, which is what keeps the pop
              animation to the one moment a rating is actually given.

              The preview is state rather than the CSS-only row-reverse
              sibling trick it is modelled on: that trick needs the stars in
              DOM order 5..1, which would hand Tab and a screen reader the row
              backwards. Real buttons in reading order are worth one useState. */}
          <div
            className="urate__stars"
            role="radiogroup"
            aria-label={t("rateTitle")}
            onPointerLeave={() => setRHover(0)}
            onBlur={() => setRHover(0)}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars === n}
                aria-label={t("rateN", { n })}
                className={`urate__star${n <= rShown ? " on" : ""}${n <= stars ? " set" : ""}`}
                onClick={() => setStars(n)}
                onPointerEnter={() => setRHover(n)}
                onFocus={() => setRHover(n)}
              >
                <RateStar />
              </button>
            ))}
          </div>
          {/* The word for the star under the pointer. aria-hidden: every
              button already announces "{n} yulduz", so this is for the eye. */}
          <p className="urate__word" aria-hidden="true">{rShown ? tr(`w${rShown}`) : ""}</p>
          <input
            type="text"
            value={rComment}
            onChange={(e) => setRComment(e.target.value)}
            placeholder={t("rateCommentPh")}
            aria-label={t("rateCommentPh")}
          />
          {/* One or two stars means a quality complaint is opened by this
              send; the form says so and asks what to put in it. It never
              gates the send. */}
          {opensComplaint(stars) ? (
            <div className="drate__low">
              <b><IconAlert />{tr("lowTitle")}</b>
              <textarea
                className="drate__lowt"
                rows={2}
                value={rComplaint}
                onChange={(e) => setRComplaint(e.target.value)}
                placeholder={tr("lowPh")}
                aria-label={tr("lowTitle")}
                maxLength={2000}
              />
              <small>{tr("lowHint")}</small>
            </div>
          ) : null}
          {rErr ? <Notice ok={false} msg={rErr} /> : null}
          <button type="button" className="btn btn--grad btn--sm" disabled={!stars || !!busy} aria-busy={busy === "rate" || undefined} onClick={() => void rate()}>
            {busy === "rate" ? <WaitClock /> : null}
            {busy === "rate" ? t("sending") : t("rateSubmit")}
          </button>
        </div>
      ) : rQc ? (
        // The send opened a quality complaint. That, and not the thank-you,
        // is what a client who just gave one star is waiting to be told.
        <div className="uamore__block uamore__block--warn" role="status">
          <b><IconAlert />{tr("complaintSent")}</b>
          {rQc.workId ? <span className="advmuted">{rQc.workId}</span> : null}
          <Link href="/portal/client/complaints" className="uamore__qclink">
            {tr("complaintOpen")}
            <IconArrowRight />
          </Link>
        </div>
      ) : rDone || req.rating.submitted ? (
        <div className="uamore__block uamore__block--ok">
          <b><RateStar />{t("rateThanks")}</b>
          {req.rating.value ? <span className="advmuted">{t("rateGiven", { n: req.rating.value })}</span> : null}
        </div>
      ) : rShut ? (
        // The window ran out. Said plainly, and the stars are gone: leaving
        // them on screen invites a send the backend will only answer 409 to.
        <div className="uamore__block uamore__block--warn urate__shut">
          <b><IconClock />{t("rateClosedTitle")}</b>
          <span className="advmuted">{t("rateClosedText")}</span>
        </div>
      ) : null}

      {req.resultSummary ? (
        <div className="uamore__block uamore__block--ok">
          <b><IconCheck />{t("resultTitle")}</b>
          <p>{req.resultSummary}</p>
          {req.nextAction ? <span className="advmuted">{t("nextAction")}: {req.nextAction}</span> : null}
        </div>
      ) : null}
      {req.cancelReason ? (
        <div className="uamore__block uamore__block--warn">
          <b><IconClose />{t("cancelledTitle")}</b>
          <p>{req.cancelReason}</p>
        </div>
      ) : null}
      {req.files.length || req.voiceMessages.length ? (
        <div className="uamore__block">
          <b><IconFileText />{t("attachments")}</b>
          <ul className="uamore__files">
            {req.files.map((f, i) => (
              <li key={`f${i}`}>{f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer">{f.name}</a> : f.name}</li>
            ))}
            {req.voiceMessages.map((v, i) => (
              <li key={`v${i}`}>{v.url ? <audio src={v.url} controls preload="none" /> : v.name}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {req.statusHistory.length ? (
        <div className="uamore__block">
          <b><IconClock />{t("history")}</b>
          <ol className="uamore__hist">
            {req.statusHistory.map((h, i) => (
              <li key={i}>
                <span>{statusLabel(tcm, h.to)}</span>
                <em>{h.at ? dateTimeFull(h.at, locale) : ""}</em>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {err ? <Notice ok={false} msg={err} /> : null}
      {canCancel ? (
        asking ? (
          <div className="uamore__cancel">
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("cancelReasonPh")}
              aria-label={t("cancelReasonPh")}
            />
            <button type="button" className="btn btn--soft btn--sm" onClick={() => setAsking(false)}>{t("keepIt")}</button>
            <button type="button" className="btn btn--danger btn--sm" disabled={!!busy} aria-busy={busy === "cancel" || undefined} onClick={() => void cancel()}>
              {busy === "cancel" ? <WaitClock /> : null}
              {busy === "cancel" ? t("cancelling") : t("cancelConfirm")}
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn--line btn--sm" onClick={() => setAsking(true)}>
            <IconClose />{t("cancelRequest")}
          </button>
        )
      ) : null}
    </div>
  );
}

// ── The second-opinion gate ────────────────────────────────────────
// The 402 `previous_lexgo_advokat_service_required` refusal, as the modal it
// asks for. Since 2026-09-28 the rule applies to the advocate PANEL only —
// a single advocate's second opinion is open to everyone — so the first way
// out offered here is that same opinion, taken alone. It is the nearest thing
// to what the client was trying to buy, and it needs nothing of them.
function SecondOpinionGate({
  message,
  onClose,
  onPick,
  hasSingle,
  hasVideo,
  hasChat,
}: {
  message: string;
  onClose: () => void;
  onPick: (serviceKey: string) => void;
  hasSingle: boolean;
  hasVideo: boolean;
  hasChat: boolean;
}) {
  const t = useTranslations("portal.client.urgent");
  return (
    <Modal open={!!message} onClose={onClose} title={t("priorPurchaseTitle")}>
      <div className="uagate">
        <span className="uagate__i" aria-hidden><IconLock /></span>
        {/* The backend's own sentence first when it sent one; the recommended
            wording from the MD otherwise. */}
        <p className="uagate__lead">{message || t("priorPurchase")}</p>
        <p className="uagate__hint">{t("priorPurchaseHow")}</p>
        <div className="uagate__cta">
          {hasSingle ? (
            <button type="button" className="btn btn--grad btn--full" onClick={() => onPick("second_opinion_single")}>
              <IconScale />{t("ctaSingleOpinion")}
            </button>
          ) : null}
          {hasVideo ? (
            <button type="button" className={`btn btn--full ${hasSingle ? "btn--line" : "btn--grad"}`} onClick={() => onPick("video_consultation")}>
              <IconVideo />{t("ctaConsult")}
            </button>
          ) : null}
          {hasChat ? (
            <button type="button" className="btn btn--line btn--full" onClick={() => onPick("chat_consultation")}>
              <IconChat />{t("ctaChat")}
            </button>
          ) : null}
          <Link href="/portal/client/documents" className="btn btn--line btn--full" onClick={onClose}>
            <IconFileText />{t("ctaDocument")}
          </Link>
          <Link href="/portal/client/services" className="btn btn--soft btn--full" onClick={onClose}>
            <IconArrowRight />{t("browseServices")}
          </Link>
        </div>
      </div>
    </Modal>
  );
}
