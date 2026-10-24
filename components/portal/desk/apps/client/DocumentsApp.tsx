"use client";

import { builderRouteOf } from "@/components/portal/docCatalog/builderLink";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { docPayPhase, docRealtimeOf, getDocumentRequestFile, listClientDocumentFlowPage, rateDocumentRequest, requestDocumentLawyerReviewGated, type ClientDocFlowItem, type ClientDocFlowMode } from "@/lib/services/backend";
import { onUserSocketResync, subscribeUserEvents } from "@/lib/userSocket";
import { fetchAndDeliver } from "@/lib/download";
import { fmtUzs } from "@/lib/money";
import { shortDateTime } from "@/lib/date";
import { matchesSearch } from "@/lib/searchText";
import { useDocRatings } from "@/lib/useDocRatings";
import { useDocChatRooms } from "@/lib/useDocChatRooms";
import { IconAlert, IconArrowRight, IconChat, IconCheck, IconDocLines, IconDownload, IconEdit, IconFileText, IconInbox, IconRefresh, IconScale, IconSearch, IconSend, IconSparkle, IconStarRate } from "@/components/icons";
import { App, Banner, Btn, Dialog, Empty, Field, Loading, Search, Sidebar, Table, Tag, TextArea, Tool, Toolbar, useOs, useToast, type Col, type NavSection, type Tone } from "../../kit/kit";
import type { NativeProps } from "../../native";
import { StarPicker, StarsView } from "./bits";
import "./client.css";
import { useSameTickGuard } from "@/lib/useSameTickGuard";

// The client's documents as a desktop program — every document they are
// having made, by the client's own hand, by the AI or by an advocate: by
// where it has got to on the side, the list in the middle, the chosen one
// on the right with its four steps (details, payment, the advocate's review,
// ready), the file to download, the way back into the constructor, its chat,
// sending it to an advocate, and the rating once it is done.

type View = "all" | "filling" | "lawyer" | "ready" | `m:${ClientDocFlowMode}`;
const VIEW_STATUS: Record<string, string> = { all: "", filling: "questionnaire", lawyer: "lawyer_review", ready: "file_ready" };
const MODES: ClientDocFlowMode[] = ["manual", "ai", "lawyer"];
const MODE_ICON: Record<ClientDocFlowMode, ReactNode> = { manual: <IconEdit />, ai: <IconSparkle />, lawyer: <IconScale /> };
const PAGE = 20;
type Step = "fill" | "pay" | "review" | "ready";
const FLOW: Step[] = ["fill", "pay", "review", "ready"];
const STEP_OF: Record<string, Step> = { questionnaire: "fill", ready_to_generate: "fill", payment_pending: "pay", awaiting_payment: "pay", pending_payment: "pay", payment_required: "pay", open_pool: "review", lawyer_review_requested: "review", lawyer_review: "review", pending_review: "review", in_review: "review", review: "review", claimed: "review", file_ready: "ready", rated: "ready" };
const RATEABLE = new Set(["file_ready", "rated", "closed"]);

