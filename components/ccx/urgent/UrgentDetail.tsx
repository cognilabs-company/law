"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  cancelUrgentRequest,
  claimUrgentRequest,
  completeUrgentRequest,
  createUrgentMeeting,
  getCcUrgentRequest,
  isUrgentEvent,
  setUrgentStatus,
  transferUrgentRequest,
  urgentEventInfo,
  type CallSession,
  type UrgentRequest,
} from "@/lib/services/backend";
import { subscribeUserEvents } from "@/lib/userSocket";
import { errDetail, isForbidden, logApiError } from "@/lib/http";
import { notify, notifyStore } from "@/lib/toast";
import { useAuth, canMakeCalls } from "@/lib/auth";
import { can as canFor } from "@/lib/permissions";
import { dateTimeFull } from "@/lib/date";
import { humanize, regionLabel, statusLabel, statusSpecOf } from "@/lib/labels";
import { fmtUzs } from "@/lib/money";
import { aiId } from "@/lib/ai/ids";
import { isCoarsePointer } from "@/lib/usePopover";
import PersonName from "@/components/ui/PersonName";
import PhoneLock from "@/components/marketplace/order/PhoneLock";
import { directionLabel, useUrgentStatuses } from "@/components/admin/UrgentAdvocateQueue";
import { IconAlert, IconChat, IconExternal, IconMapPin, IconMic, IconUsers } from "@/components/icons";
import { CaseBox, Loading, PartyCard, Section } from "../panel/bits";
import { CopyButton } from "../now/NowFocus";
import { prettyPhone } from "../now/feed";
import { IcArrowLeft, IcBolt, IcCheck, IcChevron, IcClock, IcClose, IcCoins, IcDoc, IcMeeting, IcScale, IcShield, IcTimeline, IcUser } from "../icons";
import { UrgentJourney } from "./UrgentJourney";
import { AI_ITEM, GROUP, SOURCES_SHOWN, chatHref, dedupeSources, kindName, ntfId, statusChoicesOf, statusOf, telOf, type Ask, type Change, type Step } from "./model";
import { ChannelChip, KindIcon, MoreMenu, UrgBadge, VoiceNote, px, type MenuItem } from "./parts";
import { useReportDirty } from "./kit";
import { CancelStep, CompleteStep, StatusStep, TransferStep } from "./UrgentForms";
import UrgentCandidates from "./UrgentCandidates";

type Msgs = { ok: (r: UrgentRequest) => { title: string; body?: string }; fail: string; map?: Partial<Record<number, string>> };

const STEP_FIELD = 'input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled])';

function dropStepError(nid: string) {
  if (notifyStore.getSnapshot().items.some((x) => x.id === nid && x.tone === "error" && !x.leaving)) notify.dismiss(nid);
}

