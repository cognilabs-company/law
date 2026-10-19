"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  cancelUrgentRequest,
  createUrgentRequest,
  getUrgentCatalog,
  isMissingRoute,
  isPriorPurchaseRequired,
  isRatingClosed,
  isUrgentEvent,
  listMyUrgentRequests,
  opensComplaint,
  rateUrgentRequest,
  ratingOpen,
  urgentChannels,
  urgentMinutes,
  urgentPrice,
  type QualityComplaint,
  type UrgentCatalog,
  type UrgentCreated,
  type UrgentGroup,
  type UrgentRequest,
  type UrgentService,
} from "@/lib/services/backend";
import { onUserSocketResync, subscribeUserEvents } from "@/lib/userSocket";
import { errDetail, logApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { dateTimeFull } from "@/lib/date";
import { statusLabel } from "@/lib/labels";
import { profileTabHref } from "@/lib/profileTabs";
import CallRoom from "@/components/chat/CallRoom";
import {
  IconAlert,
  IconArrowRight,
  IconBolt,
  IconChat,
  IconCheck,
  IconChevronLeft,
  IconClock,
  IconClose,
  IconExpressCall,
  IconFileText,
  IconHeadset,
  IconLayers,
  IconLock,
  IconOpinionPanel,
  IconPhone,
  IconScale,
  IconSecondOpinion,
  IconTrafficCase,
  IconChatConsult,
  IconUsers,
  IconVideo,
  IconVideoConsult,
} from "@/components/icons";
import { App, Banner, Btn, Dialog, Empty, Field, Input, Loading, Seg, Sidebar, Table, Tag, TextArea, Toolbar, useOs, useToast, type Col, type NavSection } from "../../kit/kit";
import type { NativeProps } from "../../native";
import DeskCall from "../call/DeskCall";
import DocOrderDialog from "./DocOrder";
import { StarPicker, toneOf } from "./bits";
import "./client.css";

// Quick advocate as a desktop program — the services on one side (video,
// chat, the road-accident line, a second opinion, a document), the
// client's requests on the other, like a Mac app with a source list / a
// Windows app with a navigation pane. A service opens the order sheet:
// which kind, how to talk, the areas of law, what happened, and the price;
// an express or road-accident order rings the advocate on duty at once and
// opens the call here. A request opens on the right with its result, its
// rating (while the window for it is open), its history and its cancel.
// The rules are the web module's (UrgentAdvocatePanel).

const ICONS: Record<string, typeof IconVideo> = {
  video_consultation: IconVideoConsult,
  express_video_consultation: IconExpressCall,
  traffic_accident_consultation: IconTrafficCase,
  chat_consultation: IconChatConsult,
  second_opinion_single: IconSecondOpinion,
  second_opinion_group: IconOpinionPanel,
};
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
const VIDEO_GROUP = "video_consultation_kind";
const VIDEO_ITEMS = ["video_consultation", "express_video_consultation"];
const CARD_ORDER = ["video_consultation", "chat_consultation", "traffic_accident_consultation"];
const URGENT_ASSIST_EVENT = "support.assist_urgent_advokat_request_created";

type LiveCall = { call: NonNullable<UrgentCreated["call"]>; workId: string; serviceKind: string; lawyer: string };
type Card = { key: string; group?: UrgentGroup; items: UrgentService[] };
type View = "services" | "mine";

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function QuickApp({ route, onRoute, openLink, tell, pip }: NativeProps) {
  const t = useTranslations("portal.client.urgent");
  const tc = useTranslations("portal.common");
  const tw = useTranslations("portal.client.works");
  const d = useTranslations("portal.desk.client");
  const locale = useLocale();
  const os = useOs();
  const [cat, setCat] = useState<UrgentCatalog | null>(null);
  const [catState, setCatState] = useState<"loading" | "ready" | "error">("loading");
  const [catKey, setCatKey] = useState(0);
  const [mine, setMine] = useState<UrgentRequest[] | null>(null);
  const [reload, setReload] = useState(0);
  const [view, setView] = useState<View>("services");
  const [sel, setSel] = useState("");
  const [fresh, setFresh] = useState("");
  // The order sheet: a grouped card's kinds first, then the form.
  const [kindPick, setKindPick] = useState("");
  const [pick, setPick] = useState("");
  const [step, setStep] = useState<"" | "kind" | "form">("");
  const [docsOpen, setDocsOpen] = useState(false);
  const [gate, setGate] = useState("");
  const [live, setLive] = useState<LiveCall | null>(null);
  const [toast, say] = useToast();

  useEffect(() => {
    let alive = true;
    getUrgentCatalog()
      .then((c) => alive && (setCat(c), setCatState("ready")))
      .catch((e) => {
        if (!alive) return;
        logApiError("urgent catalog", e);
        setCatState("error");
      });
    return () => {
      alive = false;
    };
  }, [catKey]);
  useEffect(() => {
    let alive = true;
    listMyUrgentRequests()
      .then((r) => alive && setMine(r))
      .catch((e) => {
        if (!alive) return;
        logApiError("urgent requests", e);
        setMine(isMissingRoute(e) ? [] : (cur) => cur ?? []);
      });
    return () => {
      alive = false;
    };
  }, [reload]);
  // A link naming a service (?service=, from Home or a notification) opens
  // its order, also when the window is already open; then the window's
  // address drops it.
  useEffect(() => {
    if (!route.includes("?")) return;
    const want = new URLSearchParams(route.split("?")[1]).get("service");
    const h = setTimeout(() => {
      if (want) {
        setView("services");
        setPick(want);
        setStep("form");
      }
      onRoute(route.split("?")[0]);
    }, 0);
    return () => clearTimeout(h);
  }, [route, onRoute]);
  // Claimed, scheduled, met, completed, cancelled: the list follows.
  const refetch = useCallback(() => setReload((k) => k + 1), []);
  const again = useRef(refetch);
  useEffect(() => {
    again.current = refetch;
  }, [refetch]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = subscribeUserEvents((e) => {
      if (e.event !== URGENT_ASSIST_EVENT && !isUrgentEvent(e.event)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => again.current(), 300);
    });
    const offSync = onUserSocketResync(() => again.current());
    return () => {
      if (timer) clearTimeout(timer);
      off();
      offSync();
    };
  }, []);
  // A call open here is the desktop's call too.
  useEffect(() => {
    if (!live) return;
    tell({ type: "lexgo-desk:call", on: true, video: live.call.callType === "video" });
    return () => tell({ type: "lexgo-desk:call", on: false, video: false });
  }, [live, tell]);

  const services = useMemo(() => cat?.services ?? [], [cat]);
  const cards = useMemo<Card[]>(() => {
    const backend = cat?.groups ?? [];
    const haveBoth = VIDEO_ITEMS.every((k) => services.some((x) => x.key === k));
    const claimed = new Set(backend.flatMap((g) => g.items));
    const groups: UrgentGroup[] = haveBoth && !VIDEO_ITEMS.some((k) => claimed.has(k)) ? [...backend, { key: VIDEO_GROUP, title: "", items: VIDEO_ITEMS }] : backend;
    const owner = new Map<string, UrgentGroup>();
    for (const g of groups) for (const k of g.items) owner.set(k, g);
    const out: Card[] = [];
    const placed = new Set<string>();
    for (const s of services) {
      const g = owner.get(s.key);
      if (!g) {
        out.push({ key: s.key, items: [s] });
        continue;
      }
      if (placed.has(g.key)) continue;
      placed.add(g.key);
      out.push({ key: g.key, group: g, items: services.filter((x) => g.items.includes(x.key)) });
    }
    const rank = (items: UrgentService[]) => items.reduce((best, x) => (CARD_ORDER.indexOf(x.key) >= 0 && CARD_ORDER.indexOf(x.key) < best ? CARD_ORDER.indexOf(x.key) : best), CARD_ORDER.length);
    return out.sort((a, b) => rank(a.items) - rank(b.items));
  }, [services, cat]);
  const groupTitle = (g: UrgentGroup) => (g.title ? g.title : t.has(`groups.${g.key}`) ? t(`groups.${g.key}`) : g.key);
  const kindName = (k: string, title = "") => (t.has(`kinds.${k}`) ? t(`kinds.${k}`) : title || k);
  const about = (k: string) => (t.has(`about.${k}`) ? t(`about.${k}`) : "");
  const svc = services.find((s) => s.key === pick);
  const kindCard = cards.find((c) => c.key === kindPick && c.group);
  const openCard = (c: Card) => {
    if (c.group) {
      setKindPick(c.key);
      setStep("kind");
    } else {
      setPick(c.items[0].key);
      setStep("form");
    }
  };
  const cur = mine?.find((r) => r.id === sel) ?? null;

  // An express or road-accident order is a call: the window becomes it.
  if (live)
    return (
      <div className={`dx dx--${os} dx-app--cquick dxk-incall${pip ? " is-pip" : ""}`} data-os={os}>
        <div className="dxk-call">
          <CallRoom
            roomId={live.call.roomId}
            callId={live.call.id}
            callType={live.call.callType === "video" ? "video" : "audio"}
            isCaller
            lk={{ url: live.call.livekitUrl, token: live.call.livekitToken, room: live.call.livekitRoom, hints: live.call.hints, quality: live.call.quality }}
            title={[kindName(live.serviceKind), live.lawyer, live.workId].filter(Boolean).join(" · ") || undefined}
            skin={DeskCall}
            onEnd={() => (setLive(null), setReload((k) => k + 1))}
          />
        </div>
      </div>
    );

  const sections: NavSection[] = [
    {
      id: "q",
      title: os === "mac" ? t("title") : undefined,
      items: [
        { id: "services", label: cat?.title || t("title"), icon: <IconBolt /> },
        { id: "mine", label: t("mine"), icon: <IconClock />, count: mine?.length || undefined },
      ],
    },
  ];

  const cols: Col<UrgentRequest>[] = [
    {
      id: "kind",
      label: t("mine"),
      cell: (r) => {
        const RowIcon = ICONS[r.serviceKind] ?? IconScale;
        return (
          <span className="dxcw-name">
            <span className={`dxcw-ic is-${toneOf(r.status)}`} aria-hidden>
              <RowIcon />
            </span>
            <span>
              <b>
                {kindName(r.serviceKind, r.serviceTitle)}
                {r.viaOperator ? <IconHeadset className="dxcu-op" aria-label={t("byOperator")} /> : null}
              </b>
              <small>
                {r.workId ? <code>{r.workId}</code> : null}
                <span>{r.need}</span>
              </small>
            </span>
          </span>
        );
      },
    },
    { id: "when", label: d("created"), width: "minmax(110px,150px)", cell: (r) => <span className="dxcs-lead">{r.createdAt ? dateTimeFull(r.createdAt, locale) : "—"}</span> },
    {
      id: "status",
      label: tw("fStatus"),
      width: "minmax(100px,auto)",
      cell: (r) => (
        <span className="dxcw-tags">
          <Tag tone={toneOf(r.status)}>{statusLabel(tc, r.status)}</Tag>
          {r.callStatus === "calling" ? <Tag tone="warn">{t.has(`callState.${r.callStatus}`) ? t(`callState.${r.callStatus}`) : r.callStatus}</Tag> : null}
        </span>
      ),
    },
  ];

  return (
    <App
      name="cquick"
      sidebar={<Sidebar label={t("title")} sections={sections} value={view} onChange={(v) => setView(v as View)} />}
      inspector={view === "mine" && cur ? <Detail key={cur.id} req={cur} openLink={openLink} onCancelled={(m) => (setSel(""), setReload((k) => k + 1), say(m))} onError={(m) => say(m, "err")} /> : undefined}
    >
      {view === "services" ? (
        <div className="dxcu dx-scroll">
          <header className="dxcu-hero">
            <span className="dxcu-hero__ic" aria-hidden>
              <IconBolt />
            </span>
            <span className="dxcu-hero__t">
              <h1>{cat?.title || t("title")}</h1>
              <p>{t("lead")}</p>
            </span>
            {cat ? (
              <dl className="dxcu-terms">
                <div>
                  <dt>{t("metaMinutes")}</dt>
                  <dd>{t("minutesN", { n: cat.meetingDefaultMinutes })}</dd>
                </div>
                <div>
                  <dt>{t("metaFree")}</dt>
                  <dd>{t("minutesN", { n: cat.freeExtensionOnceMinutes })}</dd>
                </div>
                <div>
                  <dt>{t("metaPaid")}</dt>
                  <dd>{t("perMinute", { price: fmtUzs(cat.paidExtensionPricePerMinute) })}</dd>
                </div>
              </dl>
            ) : null}
          </header>
          {catState === "loading" ? (
            <Loading label={t("title")} />
          ) : catState === "error" ? (
            <Empty icon={<IconAlert />} title={t("sendError")} action={<Btn onClick={() => (setCatState("loading"), setCatKey((k) => k + 1))}>{d("refresh")}</Btn>} />
          ) : (
            <div className="dxcu-grid">
              {cards.map((c) => {
                const s = c.items[0];
                const Icon = ICONS[s.key] ?? IconScale;
                const name = c.group ? groupTitle(c.group) : kindName(s.key, s.title);
                const chans = urgentChannels(s);
                const mins = urgentMinutes(s, chans[0] || "video");
                const now = c.items.every((x) => x.immediateCall);
                return (
                  <button key={c.key} type="button" className={`dxcu-card is-${c.key}`} onClick={() => openCard(c)} aria-haspopup="dialog">
                    <span className="dxcu-card__ic" aria-hidden>
                      <Icon />
                    </span>
                    <b>{name}</b>
                    {about(c.group ? c.group.key : s.key) ? <small>{about(c.group ? c.group.key : s.key)}</small> : null}
                    <span className="dxcu-card__f">
                      {chans.includes("video") ? (
                        <em>
                          <IconVideo aria-hidden /> {t("chVideo")}
                        </em>
                      ) : null}
                      {chans.includes("chat") ? (
                        <em>
                          <IconChat aria-hidden /> {t("chChat")}
                        </em>
                      ) : null}
                      {mins ? (
                        <em>
                          <IconClock aria-hidden /> {t("minutesN", { n: mins })}
                        </em>
                      ) : null}
                      {c.group ? (
                        <em>
                          <IconLayers aria-hidden /> {t("kindsN", { n: c.items.length })}
                        </em>
                      ) : null}
                      {now ? (
                        <em className="is-now">
                          <IconBolt aria-hidden /> {t("immediate")}
                        </em>
                      ) : null}
                    </span>
                    {s.requiresPriorPurchase && !c.group ? (
                      <span className="dxcu-card__lock">
                        <IconLock aria-hidden /> {t("priorPurchaseShort")}
                      </span>
                    ) : null}
                  </button>
                );
              })}
              <button type="button" className="dxcu-card is-docs" onClick={() => setDocsOpen(true)} aria-haspopup="dialog">
                <span className="dxcu-card__ic" aria-hidden>
                  <IconFileText />
                </span>
                <b>{t("docs.title")}</b>
                <small>{t("docs.lead")}</small>
                <span className="dxcu-card__f">
                  <em>
                    <IconLayers aria-hidden /> {t("kindsN", { n: 2 })}
                  </em>
                </span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <Toolbar title={t("mine")} />
          <div className="dxcw-body">
            {mine === null ? (
              <Loading label={t("mine")} />
            ) : !mine.length ? (
              <Empty icon={<IconBolt />} title={t("mineEmpty")} text={t("mineEmptyText")} action={<Btn kind="primary" onClick={() => setView("services")}>{cat?.title || t("title")}</Btn>} />
            ) : (
              <Table label={t("mine")} cols={cols} rows={mine} rowKey={(r) => r.id} selected={sel || fresh} onSelect={(r) => setSel(r.id)} />
            )}
          </div>
        </>
      )}

      {step === "kind" && kindCard ? (
        <Dialog
          open
          title={groupTitle(kindCard.group!)}
          width={560}
          onClose={() => setStep("")}
          actions={<Btn onClick={() => setStep("")}>{d("cancel")}</Btn>}
        >
          {about(kindCard.group!.key) ? <p className="dx-dlg__text">{about(kindCard.group!.key)}</p> : null}
          <div className="dxcu-flows">
            {kindCard.items.map((x) => {
              const XIcon = ICONS[x.key] ?? IconScale;
              return (
                <button key={x.key} type="button" onClick={() => (setPick(x.key), setStep("form"))}>
                  <XIcon aria-hidden />
                  <b>{kindName(x.key, x.title)}</b>
                  {about(x.key) ? <small>{about(x.key)}</small> : null}
                  <span className="dxcw-tags">
                    {x.immediateCall ? <Tag tone="warn">{t("immediate")}</Tag> : null}
                    {x.requiresPriorPurchase ? <Tag>{t("priorPurchaseShort")}</Tag> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </Dialog>
      ) : null}

      {step === "form" && svc ? (
        <OrderSheet
          key={svc.key}
          svc={svc}
          services={services}
          group={cards.find((c) => c.group && c.items.some((x) => x.key === svc.key))?.group}
          onPick={setPick}
          onBack={(g) => (setKindPick(g), setStep("kind"))}
          onClose={() => setStep("")}
          onGate={(m) => (setStep(""), setGate(m))}
          onCreated={(created, kind) => {
            setStep("");
            setPick("");
            setFresh(created.request.id);
            setReload((k) => k + 1);
            if (created.immediateCall && created.call) {
              setLive({ call: created.call, workId: created.request.workId, serviceKind: kind, lawyer: created.request.assignedLawyerName });
              return;
            }
            setView("mine");
            setSel(created.request.id);
            say(created.immediateCall ? created.message || t("noDutyLawyer") : t("sent"), created.immediateCall ? "warn" : "ok");
          }}
          onError={(m) => say(m, "err")}
        />
      ) : null}

      {gate ? (
        <Dialog
          open
          title={t("priorPurchaseTitle")}
          onClose={() => setGate("")}
          actions={<Btn onClick={() => setGate("")}>{d("close")}</Btn>}
        >
          <Banner tone="warn">{gate}</Banner>
          <p className="dx-dlg__text">{t("priorPurchaseHow")}</p>
          <div className="dxcu-gate">
            {services.some((s) => s.key === "second_opinion_single" && !s.requiresPriorPurchase) ? (
              <Btn kind="primary" icon={<IconScale />} onClick={() => (setGate(""), setPick("second_opinion_single"), setStep("form"))}>
                {t("ctaSingleOpinion")}
              </Btn>
            ) : null}
            {services.some((s) => s.key === "video_consultation") ? (
              <Btn icon={<IconVideo />} onClick={() => (setGate(""), setPick("video_consultation"), setStep("form"))}>
                {t("ctaConsult")}
              </Btn>
            ) : null}
            {services.some((s) => s.key === "chat_consultation") ? (
              <Btn icon={<IconChat />} onClick={() => (setGate(""), setPick("chat_consultation"), setStep("form"))}>
                {t("ctaChat")}
              </Btn>
            ) : null}
            <Btn icon={<IconFileText />} onClick={() => (setGate(""), openLink({ appId: "", route: "/portal/client/documents" }))}>
              {t("ctaDocument")}
            </Btn>
            <Btn kind="plain" icon={<IconArrowRight />} onClick={() => (setGate(""), openLink({ appId: "", route: "/portal/client/services" }))}>
              {t("browseServices")}
            </Btn>
          </div>
        </Dialog>
      ) : null}

      {docsOpen ? <DocOrderDialog onClose={() => setDocsOpen(false)} openLink={openLink} /> : null}

      {toast}
    </App>
  );
}

// The order: kind, channel, panel size, areas of law, what happened, the
// sum; the total and the send stay in the footer.
function OrderSheet({
  svc,
  services,
  group,
  onPick,
  onBack,
  onClose,
  onGate,
  onCreated,
  onError,
}: {
  svc: UrgentService;
  services: UrgentService[];
  group?: UrgentGroup;
  onPick: (key: string) => void;
  onBack: (groupKey: string) => void;
  onClose: () => void;
  onGate: (msg: string) => void;
  onCreated: (c: UrgentCreated, kind: string) => void;
  onError: (msg: string) => void;
}) {
  const t = useTranslations("portal.client.urgent");
  const te = useTranslations("enums");
  const tc = useTranslations("portal.common");
  const d = useTranslations("portal.desk.client");
  const [channelPref, setChannelPref] = useState("video");
  const isGroup = svc.key === GROUP;
  const [lawyers, setLawyers] = useState(() => Math.max(svc.lawyerCountMin || 2, 3));
  const [dirs, setDirs] = useState<string[]>([]);
  const [need, setNeed] = useState("");
  const [miss, setMiss] = useState<"" | "dirs" | "need">("");
  const [busy, setBusy] = useState(false);
  const channels = urgentChannels(svc);
  const channel = channels.includes(channelPref) ? channelPref : channels[0] || "video";
  const price = urgentPrice(svc, channel, isGroup ? lawyers : 1);
  const minutes = urgentMinutes(svc, channel);
  const kindName = (k: string, title = "") => (t.has(`kinds.${k}`) ? t(`kinds.${k}`) : title || k);

  async function submit() {
    if (busy) return;
    if (!dirs.length) return setMiss("dirs");
    if (need.trim().length < 10) return setMiss("need");
    setMiss("");
    setBusy(true);
    try {
      const created = await createUrgentRequest({ serviceKind: svc.key, channel, need: need.trim(), directions: dirs, lawyerCount: isGroup ? lawyers : undefined });
      onCreated(created, svc.key);
    } catch (e) {
      if (isPriorPurchaseRequired(e)) return onGate(errDetail(e) || t("priorPurchase"));
      logApiError("urgent request", e);
      onError(t("sendError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={kindName(svc.key, svc.title)}
      width={600}
      onClose={onClose}
      onSubmit={() => void submit()}
      actions={
        <>
          <span className="dxcu-total">
            <small>{t("total")}</small>
            <b>
              {fmtUzs(price)} {te("currency")}
            </b>
          </span>
          {group ? (
            <Btn icon={<IconChevronLeft />} onClick={() => onBack(group.key)}>
              {t.has("backToKinds") ? t("backToKinds") : tc("back")}
            </Btn>
          ) : (
            <Btn onClick={onClose}>{d("cancel")}</Btn>
          )}
          <Btn kind="primary" type="submit" busy={busy} icon={<IconArrowRight />}>
            {t("submit")}
          </Btn>
        </>
      }
    >
      <p className="dx-dlg__text">{t("formLead")}</p>
      {group ? (
        <Field label={t.has(`groupKind.${group.key}`) ? t(`groupKind.${group.key}`) : t("opinionKind")} hint={about(t, svc.key)}>
          <Seg
            label={t("opinionKind")}
            value={svc.key}
            onChange={onPick}
            items={group.items
              .map((k) => services.find((x) => x.key === k))
              .filter((m): m is UrgentService => !!m)
              .map((m) => {
                const MIcon = ICONS[m.key] ?? IconScale;
                return { id: m.key, label: kindName(m.key, m.title), icon: <MIcon /> };
              })}
          />
        </Field>
      ) : null}
      {channels.length > 1 ? (
        <Field label={t("channel")}>
          <Seg label={t("channel")} value={channel} onChange={setChannelPref} items={channels.map((c) => ({ id: c, label: c === "video" ? t("chVideo") : t("chChat"), icon: c === "video" ? <IconVideo /> : <IconChat /> }))} />
        </Field>
      ) : null}
      {isGroup ? (
        <Field label={t("lawyerCount")} hint={t("lawyerRange", { min: svc.lawyerCountMin || 2, max: svc.lawyerCountMax || 7 })}>
          <span className="dxcu-step">
            <Btn small onClick={() => setLawyers((n) => Math.max(svc.lawyerCountMin || 2, n - 1))} title={t("less")}>
              −
            </Btn>
            <b>{lawyers}</b>
            <Btn small onClick={() => setLawyers((n) => Math.min(svc.lawyerCountMax || 7, n + 1))} title={t("more")}>
              +
            </Btn>
          </span>
        </Field>
      ) : null}
      {svc.requiresPriorPurchase ? (
        <Banner tone="warn">
          {t("priorPurchaseNote")}
        </Banner>
      ) : null}
      <div className="dx-field">
        <span className="dx-field__l">{t("directions")}</span>
        <span className={`dxcp-chips${miss === "dirs" ? " is-bad" : ""}`} role="group" aria-label={t("directions")}>
          {DIRECTIONS.map((d) => (
            <button
              key={d.slug}
              type="button"
              className={dirs.includes(d.slug) ? "is-on" : ""}
              aria-pressed={dirs.includes(d.slug)}
              onClick={() => (setDirs((cur) => (cur.includes(d.slug) ? cur.filter((x) => x !== d.slug) : [...cur, d.slug])), setMiss((m) => (m === "dirs" ? "" : m)))}
            >
              {te.has(`areas.${d.area}`) ? te(`areas.${d.area}`) : d.slug}
            </button>
          ))}
        </span>
        {miss === "dirs" ? <small className="dx-field__e">{t("missDirection")}</small> : <small className="dx-field__h">{t("directionsHint")}</small>}
      </div>
      <Field label={t("need")} error={miss === "need" ? t("missNeed", { n: 10 }) : undefined} hint={miss === "need" ? undefined : t("needHint")}>
        <TextArea value={need} onChange={(v) => (setNeed(v), v.trim().length >= 10 && setMiss((m) => (m === "need" ? "" : m)))} placeholder={t("needPh")} rows={4} />
      </Field>
      <ul className="dxcu-sum">
        {minutes ? (
          <li>
            <IconClock aria-hidden /> {t("meetingLen")}: <b>{t("minutesN", { n: minutes })}</b>
          </li>
        ) : null}
        {isGroup ? (
          <li>
            <IconUsers aria-hidden /> {t("perLawyerNote")}: <b>{`${fmtUzs(urgentPrice(svc, channel, 1))} × ${lawyers}`}</b>
          </li>
        ) : null}
        <li>
          <IconCheck aria-hidden /> {isGroup ? t("nextGroup") : t("next")}
        </li>
        {svc.immediateCall ? (
          <>
            <li>
              <IconBolt aria-hidden /> {t("onDuty")}
            </li>
            <li>
              <IconPhone aria-hidden /> {t("audioNote")}
            </li>
          </>
        ) : null}
        {svc.supportsFiles || svc.supportsVoice ? (
          <li className="is-muted">
            <IconChat aria-hidden /> {t("filesInChat")}
          </li>
        ) : null}
      </ul>
    </Dialog>
  );
}

function about(t: ReturnType<typeof useTranslations>, k: string) {
  return t.has(`about.${k}`) ? t(`about.${k}`) : undefined;
}

// One request: its result, the rating while it is open, attachments,
// history, and the cancel.
function Detail({ req, openLink, onCancelled, onError }: { req: UrgentRequest; openLink: NativeProps["openLink"]; onCancelled: (msg: string) => void; onError: (msg: string) => void }) {
  const t = useTranslations("portal.client.urgent");
  const tc = useTranslations("portal.common");
  const tr = useTranslations("portal.client.rate");
  const d = useTranslations("portal.desk.client");
  const locale = useLocale();
  const [busy, setBusy] = useState<"" | "rate" | "cancel">("");
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [complaint, setComplaint] = useState("");
  const [qc, setQc] = useState<QualityComplaint | null>(null);
  const [done, setDone] = useState(false);
  const [closed, setClosed] = useState(false);
  const deadline = req.rating.deadlineAt ? Date.parse(req.rating.deadlineAt) : NaN;
  const timed = !Number.isNaN(deadline);
  const [left, setLeft] = useState(Infinity);
  useEffect(() => {
    if (!timed) return;
    const tick = () => setLeft(deadline - Date.now());
    const h0 = setTimeout(tick, 0);
    const iv = setInterval(tick, 1000);
    return () => (clearTimeout(h0), clearInterval(iv));
  }, [timed, deadline]);
  const canRate = !done && !closed && ratingOpen(req.rating) && left > 0;
  const shut = closed || (!done && !req.rating.submitted && req.rating.available && timed && left <= 0);
  const canCancel = req.nextStatuses.includes("cancelled");
  const kind = t.has(`kinds.${req.serviceKind}`) ? t(`kinds.${req.serviceKind}`) : req.serviceTitle || req.serviceKind;
  const RowIcon = ICONS[req.serviceKind] ?? IconScale;

  async function rate() {
    if (!stars || busy) return;
    setBusy("rate");
    try {
      setQc(await rateUrgentRequest(req.id, stars, comment.trim(), complaint));
      setDone(true);
    } catch (e) {
      if (isRatingClosed(e)) {
        if (req.rating.submitted) setDone(true);
        else setClosed(true);
        return;
      }
      logApiError("urgent rating", e);
      onError(t("rateError"));
    } finally {
      setBusy("");
    }
  }
  async function cancel() {
    if (busy) return;
    setBusy("cancel");
    try {
      await cancelUrgentRequest(req.id, reason.trim() || t("cancelDefaultReason"));
      onCancelled(t("cancelledTitle"));
    } catch (e) {
      logApiError("urgent cancel", e);
      onError(t("cancelError"));
    } finally {
      setBusy("");
    }
  }

  return (
    <aside className="dxcw-insp" aria-label={kind}>
      <header>
        <span className={`dxcw-ic is-big is-${toneOf(req.status)}`} aria-hidden>
          <RowIcon />
        </span>
        <h2>{kind}</h2>
        <span className="dxcw-tags">
          {req.workId ? <code className="dxcw-code">{req.workId}</code> : null}
          <Tag tone={toneOf(req.status)}>{statusLabel(tc, req.status)}</Tag>
          {req.viaOperator ? (
            <Tag tone="info">
              <IconHeadset aria-hidden /> {t("byOperator")}
            </Tag>
          ) : null}
        </span>
      </header>
      {req.need ? <p>{req.need}</p> : null}
      <dl>
        {req.assignedLawyerName ? (
          <div>
            <dt>{tc("lawyer")}</dt>
            <dd>{req.assignedLawyerName}</dd>
          </div>
        ) : null}
        {req.scheduledAt ? (
          <div>
            <dt>{d("scheduled")}</dt>
            <dd>{dateTimeFull(req.scheduledAt, locale)}</dd>
          </div>
        ) : null}
        {req.groupLawyers.length ? (
          <div>
            <dt>{d("panel")}</dt>
            <dd>{req.groupLawyers.map((g) => g.name).join(", ")}</dd>
          </div>
        ) : null}
        {req.callStatus || req.callChannel ? (
          <div>
            <dt>{d("call")}</dt>
            <dd>{[req.callStatus ? (t.has(`callState.${req.callStatus}`) ? t(`callState.${req.callStatus}`) : req.callStatus) : "", req.callChannel === "audio" ? t("chAudio") : req.callChannel === "video" ? t("chVideo") : req.callChannel].filter(Boolean).join(" · ")}</dd>
          </div>
        ) : null}
      </dl>
      {req.secureChatRoomId ? (
        <Btn kind="primary" icon={<IconChat />} onClick={() => openLink({ appId: "", route: `/portal/chat/${encodeURIComponent(req.secureChatRoomId)}` })}>
          {t("openChat")}
        </Btn>
      ) : null}

      {canRate ? (
        <section className="dxcu-rate">
          <h3>
            {t("rateTitle")}
            {timed ? (
              <span>
                <IconClock aria-hidden /> {t("rateLeft", { time: clock(left) })}
              </span>
            ) : null}
          </h3>
          <small>{t("rateLead")}</small>
          <StarPicker value={stars} onChange={setStars} label={t("rateTitle")} words={(n) => tr(`w${n}`)} />
          <Input value={comment} onChange={setComment} placeholder={t("rateCommentPh")} ariaLabel={t("rateCommentPh")} />
          {opensComplaint(stars) ? (
            <Field label={tr("lowTitle")} hint={tr("lowHint")}>
              <TextArea value={complaint} onChange={setComplaint} placeholder={tr("lowPh")} rows={2} maxLength={2000} />
            </Field>
          ) : null}
          <Btn kind="primary" busy={busy === "rate"} disabled={!stars} onClick={() => void rate()}>
            {t("rateSubmit")}
          </Btn>
        </section>
      ) : qc ? (
        <Banner tone="warn" title={tr("complaintSent")} action={<Btn small onClick={() => openLink({ appId: "", route: profileTabHref("complaints", qc.workId ? { work: qc.workId } : {}) })}>{tr("complaintOpen")}</Btn>}>
          {qc.workId}
        </Banner>
      ) : done || req.rating.submitted ? (
        <Banner tone="ok" title={t("rateThanks")}>
          {req.rating.value ? t("rateGiven", { n: req.rating.value }) : null}
        </Banner>
      ) : shut ? (
        <Banner tone="neutral" title={t("rateClosedTitle")}>
          {t("rateClosedText")}
        </Banner>
      ) : null}

      {req.resultSummary ? (
        <section>
          <h3>{t("resultTitle")}</h3>
          <p>{req.resultSummary}</p>
          {req.nextAction ? <p className="dxcw-next">{`${t("nextAction")}: ${req.nextAction}`}</p> : null}
        </section>
      ) : null}
      {req.cancelReason ? (
        <section>
          <h3>{t("cancelledTitle")}</h3>
          <p>{req.cancelReason}</p>
        </section>
      ) : null}
      {req.files.length || req.voiceMessages.length ? (
        <section>
          <h3>{t("attachments")}</h3>
          {req.files.map((f, i) =>
            f.url ? (
              <a key={`f${i}`} className="dxco-file" href={f.url} target="_blank" rel="noopener noreferrer">
                <IconFileText aria-hidden />
                <span>{f.name}</span>
              </a>
            ) : (
              <span key={`f${i}`} className="dxco-file">
                <IconFileText aria-hidden />
                <span>{f.name}</span>
              </span>
            ),
          )}
          {req.voiceMessages.map((v, i) => (v.url ? <audio key={`v${i}`} src={v.url} controls preload="none" /> : <span key={`v${i}`}>{v.name}</span>))}
        </section>
      ) : null}
      {req.statusHistory.length ? (
        <section>
          <h3>{t("history")}</h3>
          <ol className="dxcr-hist">
            {req.statusHistory.map((h, i) => (
              <li key={i} className={i === req.statusHistory.length - 1 ? "is-now" : ""}>
                <b>{statusLabel(tc, h.to)}</b>
                <small>{h.at ? dateTimeFull(h.at, locale) : ""}</small>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {canCancel ? (
        asking ? (
          <section>
            <Input value={reason} onChange={setReason} placeholder={t("cancelReasonPh")} ariaLabel={t("cancelReasonPh")} />
            <span className="dxcw-tags">
              <Btn small onClick={() => setAsking(false)}>
                {t("keepIt")}
              </Btn>
              <Btn small kind="danger" busy={busy === "cancel"} onClick={() => void cancel()}>
                {t("cancelConfirm")}
              </Btn>
            </span>
          </section>
        ) : (
          <Btn icon={<IconClose />} onClick={() => setAsking(true)}>
            {t("cancelRequest")}
          </Btn>
        )
      ) : null}
    </aside>
  );
}