function toneOf(it: ClientDocFlowItem): Tone {
  const phase = docPayPhase(it.status, it.mode === "lawyer", it.payment.required);
  if (phase === "wait") return "warn";
  if (phase === "cancelled") return "err";
  if (it.status === "file_ready" || it.status === "rated") return "ok";
  if (/^(questionnaire|ready_to_generate|payment_pending|awaiting_payment)$/.test(it.status)) return "warn";
  if (/^(closed|cancelled|rejected)$/.test(it.status)) return "neutral";
  return "accent";
}
// Each of the four steps: done, now, still to come, not needed, or failed.
function flowOf(it: ClientDocFlowItem): Record<Step, "done" | "now" | "todo" | "skip" | "fail"> | null {
  const phase = docPayPhase(it.status, it.mode === "lawyer", it.payment.required);
  const closed = /^(closed|cancelled|rejected)$/.test(it.status);
  if (closed && !it.file.ready) return null;
  let cur: Step | undefined = phase ? "pay" : STEP_OF[it.status];
  if (closed || (!cur && it.file.ready)) cur = "ready";
  if (!cur) cur = it.mode === "lawyer" || it.lawyerRequestActive ? "review" : "fill";
  const needPay = it.payment.required || cur === "pay";
  const needReview = it.mode === "lawyer" || it.lawyerRequestActive || !!it.assignedLawyer || cur === "review";
  const at = FLOW.indexOf(cur);
  const out = {} as Record<Step, "done" | "now" | "todo" | "skip" | "fail">;
  FLOW.forEach((s, i) => {
    out[s] = (s === "pay" && !needPay) || (s === "review" && !needReview) ? "skip" : cur === "ready" || i < at ? "done" : i === at ? (phase === "cancelled" ? "fail" : "now") : "todo";
  });
  return out;
}