function sizeOf(bytes: number): string {
  if (!bytes) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function UrgentDetail({
  id,
  seed,
  ask,
  onClose,
  onChanged,
  onMeeting,
  onDirty,
  onJoin,
}: {
  id: string;
  seed: UrgentRequest | null;
  ask: Ask;
  onClose?: () => void;
  onChanged: (c: Change) => void;
  onMeeting: (call: CallSession, r: UrgentRequest) => void;
  onDirty: (dirty: boolean) => void;
  onJoin?: (r: UrgentRequest) => void;
}) {
  const t = useTranslations("admin.urgent");
  const tp = useTranslations("admin.ccx.panel");
  const tc = useTranslations("admin.ccx.now");
  const [details, setDetails] = useState(false);
  const x = useTranslations("admin.ccx.urgent");
  const none = useTranslations("common")("none");
  const tk = useTranslations("portal.client.urgent");
  const tcm = useTranslations("portal.common");
  const tn = useTranslations("common.notify");
  const te = useTranslations("enums");
  const tv = useTranslations("secureChat");
  const locale = useLocale();
  const histId = useId();
  const urg = useUrgentStatuses();
  const urgLabel = (s: string) => statusSpecOf(urg, s, statusLabel(tcm, s))?.label ?? "";
  const { session } = useAuth();
  const me = session?.id ?? "";
  // Taking over someone else's claim: admins (and superadmin) only.
  const isAdmin = canFor(session, [], { roles: ["admin"] });
  // Starting the meeting follows meetings.manage (canMakeCalls).
  const hostCalls = canMakeCalls(session);
  // Actions that answered 403 on this record leave the panel.
  const [refused, setRefused] = useState<string[]>([]);
  const off = (key: string) => refused.includes(key);

  const [req, setReq] = useState<UrgentRequest | null>(seed);
  const [load2, setLoad2] = useState<"loading" | "ready" | "error">(seed ? "ready" : "loading");
  const [loadErr, setLoadErr] = useState<unknown>(undefined);
  const [busy, setBusy] = useState("");
  const [step, setStep] = useState<Step>(ask.id === id ? ask.act : "");
  const [stepDirty, setStepDirty] = useState(false);
  const [stepBusy, setStepBusy] = useState(false);
  const [allSources, setAllSources] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [seenAsk, setSeenAsk] = useState(ask);
  const root = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const readyRef = useRef(seed !== null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    readyRef.current = load2 === "ready";
  }, [load2]);

  const fetchOne = useCallback(
    function fetchRecord(): Promise<UrgentRequest | null> {
      return getCcUrgentRequest(id)
        .then((r) => {
          if (!alive.current) return null;
          setReq(r);
          setLoad2("ready");
          return r;
        })
        .catch((e) => {
          logApiError("urgent detail", e);
          if (!alive.current) return null;
          if (readyRef.current) {
            notify.error(t("notify.detailFailed"), {
              id: "urgent-detail-load",
              error: e,
              action: {
                label: tn("retry"),
                onClick: () =>
                  void fetchRecord().then((r) => {
                    if (r) notify.success(t("notify.detailRefreshed"), { id: "urgent-detail-load" });
                  }),
              },
            });
          } else {
            setLoadErr(e);
            setLoad2("error");
          }
          return null;
        });
    },
    [id, t, tn],
  );

  useEffect(() => {
    void fetchOne();
  }, [fetchOne]);

  const again = useRef(fetchOne);
  useEffect(() => {
    again.current = fetchOne;
  }, [fetchOne]);
  useEffect(
    () =>
      subscribeUserEvents((e) => {
        if (!isUrgentEvent(e.event)) return;
        const info = urgentEventInfo(e);
        if (info.recordId && info.recordId !== id) return;
        void again.current();
      }),
    [id],
  );

  async function run(key: string, fn: () => Promise<UrgentRequest>, msgs: Msgs): Promise<boolean> {
    if (busy) return false;
    setBusy(key);
    try {
      const moved = await fn();
      setReq(moved);
      onChanged({ id, ...msgs.ok(moved), status: moved.status });
      return true;
    } catch (e) {
      logApiError("urgent " + key, e);
      if (isForbidden(e)) setRefused((r) => (r.includes(key) ? r : [...r, key]));
      notify.error(msgs.fail, { id: ntfId(id), error: e, map: errDetail(e) ? undefined : msgs.map });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function meet() {
    if (!req || busy) return;
    setBusy("meeting");
    try {
      const call = await createUrgentMeeting(req.id);
      onMeeting(call, req);
      const moved = await fetchOne();
      onChanged({ id: req.id, title: t("meetingStarted"), status: moved?.status });
    } catch (e) {
      logApiError("urgent meeting", e);
      if (isForbidden(e)) setRefused((r) => (r.includes("meeting") ? r : [...r, "meeting"]));
      notify.error(t("notify.meetingFailed"), { id: ntfId(req.id), error: e });
    } finally {
      setBusy("");
    }
  }

  function go(next: Step) {
    dropStepError(ntfId(id));
    setStep(next);
    setStepDirty(false);
  }

  function finishStep() {
    setStep("");
    setStepDirty(false);
  }

  const kindLabel = req ? kindName(tk, req) : "";
  const isGroup = req?.serviceKind === GROUP;
  const isSecond = !!req && (req.serviceKind === GROUP || req.serviceKind === "second_opinion_single");
  const finished = !!req && req.nextStatuses.length === 0;
  const claimOpen = !!req && (req.status === "open_pool" || req.nextStatuses.includes("claimed"));
  const takeOver = claimOpen && !!req?.claimedByUserId && req.claimedByUserId !== me && isAdmin;
  const canClaim = ((claimOpen && !req?.claimedByUserId) || takeOver) && !off("claim");
  const claimMsgs: Msgs = {
    ok: (r) => ({ title: t("notify.claimed"), body: r.secureChatRoomId ? t("notify.chatOpened") : undefined }),
    fail: t("notify.claimFailed"),
    map: { 409: t("alreadyTaken") },
  };
  const statusChoices = req && !off("status") ? statusChoicesOf(req, me).filter((s) => s !== "claimed" || !off("claim")) : [];
  const working = !!req && !finished && req.status !== "open_pool";
  const can = {
    meeting: working && req?.channel !== "chat" && hostCalls && !off("meeting"),
    chat: !!req?.secureChatRoomId,
    complete: working && !off("complete"),
    transfer: working && !off("transfer"),
    status: statusChoices.length > 0,
    cancel: !!req && !finished && !off("cancel"),
    group: !!req && isGroup && !finished && !off("group"),
  };
  const primary = !req
    ? ""
    : canClaim
      ? "claim"
      : finished
        ? can.chat
          ? "chat"
          : ""
        : req.channel === "chat" && can.chat && working
          ? "chat"
          : can.group && !req.groupLawyers.length
            ? "group"
            : can.meeting && (req.status === "claimed" || req.status === "scheduled")
              ? "meeting"
              : can.complete
                ? "complete"
                : can.meeting
                  ? "meeting"
                  : "";
  const allowed: Record<Step, boolean> = {
    "": true,
    complete: can.complete,
    transfer: can.transfer,
    cancel: can.cancel,
    candidates: can.group,
    status: can.status,
  };
  const ready = load2 === "ready" && !!req;
  const shownStep: Step = ready && allowed[step] ? step : "";

  if (ask !== seenAsk) {
    setSeenAsk(ask);
    const keep = shownStep !== "" && (stepDirty || ask.act === shownStep);
    if (ask.id === id && ask.act && !keep) {
      setStep(ask.act);
      setStepDirty(false);
    }
  }

  useReportDirty(shownStep !== "" && stepDirty, onDirty);

  const seenStep = useRef<Step>("");
  useEffect(() => {
    if (seenStep.current === shownStep) return;
    seenStep.current = shownStep;
    const el = root.current;
    if (!el) return;
    el.querySelector<HTMLElement>(".opx-pscroll")?.scrollTo({ top: 0 });
    const field = shownStep && shownStep !== "transfer" && shownStep !== "candidates" && !isCoarsePointer() ? el.querySelector<HTMLElement>(`.opx-pscroll ${STEP_FIELD.split(",").join(", .opx-pscroll ")}`) : null;
    (field ?? el.querySelector<HTMLElement>(".opx-ug-dhead__title"))?.focus({ preventScroll: true });
  }, [shownStep]);

  if (load2 === "loading" && !req) {
    return (
      <div className="opx-ug-detail" ref={root} aria-busy="true">
        {onClose ? (
          <div className="opx-ug-dhead opx-ug-dhead--bare">
            <button type="button" className="opx-ug-x" onClick={onClose} aria-label={tp("close")} title={tp("close")}>
              <IcClose size={18} />
            </button>
          </div>
        ) : null}
        <Loading label={t("openDetail")} />
      </div>
    );
  }

  if (load2 === "error" || !req) {
    return (
      <div className="opx-ug-detail" ref={root}>
        {onClose ? (
          <div className="opx-ug-dhead opx-ug-dhead--bare">
            <button type="button" className="opx-ug-x" onClick={onClose} aria-label={tp("close")} title={tp("close")}>
              <IcClose size={18} />
            </button>
          </div>
        ) : null}
        <div className="opx-pscroll">
          <div className="opx-ug-err" role="alert">
            <p>
              <b>{t("detailLoadError")}</b>
              {errDetail(loadErr) ? <small>{errDetail(loadErr)}</small> : null}
            </p>
            <button type="button" className="opx-pbtn opx-ug-sm" onClick={() => void fetchOne()}>
              {tn("retry")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const sources = isSecond ? dedupeSources(req.eligibleSources) : [];
  const stepTitle: Record<Step, string> = {
    "": kindLabel || t("openDetail"),
    complete: t("stepComplete"),
    transfer: t("stepTransfer"),
    cancel: t("stepCancel"),
    candidates: req.groupLawyers.length ? t("regroup") : t("assignGroup"),
    status: t("moveTo"),
  };
  const dirs = req.directions.map((d) => directionLabel(te, d, t)).filter((d, i, all) => d && all.indexOf(d) === i);

  const items: MenuItem[] = [];
  if (can.chat && primary !== "chat") items.push({ key: "chat", group: 0, label: t("openChat"), hint: t("newTab"), icon: <IconChat {...px(16)} aria-hidden="true" />, href: chatHref(req, kindLabel), title: t("openChatTitle"), aiId: aiId(AI_ITEM, req.id, "chat") });
  if (can.status) items.push({ key: "status", group: 1, label: t("moveTo"), icon: <IcClock size={16} />, aiId: aiId(AI_ITEM, req.id, "status"), onSelect: () => go("status") });

  const joinLive = req.status === "meeting_active" && !!onJoin;
  const meetLabel = busy === "meeting" ? x("starting") : joinLive ? t("join") : t("startMeeting");
  const meetGo = () => {
    if (joinLive && onJoin) onJoin(req);
    else void meet();
  };

  const primaryBtn =
    primary === "claim" ? (
      <button
        type="button"
        className="opx-pbtn opx-pbtn--main"
        disabled={!!busy}
        title={takeOver ? t("takeOverTitle") : undefined}
        onClick={() => void run("claim", () => claimUrgentRequest(req.id), claimMsgs)}
        data-ai-id={aiId(AI_ITEM, req.id, "claim")}
      >
        <IcUser size={16} />
        {busy === "claim" ? t("claiming") : takeOver ? t("takeOver") : t("claim")}
      </button>
    ) : primary === "chat" ? (
      <Link href={chatHref(req, kindLabel)} target="_blank" rel="noopener noreferrer" className="opx-pbtn opx-pbtn--main" title={t("openChatTitle")} data-ai-id={aiId(AI_ITEM, req.id, "chat")}>
        <IconChat {...px(16)} aria-hidden="true" />
        {t("openChat")}
        <span className="opx-sr">{` (${t("newTab")})`}</span>
        <IconExternal {...px(14)} aria-hidden="true" />
      </Link>
    ) : primary === "meeting" ? (
      <button type="button" className="opx-pbtn opx-pbtn--blue" disabled={!!busy} onClick={meetGo} data-ai-id={aiId(AI_ITEM, req.id, "meeting")}>
        <IcMeeting size={17} />
        {meetLabel}
      </button>
    ) : primary === "complete" ? (
      <button type="button" className="opx-pbtn opx-pbtn--main" disabled={!!busy} onClick={() => go("complete")} data-ai-id={aiId(AI_ITEM, req.id, "complete")}>
        <IcCheck size={16} />
        {t("complete")}
      </button>
    ) : primary === "group" ? (
      <button type="button" className="opx-pbtn opx-pbtn--main" disabled={!!busy} onClick={() => go("candidates")} data-ai-id={aiId(AI_ITEM, req.id, "assign-group")} data-ai-label={t("assignGroup")}>
        <IconUsers {...px(16)} aria-hidden="true" />
        {t("assignGroup")}
      </button>
    ) : null;

  const hasSecondary = (can.meeting && primary !== "meeting") || (can.complete && primary !== "complete") || can.transfer;
  const secondary = (
    <>
      {can.meeting && primary !== "meeting" ? (
        <button type="button" className="opx-pbtn" disabled={!!busy} onClick={meetGo} data-ai-id={aiId(AI_ITEM, req.id, "meeting")}>
          <IcMeeting size={17} />
          {meetLabel}
        </button>
      ) : null}
      {can.complete && primary !== "complete" ? (
        <button type="button" className="opx-pbtn" disabled={!!busy} onClick={() => go("complete")} data-ai-id={aiId(AI_ITEM, req.id, "complete")}>
          <IcCheck size={16} />
          {t("complete")}
        </button>
      ) : null}
      {can.transfer ? (
        <button type="button" className="opx-pbtn" disabled={!!busy} onClick={() => go("transfer")} data-ai-id={aiId(AI_ITEM, req.id, "transfer")}>
          <IconUsers {...px(16)} aria-hidden="true" />
          {t("transfer")}
        </button>
      ) : null}
    </>
  );

  return (
    <div
      className={`opx-ug-detail${shownStep ? " is-step" : ""}`}
      ref={root}
      aria-busy={!!busy || stepBusy}
      data-ai-id={aiId(AI_ITEM, req.id, "detail-modal")}
      data-ai-label={kindLabel || t("openDetail")}
      data-ai-entity-type="urgent_advokat_request"
      data-ai-entity-id={req.id}
    >
      <header className="opx-ug-dhead">
        <span className="opx-ug-dhead__ic" aria-hidden="true">
          <KindIcon kind={req.serviceKind} size={24} />
        </span>
        <div className="opx-ug-dhead__txt">
          <h3 className="opx-ug-dhead__title" tabIndex={-1}>
            {kindLabel || req.workId}
          </h3>
        </div>
        {req.slaBreached ? (
          <span className="opx-ug-st" data-tone="hot">
            <IconAlert {...px(13)} aria-hidden="true" />
            {t("slaBreached")}
          </span>
        ) : null}
        {onClose ? (
          <button type="button" className="opx-ug-x" onClick={onClose} aria-label={tp("close")} title={tp("close")}>
            <IcClose size={18} />
          </button>
        ) : null}
      </header>

      {shownStep ? (
        <>
          <div className="opx-ug-stephead">
            <button type="button" className="opx-ug-x" disabled={!!busy || stepBusy} onClick={() => go("")} aria-label={t("back")} title={t("back")}>
              <IcArrowLeft size={17} />
            </button>
            <b>{stepTitle[shownStep]}</b>
          </div>
          {shownStep === "complete" ? (
            <CompleteStep
              busy={!!busy}
              onBack={() => go("")}
              onDirty={setStepDirty}
              onSubmit={(summary, nextAction) => {
                void run("complete", () => completeUrgentRequest(req.id, { summary, nextAction }), { ok: () => ({ title: t("completed") }), fail: t("notify.completeFailed") }).then((ok) => {
                  if (ok) finishStep();
                });
              }}
            />
          ) : shownStep === "transfer" ? (
            <TransferStep
              req={req}
              busy={!!busy}
              onBack={() => go("")}
              onDirty={setStepDirty}
              onSubmit={(uid, reason, name) => {
                void run("transfer", () => transferUrgentRequest(req.id, { targetLawyerUserId: uid, reason }), {
                  ok: () => ({ title: t("transferred"), body: name ? t("notify.transferredTo", { name }) : undefined }),
                  fail: t("notify.transferFailed"),
                }).then((ok) => {
                  if (ok) finishStep();
                });
              }}
            />
          ) : shownStep === "cancel" ? (
            <CancelStep
              busy={!!busy}
              onBack={() => go("")}
              onDirty={setStepDirty}
              onSubmit={(reason) => {
                void run("cancel", () => cancelUrgentRequest(req.id, reason), { ok: () => ({ title: t("cancelDone") }), fail: t("notify.cancelFailed") }).then((ok) => {
                  if (ok) finishStep();
                });
              }}
            />
          ) : shownStep === "candidates" ? (
            <UrgentCandidates
              req={req}
              onBack={() => go("")}
              onDirty={setStepDirty}
              onBusy={setStepBusy}
              onDone={(r, msg) => {
                setReq(r);
                finishStep();
                onChanged({ id, title: msg, status: r.status });
              }}
              onRefused={() => setRefused((r) => (r.includes("group") ? r : [...r, "group"]))}
            />
          ) : (
            <StatusStep
              key={`${req.status}|${req.claimedByUserId}`}
              req={req}
              choices={statusChoices}
              busy={!!busy}
              onBack={() => go("")}
              onDirty={setStepDirty}
              onMove={(s, n) => {
                void run(
                  "status",
                  () => (s === "claimed" ? claimUrgentRequest(req.id) : setUrgentStatus(req.id, s, n)),
                  s === "claimed" ? claimMsgs : { ok: () => ({ title: t("statusMoved", { status: urgLabel(s) }) }), fail: t("notify.statusFailed") },
                ).then((ok) => {
                  if (ok) finishStep();
                });
              }}
            />
          )}
        </>
      ) : (
        <>
          <div className="opx-ug-track">
            <UrgentJourney r={req} />
            {primaryBtn ? <div className="opx-ug-do">{primaryBtn}</div> : null}
          </div>
          <div className="opx-pscroll" data-ai-private>
            <div className="opx-pgrid2">
              <PartyCard
                quietCall={!!primaryBtn}
                role={t("client")}
                name={req.clientName || t("unknownClient")}
                phone={req.clientPhone || undefined}
                lexgoId={req.client?.lexgoId || undefined}
                extra={
                  <>
                    {!req.clientPhone && req.clientPhoneVisible === false ? <PhoneLock reason={req.clientPhoneHiddenReason} /> : null}
                    {req.region ? (
                      <span>
                        <IconMapPin {...px(14)} aria-hidden="true" />
                        {regionLabel(te, req.region)}
                      </span>
                    ) : null}
                  </>
                }
              />
              <CaseBox icon={<IcDoc size={18} />} label={t("need")}>
                <p>{req.need || t("noNeed")}</p>
                {dirs.length ? (
                  <div className="opx-ug-dirs">
                    {dirs.map((d) => (
                      <span key={d} className="opx-ug-dir">
                        <IcScale size={14} />
                        {d}
                      </span>
                    ))}
                  </div>
                ) : null}
                {isGroup ? <small className="opx-ug-note">{t("requestedN", { n: req.lawyerCount || 0 })}</small> : null}
              </CaseBox>
            </div>

            {req.files.length || req.voiceMessages.length ? (
              <Section icon={<IcDoc size={17} />} title={t("attachments")} count={req.files.length + req.voiceMessages.length}>
                <div className="opx-files">
                  {req.files.map((f, i) =>
                    f.url ? (
                      <a key={`f${i}`} className="opx-file" href={f.url} target="_blank" rel="noopener noreferrer">
                        <IcDoc size={16} />
                        <span>{f.name}</span>
                        {f.size ? <small className="opx-num">{sizeOf(f.size)}</small> : null}
                      </a>
                    ) : (
                      <span key={`f${i}`} className="opx-file">
                        <IcDoc size={16} />
                        <span>{f.name}</span>
                      </span>
                    ),
                  )}
                  {req.voiceMessages.map((v, i) =>
                    v.url ? (
                      <VoiceNote key={`v${i}`} src={v.url} name={v.name} seconds={v.durationSeconds} />
                    ) : (
                      <span key={`v${i}`} className="opx-file">
                        <IconMic {...px(15)} aria-hidden="true" />
                        <span>{v.name || tv("voiceNote")}</span>
                      </span>
                    ),
                  )}
                </div>
              </Section>
            ) : null}

            {isGroup ? (
              <Section icon={<IconUsers {...px(17)} aria-hidden="true" />} title={t("panel")} count={req.groupLawyers.length}>
                {req.groupLawyers.length ? (
                  <ul className="opx-ug-people">
                    {req.groupLawyers.map((g) => (
                      <li key={g.id}>
                        <span className="opx-ug-people__ok" aria-hidden="true">
                          <IcCheck size={14} />
                        </span>
                        <b>{g.name}</b>
                        {g.phone ? (
                          <a className="opx-num" href={`tel:${telOf(g.phone)}`}>
                            {prettyPhone(g.phone)}
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="opx-pnone">{t("panelEmpty")}</p>
                )}
                {req.scheduledAt ? (
                  <p className="opx-ug-when">
                    <IcClock size={15} />
                    {t("scheduledFor", { when: dateTimeFull(req.scheduledAt, locale) })}
                  </p>
                ) : null}
                {req.meetingNote ? <p className="opx-ug-note">{req.meetingNote}</p> : null}
                {can.group && primary !== "group" ? (
                  <button
                    type="button"
                    className="opx-pbtn opx-ug-sm opx-ug-self"
                    disabled={!!busy}
                    onClick={() => go("candidates")}
                    data-ai-id={aiId(AI_ITEM, req.id, "assign-group")}
                    data-ai-label={req.groupLawyers.length ? t("regroup") : t("assignGroup")}
                  >
                    <IconUsers {...px(15)} aria-hidden="true" />
                    {req.groupLawyers.length ? t("regroup") : t("assignGroup")}
                  </button>
                ) : null}
              </Section>
            ) : null}

            {req.resultSummary || req.nextAction ? (
              <Section icon={<IcCheck size={17} />} title={t("result")} className="opx-ug-sec--ok">
                {req.resultSummary ? <p className="opx-ug-text">{req.resultSummary}</p> : null}
                {req.nextAction ? (
                  <p className="opx-ug-note">
                    {t("nextAction")}: {req.nextAction}
                  </p>
                ) : null}
                {req.completedAt ? <p className="opx-ug-note opx-num">{dateTimeFull(req.completedAt, locale)}</p> : null}
              </Section>
            ) : null}

            {req.cancelReason ? (
              <Section icon={<IcClose size={17} />} title={t("cancelled")} className="opx-ug-sec--bad">
                <p className="opx-ug-text">{req.cancelReason}</p>
                {req.cancelledAt ? <p className="opx-ug-note opx-num">{dateTimeFull(req.cancelledAt, locale)}</p> : null}
              </Section>
            ) : null}

            <button type="button" className="opx-ug-link opx-ug-morebtn" aria-expanded={details} onClick={() => setDetails((v) => !v)}>
              {tc("more")}
              <IcChevron size={15} />
            </button>
            {details ? (
              <>
                <div className="opx-ug-dhead__chips">
                  {req.workId ? (
                    <span className="opx-ug-chip opx-num">
                      {req.workId}
                      <CopyButton value={req.workId} label={tk("workId")} />
                    </span>
                  ) : null}
                  <UrgBadge status={statusOf(req)} urg={urg} />
                  <ChannelChip channel={req.channel} />
                  {req.meetingMinutes ? (
                    <span className="opx-ug-chip opx-num">
                      <IcClock size={14} />
                      {tk("minutesN", { n: req.meetingMinutes })}
                    </span>
                  ) : null}
                  {req.amount ? (
                    <span className="opx-ug-chip opx-num">
                      <IcCoins size={14} />
                      {fmtUzs(req.amount)} {te("currency")}
                    </span>
                  ) : null}
                  {req.immediateCall ? (
                    <span className="opx-ug-chip is-now">
                      <IcBolt size={14} />
                      {t("onDuty")}
                    </span>
                  ) : null}
                </div>
            <div className={sources.length ? "opx-pgrid2" : undefined}>
              <Section icon={<IcUser size={17} />} title={t("assignment")}>
                <dl className="opx-ug-dl">
                  <div>
                    <dt>{t("claimedBy")}</dt>
                    <dd>
                      <PersonName id={req.claimedBy?.id ?? req.claimedByUserId} name={req.claimedBy?.name} />
                    </dd>
                  </div>
                  <div>
                    <dt>{t("operator")}</dt>
                    <dd>
                      <PersonName id={req.operator?.id ?? req.operatorUserId} name={req.operator?.name} />
                    </dd>
                  </div>
                  <div>
                    <dt>{t("assignedLawyer")}</dt>
                    <dd>
                      <PersonName id={req.assignedLawyer?.id} name={req.assignedLawyer?.name} />
                    </dd>
                  </div>
                  <div>
                    <dt>{t("created")}</dt>
                    <dd className="opx-num">{req.createdAt ? dateTimeFull(req.createdAt, locale) : none}</dd>
                  </div>
                </dl>
              </Section>

              {sources.length ? (
                <Section icon={<IcShield size={17} />} title={t("eligibleSources")} count={sources.length}>
                  <ul className="opx-ug-sources">
                    {(allSources ? sources : sources.slice(0, SOURCES_SHOWN)).map((s, i) => (
                      <li key={`${s.type}-${s.id}-${i}`}>
                        <b>{s.title || (s.serviceKind && tk.has(`kinds.${s.serviceKind}`) ? tk(`kinds.${s.serviceKind}`) : humanize(s.serviceKind || s.type))}</b>
                        <small>{[statusLabel(tcm, s.status), s.createdAt ? dateTimeFull(s.createdAt, locale) : ""].filter(Boolean).join(" · ")}</small>
                      </li>
                    ))}
                  </ul>
                  {sources.length > SOURCES_SHOWN ? (
                    <button type="button" className="opx-ug-link" aria-expanded={allSources} onClick={() => setAllSources((v) => !v)}>
                      {allSources ? t("sourcesLess") : t("sourcesAll", { n: sources.length })}
                    </button>
                  ) : null}
                </Section>
              ) : null}
            </div>

            {req.statusHistory.length ? (
              <section className="opx-psec opx-ug-hist">
                <h3>
                  <button type="button" className="opx-ug-htog" aria-expanded={histOpen} aria-controls={histId} onClick={() => setHistOpen((v) => !v)}>
                    <IcTimeline size={17} />
                    {t("history")}
                    <b className="opx-num">{req.statusHistory.length}</b>
                    <IcChevron size={16} className="opx-ug-htog__cv" />
                  </button>
                </h3>
                <ol id={histId} className="opx-tl" hidden={!histOpen}>
                  {req.statusHistory.map((h, i) => (
                    <li key={i} className={i === req.statusHistory.length - 1 ? "is-last" : undefined}>
                      <time className="opx-num" dateTime={h.at}>
                        {h.at ? dateTimeFull(h.at, locale) : ""}
                      </time>
                      <span>
                        <b>{urgLabel(h.to)}</b>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
              </>
            ) : null}
          </div>

          {hasSecondary || items.length > 0 || can.cancel ? (
            <footer className="opx-ug-acts">
              {secondary}
              <MoreMenu items={items} title={t("moreTitle")} up disabled={!!busy} aiId={aiId(AI_ITEM, req.id, "more")} />
              {can.cancel ? (
                <button type="button" className="opx-pbtn opx-ug-cancel" disabled={!!busy} onClick={() => go("cancel")} data-ai-id={aiId(AI_ITEM, req.id, "cancel")}>
                  {t("cancel")}
                </button>
              ) : null}
            </footer>
          ) : null}
        </>
      )}
    </div>
  );
}