export default function DocumentsApp({ openLink }: NativeProps) {
  const t = useTranslations("portal.client.documentRequests");
  const tc = useTranslations("portal.common");
  const d = useTranslations("portal.desk.client");
  const locale = useLocale();
  const os = useOs();
  const [view, setView] = useState<View>("all");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ClientDocFlowItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [tick, setTick] = useState(0);
  const [sel, setSel] = useState("");
  const [toast, say] = useToast();
  const mode = view.startsWith("m:") ? (view.slice(2) as ClientDocFlowMode) : undefined;
  const status = mode ? "" : VIEW_STATUS[view];

  useEffect(() => {
    let alive = true;
    listClientDocumentFlowPage({ mode, status: status || undefined, limit: PAGE, offset: 0 })
      .then((p) => {
        if (!alive) return;
        setRows(p.items);
        setTotal(p.total);
        setHasMore(p.hasMore);
        setFailed(false);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [mode, status, tick]);
  useEffect(() => {
    let alive = true;
    Promise.allSettled(["", "questionnaire", "lawyer_review", "file_ready"].map((s) => listClientDocumentFlowPage({ status: s || undefined, limit: 1 }))).then((r) => {
      if (!alive) return;
      const keys = ["all", "filling", "lawyer", "ready"];
      setStats(Object.fromEntries(r.map((x, i) => [keys[i], x.status === "fulfilled" ? x.value.total : 0])));
    });
    return () => {
      alive = false;
    };
  }, [tick]);
  useEffect(() => {
    let h: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(h);
      h = setTimeout(() => setTick((n) => n + 1), 600);
    };
    const off = subscribeUserEvents((e) => {
      const ev = docRealtimeOf(e);
      if (!ev) return;
      if (/\.(ready|completed)$/.test(ev.name)) say(t("readyToast"));
      else if (ev.kind === "created") say(t("opCreated"));
      soon();
    });
    const off2 = onUserSocketResync(soon);
    return () => {
      clearTimeout(h);
      off();
      off2();
    };
  }, [say, t]);
  const loadMore = async () => {
    if (!rows || more) return;
    setMore(true);
    try {
      const p = await listClientDocumentFlowPage({ mode, status: status || undefined, limit: PAGE, offset: rows.length });
      setRows((r) => {
        const have = new Set((r ?? []).map((x) => x.id));
        return [...(r ?? []), ...p.items.filter((x) => !have.has(x.id))];
      });
      setHasMore(p.hasMore);
    } catch {
      say(t("loadError"), "err");
    } finally {
      setMore(false);
    }
  };

  const shown = useMemo(() => (rows ?? []).filter((x) => !q.trim() || matchesSearch(`${x.title} ${x.requestedDocumentType} ${x.workId} ${x.assignedLawyer?.name ?? ""}`, q)), [rows, q]);
  const cur = shown.find((x) => x.id === sel) ?? null;
  const statusText = (x: ClientDocFlowItem) => x.statusLabel || (tc.has(`docStatus.${x.status}`) ? tc(`docStatus.${x.status}`) : x.status);
  const sections: NavSection[] = [
    {
      id: "v",
      title: os === "mac" ? t("title") : undefined,
      items: [
        { id: "all", label: t("statTotal"), icon: <IconInbox />, count: stats.all || undefined },
        { id: "filling", label: t("statFilling"), icon: <IconEdit />, count: stats.filling || undefined },
        { id: "lawyer", label: t("statLawyer"), icon: <IconScale />, count: stats.lawyer || undefined },
        { id: "ready", label: t("statReady"), icon: <IconCheck />, count: stats.ready || undefined },
      ],
    },
    { id: "m", title: t("filterMode"), items: MODES.map((m) => ({ id: `m:${m}`, label: t(`tab_${m}`), icon: MODE_ICON[m] })) },
  ];
  const title = mode ? t(`tab_${mode}`) : view === "all" ? t("title") : t(view === "filling" ? "statFilling" : view === "lawyer" ? "statLawyer" : "statReady");
  const cols: Col<ClientDocFlowItem>[] = [
    {
      id: "title",
      label: t("title"),
      width: "minmax(220px,2fr)",
      cell: (x) => (
        <span className="dxcw-name">
          <span className={`dxcw-ic is-${toneOf(x)}`} aria-hidden>
            {MODE_ICON[x.mode as ClientDocFlowMode] ?? <IconFileText />}
          </span>
          <span>
            <b>{x.title || x.requestedDocumentType || "—"}</b>
            <small>{[t.has(`tab_${x.mode}`) ? t(`tab_${x.mode}`) : x.mode, x.requestedDocumentType && x.title ? x.requestedDocumentType : ""].filter(Boolean).join(" · ")}</small>
          </span>
        </span>
      ),
    },
    { id: "status", label: tc("filterStatus"), width: "minmax(170px,1fr)", cell: (x) => <Steps x={x} statusText={statusText(x)} /> },
    { id: "created", label: d("created"), width: "104px", sort: (a, b) => a.createdAt.localeCompare(b.createdAt), cell: (x) => (x.createdAt ? shortDateTime(x.createdAt, locale) : "—") },
  ];
  const search = <Search value={q} onChange={setQ} placeholder={t("searchPh")} wide={os === "win"} />;

  return (
    <App
      name="cdocs"
      sidebar={<Sidebar label={t("title")} sections={sections} value={view} onChange={(v) => (setView(v as View), setSel(""))} header={os === "win" ? search : undefined} />}
      inspector={cur ? <Sheet key={cur.id} x={cur} statusText={statusText(cur)} openLink={openLink} onChanged={() => setTick((n) => n + 1)} say={say} /> : undefined}
    >
      <Toolbar title={title} subtitle={rows ? d("documents", { n: total }) : t("lead")} end={os === "mac" ? search : undefined}>
        <Tool icon={<IconDocLines />} label={t("browse")} onClick={() => openLink({ appId: "", route: "/portal/client/services" })} />
        <Tool icon={<IconRefresh />} label={d("refresh")} onClick={() => setTick((n) => n + 1)} />
      </Toolbar>
      <div className="dxcw-body">
        {rows === null ? (
          failed ? (
            <Empty icon={<IconAlert />} title={t("loadError")} action={<Btn onClick={() => setTick((n) => n + 1)}>{t("retry")}</Btn>} />
          ) : (
            <Loading label={t("title")} />
          )
        ) : (
          <>
            <Table
              label={t("title")}
              cols={cols}
              rows={shown}
              rowKey={(x) => x.id}
              selected={sel}
              onSelect={(x) => setSel(x.id)}
              onOpen={(x) => x.file.ready && void fetchAndDeliver(() => getDocumentRequestFile(x.id), `${x.title || "hujjat"}.${x.file.format || "docx"}`, true)}
              empty={
                q.trim() ? (
                  <Empty icon={<IconSearch />} title={t("searchEmpty")} text={hasMore ? t("searchEmptyMore") : t("searchEmptyText")} />
                ) : (
                  <Empty icon={<IconFileText />} title={t("empty")} text={view === "all" ? t("emptyText") : t("filterEmptyText")} action={<Btn kind="primary" icon={<IconDocLines />} onClick={() => openLink({ appId: "", route: "/portal/client/services" })}>{t("browse")}</Btn>} />
                )
              }
            />
            {hasMore ? (
              <div className="dxcw-more">
                <Btn small busy={more} onClick={() => void loadMore()}>
                  {tc("loadMore")}
                </Btn>
              </div>
            ) : null}
          </>
        )}
      </div>
      {toast}
    </App>
  );
}

function Steps({ x, statusText }: { x: ClientDocFlowItem; statusText: string }) {
  const f = flowOf(x);
  return (
    <span className="dxco-stage">
      <Tag tone={toneOf(x)}>{statusText}</Tag>
      {f ? (
        <span className="dxco-dots" aria-hidden>
          {FLOW.filter((s) => f[s] !== "skip").map((s) => (
            <i key={s} className={f[s] === "done" ? "is-done" : f[s] === "now" ? "is-now" : f[s] === "fail" ? "is-fail" : ""} />
          ))}
        </span>
      ) : null}
    </span>
  );
}

// One document in full.
function Sheet({ x, statusText, openLink, onChanged, say }: { x: ClientDocFlowItem; statusText: string; openLink: NativeProps["openLink"]; onChanged: () => void; say: (m: string, tone?: Tone) => void }) {
  const t = useTranslations("portal.client.documentRequests");
  const tcd = useTranslations("portal.client.documents");
  const d = useTranslations("portal.desk.client");
  const locale = useLocale();
  const [send, setSend] = useState(false);
  const [ctor, setCtor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rate, setRate] = useState(false);
  const rooms = useDocChatRooms(x.mode === "lawyer" || x.assignedLawyer ? [x.id] : [], 0);
  const ratings = useDocRatings(RATEABLE.has(x.status) ? [x.id] : [], 0);
  const room = x.secureChatRoomId || rooms[x.id] || "";
  const rating = ratings[x.id]?.rating;
  const phase = docPayPhase(x.status, x.mode === "lawyer", x.payment.required);
  const f = flowOf(x);
  const closed = /^(closed|cancelled|rejected)$/.test(x.status);
  const ctorUrl = x.constructorUrls.continueUrl || x.constructorAction?.continueUrl || "";
  const canContinue = !!x.constructorAction?.available && !!ctorUrl;
  const canSend = x.mode === "manual" && !closed && !phase && x.canSendLawyerRequest;
  const fileName = `${x.title || "hujjat"}.${x.file.format || "docx"}`;
  const download = () => void fetchAndDeliver(() => getDocumentRequestFile(x.id), fileName, true).then((ok) => !ok && say(t("downloadError"), "err"));
  async function openConstructor() {
    setCtor(false);
    setBusy(true);
    try {
      const route = await builderRouteOf(x);
      if (route) openLink({ appId: "", route });
      else say(t("constructorOpenError"), "err");
    } catch {
      say(t("constructorOpenError"), "err");
    } finally {
      setBusy(false);
    }
  }
  const price = phase === "wait" ? t("priceWait") : phase === "cancelled" ? t("priceCancelled") : x.payment.amount ? `${fmtUzs(x.payment.amount)} ${tcd("som")}` : t("priceNone");
  const facts: [string, string][] = [
    ...(x.workId ? ([[t("workId"), x.workId]] as [string, string][]) : []),
    [t("filterMode"), t.has(`tab_${x.mode}`) ? t(`tab_${x.mode}`) : x.mode],
    ...(x.assignedLawyer?.name ? ([[d("lawyer"), x.assignedLawyer.name]] as [string, string][]) : []),
    [t("priceInfo"), price],
    ...(x.meeting ? ([[t("meetingLabel"), x.meeting.active ? t("meetingActive") : x.meeting.status]] as [string, string][]) : []),
    [d("created"), x.createdAt ? shortDateTime(x.createdAt, locale) : "—"],
  ];
  const STEP_KEY: Record<Step, string> = { fill: "flowStepFill", pay: "flowStepPay", review: "flowStepReview", ready: "flowStepReady" };
  return (
    <aside className="dxcw-insp" aria-label={x.title}>
      <header>
        <span className={`dxcw-ic is-big is-${toneOf(x)}`} aria-hidden>
          {MODE_ICON[x.mode as ClientDocFlowMode] ?? <IconFileText />}
        </span>
        <h2>{x.title || x.requestedDocumentType || "—"}</h2>
        <span className="dxcw-tags">
          <Tag tone={toneOf(x)}>{statusText}</Tag>
        </span>
      </header>
      {f ? (
        <ol className="dxco-steps">
          {FLOW.filter((s) => f[s] !== "skip").map((s, i) => (
            <li key={s} className={f[s] === "done" ? "is-done" : f[s] === "now" ? "is-now" : f[s] === "fail" ? "is-fail" : ""}>
              <i aria-hidden>{f[s] === "done" ? <IconCheck /> : i + 1}</i>
              <span>{t(STEP_KEY[s])}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {phase === "wait" ? <Banner tone="warn" title={t("pay.wait.title")}>{t("pay.wait.text")}</Banner> : phase === "cancelled" ? <Banner tone="err" title={t("pay.cancelled.title")}>{t("pay.cancelled.text")}</Banner> : null}
      {x.nextAction ? <p className="dxcw-next">{x.nextAction}</p> : null}
      <dl>
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {rating && (rating.submitted || rating.value) ? (
        <section>
          <h3>{t("rateTitle")}</h3>
          <StarsView value={rating.value} />
        </section>
      ) : null}
      <div className="dxcw-acts">
        {x.file.ready ? (
          <Btn kind="primary" icon={<IconDownload />} onClick={download}>
            {t("download")}
          </Btn>
        ) : null}
        {rating && rating.available && !rating.submitted ? (
          <Btn icon={<IconStarRate />} onClick={() => setRate(true)}>
            {t("rateTitle")}
          </Btn>
        ) : null}
        {canContinue ? (
          <Btn kind={x.file.ready ? "default" : "primary"} icon={<IconArrowRight />} busy={busy} onClick={() => (x.constructorAction?.promptRequired ? setCtor(true) : void openConstructor())}>
            {t("constructorContinue")}
          </Btn>
        ) : null}
        {room ? (
          <Btn icon={<IconChat />} onClick={() => openLink({ appId: "", route: `/portal/chat/${room}` })}>
            {t("openChat")}
          </Btn>
        ) : null}
        {canSend ? (
          <Btn icon={<IconSend />} onClick={() => setSend(true)}>
            {t("actSend")}
          </Btn>
        ) : null}
      </div>
      {x.mode === "manual" && !x.canSendLawyerRequest && x.lawyerRequestBlockReason ? (
        <section>
          <h3>{t("whyBlocked")}</h3>
          <p>{x.lawyerRequestBlockReason}</p>
        </section>
      ) : null}
      {send ? (
        <SendDialog
          x={x}
          onClose={() => setSend(false)}
          onDone={(msg, tone) => {
            setSend(false);
            say(msg, tone);
            onChanged();
          }}
        />
      ) : null}
      {ctor && x.constructorAction ? (
        <Dialog
          open
          title={x.constructorAction.title || t("constructorContinue")}
          onClose={() => setCtor(false)}
          actions={
            <>
              <Btn onClick={() => setCtor(false)}>{t("waitingLawyer")}</Btn>
              <Btn kind="primary" icon={<IconArrowRight />} onClick={() => void openConstructor()}>
                {t("constructorContinue")}
              </Btn>
            </>
          }
        >
          <p className="dx-dlg__text">{x.constructorAction.message}</p>
        </Dialog>
      ) : null}
      {rate ? (
        <RateDialog
          id={x.id}
          onClose={() => setRate(false)}
          onDone={() => {
            setRate(false);
            say(t("rateThanks"));
            onChanged();
          }}
        />
      ) : null}
    </aside>
  );
}

function SendDialog({ x, onClose, onDone }: { x: ClientDocFlowItem; onClose: () => void; onDone: (msg: string, tone?: Tone) => void }) {
  const t = useTranslations("portal.client.documents");
  const tr = useTranslations("portal.client.documentRequests");
  const [need, setNeed] = useState("");
  const [busy, setBusy] = useState(false);
  const once = useSameTickGuard();
  async function run() {
    if (busy || !once()) return;
    setBusy(true);
    try {
      const r = await requestDocumentLawyerReviewGated(x.id, need.trim() || t("reviewNeedDefault"));
      if (r.alreadyExists || !r.canSendLawyerRequest) onDone(r.message || x.lawyerRequestBlockReason || t("lawyerPendingLead"), "warn");
      else if (r.paymentRequired) onDone(r.message || tr("lawyerPayRequired"), "warn");
      else onDone(r.message || t("reviewSentTitle"), "ok");
    } catch {
      onDone(t("reviewFailed"), "err");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      title={t("reviewOpen")}
      onClose={onClose}
      onSubmit={() => void run()}
      actions={
        <>
          <Btn onClick={onClose}>{t("reviewCancel")}</Btn>
          <Btn kind="primary" type="submit" icon={<IconSend />} busy={busy}>
            {busy ? t("processingShort") : t("reviewSubmit")}
          </Btn>
        </>
      }
    >
      <Field label={t("reviewNeedLabel")}>
        <TextArea value={need} onChange={setNeed} placeholder={t("reviewNeedDefault")} rows={4} maxLength={2000} ariaLabel={t("reviewNeedLabel")} />
      </Field>
    </Dialog>
  );
}

// Rating the finished document; one or two stars can carry a complaint.
function RateDialog({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("portal.client.documentRequests");
  const tr = useTranslations("portal.client.rate");
  const d = useTranslations("portal.desk.client");
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [complaint, setComplaint] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function run() {
    if (busy || !stars) return;
    setBusy(true);
    setErr("");
    try {
      await rateDocumentRequest(id, stars, comment.trim(), stars <= 2 ? complaint.trim() : "");
      onDone();
    } catch {
      setErr(t("rateError"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      title={t("rateTitle")}
      onClose={onClose}
      onSubmit={() => void run()}
      actions={
        <>
          <Btn onClick={onClose}>{d("cancel")}</Btn>
          <Btn kind="primary" type="submit" busy={busy} disabled={!stars}>
            {busy ? t("rateSending") : t("rateSubmit")}
          </Btn>
        </>
      }
    >
      <StarPicker value={stars} onChange={setStars} label={t("rateTitle")} words={(n) => (tr.has(`w${n}`) ? tr(`w${n}`) : String(n))} />
      <Field label={t("rateCommentPh")}>
        <TextArea value={comment} onChange={setComment} rows={2} maxLength={1000} ariaLabel={t("rateCommentPh")} />
      </Field>
      {stars > 0 && stars <= 2 ? (
        <Field label={tr("lowTitle")} hint={tr("lowHint")}>
          <TextArea value={complaint} onChange={setComplaint} placeholder={tr("lowPh")} rows={3} maxLength={2000} ariaLabel={tr("lowTitle")} />
        </Field>
      ) : null}
      {err ? <Banner tone="err" title={err} /> : null}
    </Dialog>
  );
}
