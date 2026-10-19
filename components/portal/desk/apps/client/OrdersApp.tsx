"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { cancelMarketplaceOrder, listMarketplaceOrders, marketChatHref, marketErrorCode, marketPhaseOf, marketStageOf, rateMarketplaceOrder, MARKET_EVENT, type MarketOrder, type MarketStage } from "@/lib/services/marketplace";
import { getSecureMessageFileAt, startCall } from "@/lib/services/backend";
import { onUserSocketResync } from "@/lib/userSocket";
import { errDetail } from "@/lib/http";
import { saveBlob } from "@/lib/download";
import { fmtUzs } from "@/lib/money";
import { shortDateTime } from "@/lib/date";
import { matchesSearch } from "@/lib/searchText";
import { ratingLeftMs, useTick } from "@/components/marketplace/OrderExtras";
import { IconAlert, IconCheck, IconChat, IconClock, IconClose, IconDownload, IconFileText, IconInbox, IconPhone, IconRefresh, IconSearch, IconStarRate, IconTag, IconUsers, IconVideo } from "@/components/icons";
import { App, Banner, Btn, Dialog, Empty, Field, Loading, Search, Sidebar, Table, Tag, TextArea, Tool, Toolbar, useOs, useToast, type Col, type NavSection, type Tone } from "../../kit/kit";
import type { NativeProps } from "../../native";
import { StarPicker, StarsView } from "./bits";
import "./client.css";

// The client's marketplace orders as a desktop program — Apple's order
// status page on the Mac, a Windows "Orders" list: the orders by stage on
// the side, the list in the middle, the chosen one's sheet on the right
// with its four steps, what was bought, the specialist, the result and its
// files, the rating, and the chat, the call and the cancel.

type Tab = "all" | MarketStage;
const TABS: Tab[] = ["all", "pending", "active", "completed", "cancelled"];
const TAB_ICON: Record<Tab, ReactNode> = { all: <IconInbox />, pending: <IconClock />, active: <IconTag />, completed: <IconCheck />, cancelled: <IconClose /> };
const STAGE_TONE: Record<MarketStage, Tone> = { pending: "warn", active: "accent", completed: "ok", cancelled: "neutral" };
const STEPS = ["request", "confirm", "work", "done"] as const;
const stepOf = (o: MarketOrder) => {
  const p = marketPhaseOf(o);
  return p === "pending" ? 0 : p === "paid" ? 1 : p === "in_progress" || p === "review" ? 2 : p === "cancelled" ? -1 : 3;
};

export default function OrdersApp({ openLink }: NativeProps) {
  const t = useTranslations("marketplace.orders");
  const d = useTranslations("portal.desk.client");
  const os = useOs();
  const [list, setList] = useState<MarketOrder[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState("");
  const [tick, setTick] = useState(0);
  const [toast, say] = useToast();

  useEffect(() => {
    const c = new AbortController();
    listMarketplaceOrders("client", { signal: c.signal })
      .then((l) => {
        if (c.signal.aborted) return;
        setList(l);
        setFailed(false);
      })
      .catch(() => !c.signal.aborted && setFailed(true));
    return () => c.abort();
  }, [tick]);
  // The marketplace watcher announces order changes on the window.
  useEffect(() => {
    let h: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(h);
      h = setTimeout(() => setTick((n) => n + 1), 500);
    };
    const vis = () => document.visibilityState === "visible" && soon();
    window.addEventListener(MARKET_EVENT, soon);
    document.addEventListener("visibilitychange", vis);
    const off = onUserSocketResync(soon);
    return () => {
      clearTimeout(h);
      window.removeEventListener(MARKET_EVENT, soon);
      document.removeEventListener("visibilitychange", vis);
      off();
    };
  }, []);

  const all = useMemo(() => list ?? [], [list]);
  const count = (k: Tab) => (k === "all" ? all.length : all.filter((o) => marketStageOf(o) === k).length);
  const shown = all.filter((o) => (tab === "all" || marketStageOf(o) === tab) && (!q.trim() || matchesSearch(`${o.serviceTitle} ${o.workId} ${o.lawyerName}`, q.slice(0, 100))));
  const cur = all.find((o) => o.id === sel) ?? null;
  const money = (o: MarketOrder) => (o.price ? `${fmtUzs(o.price)} ${o.currency && o.currency !== "UZS" ? o.currency : d("som")}` : "—");
  const sections: NavSection[] = [{ id: "o", title: os === "mac" ? t("clientTitle") : undefined, items: TABS.map((k) => ({ id: k, label: t(`tabs.${k}`), icon: TAB_ICON[k], count: count(k) || undefined })) }];
  const cols: Col<MarketOrder>[] = [
    {
      id: "svc",
      label: t("clientTitle"),
      width: "minmax(180px,2fr)",
      cell: (o) => (
        <span className="dxco-svc">
          <b>{o.serviceTitle || o.packageTitle || "—"}</b>
          <small>
            {o.workId ? <code>{o.workId}</code> : null}
            {o.packageTitle && o.serviceTitle ? o.packageTitle : null}
          </small>
        </span>
      ),
    },
    { id: "seller", label: t("seller"), width: "minmax(120px,1fr)", cell: (o) => o.lawyerName || "—" },
    { id: "price", label: t("price"), width: "110px", align: "end", sort: (a, b) => a.price - b.price, cell: (o) => money(o) },
    { id: "stage", label: t("filterStatus"), width: "minmax(130px,auto)", cell: (o) => <Stage o={o} /> },
  ];
  const search = <Search value={q} onChange={setQ} placeholder={t("searchPhClient")} wide={os === "win"} />;

  return (
    <App
      name="corders"
      sidebar={<Sidebar label={t("clientTitle")} sections={sections} value={tab} onChange={(k) => (setTab(k as Tab), setSel(""))} header={os === "win" ? search : undefined} />}
      inspector={cur ? <Sheet key={cur.id} o={cur} money={money(cur)} openLink={openLink} onChanged={(msg) => (setTick((n) => n + 1), msg && say(msg))} onError={(m) => say(m, "err")} /> : undefined}
    >
      <Toolbar title={t(`tabs.${tab}`)} subtitle={list ? d("orders", { n: shown.length }) : t("clientLead")} end={os === "mac" ? search : undefined}>
        <Tool icon={<IconUsers />} label={t("browse")} onClick={() => openLink({ appId: "", route: "/portal/client/lawyers" })} />
        <Tool icon={<IconRefresh />} label={t("refresh")} onClick={() => setTick((n) => n + 1)} />
      </Toolbar>
      <div className="dxcw-body">
        {list === null ? (
          failed ? (
            <Empty icon={<IconAlert />} title={t("error")} action={<Btn onClick={() => setTick((n) => n + 1)}>{t("retry")}</Btn>} />
          ) : (
            <Loading label={t("clientTitle")} />
          )
        ) : !all.length ? (
          <Empty icon={<IconTag />} title={t("emptyClient")} text={t("emptyClientText")} action={<Btn kind="primary" icon={<IconUsers />} onClick={() => openLink({ appId: "", route: "/portal/client/lawyers" })}>{t("browse")}</Btn>} />
        ) : (
          <Table
            label={t("clientTitle")}
            cols={cols}
            rows={shown}
            rowKey={(o) => o.id}
            selected={sel}
            onSelect={(o) => setSel(o.id)}
            onOpen={(o) => o.canStartChat && openLink({ appId: "", route: marketChatHref(o) })}
            empty={<Empty icon={q.trim() ? <IconSearch /> : TAB_ICON[tab]} title={q.trim() ? t("emptyFilter") : t("emptyTab")} />}
          />
        )}
      </div>
      {toast}
    </App>
  );
}

// The order's stage with its four dots.
function Stage({ o }: { o: MarketOrder }) {
  const t = useTranslations("marketplace.orders");
  const stage = marketStageOf(o);
  const step = stepOf(o);
  return (
    <span className="dxco-stage">
      <Tag tone={STAGE_TONE[stage]}>{o.workPaused ? t("paused") : t(`tabs.${stage}`)}</Tag>
      {step >= 0 ? (
        <span className="dxco-dots" aria-hidden>
          {STEPS.map((s, i) => (
            <i key={s} className={i < step ? "is-done" : i === step ? "is-now" : ""} />
          ))}
        </span>
      ) : null}
    </span>
  );
}

// One order in full.
function Sheet({ o, money, openLink, onChanged, onError }: { o: MarketOrder; money: string; openLink: NativeProps["openLink"]; onChanged: (msg: string) => void; onError: (msg: string) => void }) {
  const t = useTranslations("marketplace.orders");
  const tx = useTranslations("marketplace.orderExtras");
  const tp = useTranslations("marketplace.purchase");
  const d = useTranslations("portal.desk.client");
  const locale = useLocale();
  const [calling, setCalling] = useState("");
  const [cancel, setCancel] = useState(false);
  const [rate, setRate] = useState(false);
  const stage = marketStageOf(o);
  const step = stepOf(o);
  const canCall = o.canCreateCall && o.callsAllowed && stage !== "cancelled" && stage !== "completed" && !!o.roomId;
  const canRate = stage === "completed" && o.rating.canRate && !o.rating.value;
  const channel = o.preferredChannel ? (tp.has(`channels.${o.preferredChannel}`) ? tp(`channels.${o.preferredChannel}`) : o.preferredChannel) : "";
  async function call(kind: "audio" | "video") {
    if (calling) return;
    setCalling(kind);
    try {
      const c = await startCall(o.roomId, kind, o.serviceTitle || o.workId || "LexGo", { participantUserIds: o.lawyerUserId ? [o.lawyerUserId] : undefined });
      openLink({ appId: "", route: `/portal/chat/${encodeURIComponent(o.roomId)}?join=${encodeURIComponent(c.id)}` });
    } catch (e) {
      onError(errDetail(e) || t("callError"));
    } finally {
      setCalling("");
    }
  }
  async function download(url: string, name: string) {
    try {
      saveBlob(await getSecureMessageFileAt(url), name || "result");
    } catch {
      onError(tx("result.retry"));
    }
  }
  const facts: [string, string][] = [
    [t("seller"), o.lawyerName || "—"],
    [t("price"), money],
    ...(channel ? ([[t("channel"), channel]] as [string, string][]) : []),
    ...(o.preferredTime ? ([[t("time"), o.preferredTime]] as [string, string][]) : []),
    [t("created"), o.createdAt ? shortDateTime(o.createdAt, locale) : "—"],
    ...(o.expectedCompletedAt && stage === "active" ? ([[d("due"), shortDateTime(o.expectedCompletedAt, locale)]] as [string, string][]) : []),
  ];
  return (
    <aside className="dxcw-insp dxco-sheet" aria-label={o.serviceTitle}>
      <header>
        <span className="dxcw-ic is-big is-accent" aria-hidden>
          <IconTag />
        </span>
        <h2>{o.serviceTitle || o.packageTitle || "—"}</h2>
        <span className="dxcw-tags">
          <Tag tone={STAGE_TONE[stage]}>{t(`stage.${stage}`)}</Tag>
          {o.workId ? <code className="dxcw-code">{o.workId}</code> : null}
        </span>
      </header>
      {step >= 0 ? (
        <ol className="dxco-steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i < step || (i === 3 && step === 3) ? "is-done" : i === step ? "is-now" : ""}>
              <i aria-hidden>{i < step || (i === 3 && step === 3) ? <IconCheck /> : i + 1}</i>
              <span>{t(`steps.${s}`)}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {o.workPaused ? <Banner tone="warn" title={t("paused")}>{t("pausedHint")}</Banner> : null}
      {stage === "pending" ? <Banner tone="info" title={t("waitNote")} /> : null}
      {o.supplemental ? (
        <Banner tone={o.supplemental.status === "approved" ? "ok" : o.supplemental.status === "pending" ? "warn" : "info"} title={t("supplemental")}>
          {`${fmtUzs(o.supplemental.amount)} ${d("som")} · ${tx.has(`sup.${o.supplemental.status}`) ? tx(`sup.${o.supplemental.status}`) : o.supplemental.status}`}
        </Banner>
      ) : null}
      <dl>
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {o.selectedOptions.length ? (
        <section>
          <h3>{t("optionsTitle")}</h3>
          <ul className="dxco-opts">
            {o.selectedOptions.map((x) => (
              <li key={x.id}>
                <span>{x.label}</span>
                {x.amount ? <b>+{fmtUzs(x.amount)}</b> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {o.note ? (
        <section>
          <h3>{t("note")}</h3>
          <p>{o.note}</p>
        </section>
      ) : null}
      {stage === "completed" && (o.resultText || o.resultFiles.length) ? (
        <section>
          <h3>{tx("result.title")}</h3>
          {o.resultText ? <p>{o.resultText}</p> : null}
          {o.resultFiles.map((f) => (
            <button key={f.fileId || f.fileName} type="button" className="dxco-file" onClick={() => void download(f.downloadUrl, f.fileName)}>
              <IconFileText aria-hidden />
              <span>{f.fileName || "result"}</span>
              <IconDownload aria-hidden />
            </button>
          ))}
        </section>
      ) : null}
      {stage === "completed" && o.rating.value ? (
        <section>
          <h3>{tx("rating.title")}</h3>
          <StarsView value={o.rating.value} />
        </section>
      ) : null}
      <div className="dxcw-acts">
        {canRate ? (
          <Btn kind="primary" icon={<IconStarRate />} onClick={() => setRate(true)}>
            {tx("rating.title")}
          </Btn>
        ) : null}
        {o.canStartChat ? (
          <Btn kind={canRate ? "default" : "primary"} icon={<IconChat />} onClick={() => openLink({ appId: "", route: marketChatHref(o) })}>
            {t("openChat")}
          </Btn>
        ) : null}
        {canCall ? (
          <span className="dxco-call">
            <Btn icon={<IconPhone />} busy={calling === "audio"} onClick={() => void call("audio")}>
              {t("audio")}
            </Btn>
            <Btn icon={<IconVideo />} busy={calling === "video"} onClick={() => void call("video")}>
              {t("video")}
            </Btn>
          </span>
        ) : null}
        {o.canCancel && stage === "pending" ? (
          <Btn kind="danger" icon={<IconClose />} onClick={() => setCancel(true)}>
            {t("cancel")}
          </Btn>
        ) : null}
      </div>
      {cancel ? <CancelDialog o={o} onClose={() => setCancel(false)} onDone={() => (setCancel(false), onChanged(t("updated")))} /> : null}
      {rate ? <RateDialog o={o} onClose={() => setRate(false)} onDone={() => (setRate(false), onChanged(tx("rating.thanks")))} /> : null}
    </aside>
  );
}

function CancelDialog({ o, onClose, onDone }: { o: MarketOrder; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("marketplace.orders");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function run() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      await cancelMarketplaceOrder(o.id, reason.trim());
      onDone();
    } catch (e) {
      setErr(errDetail(e) || t("cancelError"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      title={t("cancelTitle")}
      onClose={() => !busy && onClose()}
      onSubmit={() => void run()}
      actions={
        <>
          <Btn onClick={onClose} disabled={busy}>
            {t("keep")}
          </Btn>
          <Btn kind="danger" type="submit" busy={busy}>
            {busy ? t("cancelling") : t("cancelConfirm")}
          </Btn>
        </>
      }
    >
      <p className="dx-dlg__text">{t("cancelLead")}</p>
      <Field label={t("reason")}>
        <TextArea value={reason} onChange={setReason} placeholder={t("reasonPh")} rows={3} maxLength={500} ariaLabel={t("reason")} />
      </Field>
      {err ? <Banner tone="err" title={err} /> : null}
    </Dialog>
  );
}

// Rating a finished order: open for a while after it is finished; one or
// two stars need a word on what went wrong, and become a complaint.
function RateDialog({ o, onClose, onDone }: { o: MarketOrder; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("marketplace.orderExtras");
  const tm = useTranslations("marketplace.errors");
  const d = useTranslations("portal.desk.client");
  const [value, setValue] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [closed, setClosed] = useState(false);
  const timed = o.rating.expiresAt > 0 || !!o.rating.deadlineAt;
  const now = useTick(timed, 1000);
  const left = timed && now ? ratingLeftMs(o.rating, now) : Infinity;
  const low = value > 0 && value <= 2;
  const mins = Number.isFinite(left) ? Math.max(0, Math.floor(left / 60000)) : 0;
  const secs = Number.isFinite(left) ? Math.max(0, Math.floor((left % 60000) / 1000)) : 0;
  async function send() {
    if (busy || !value || (low && !comment.trim())) return;
    setBusy(true);
    setErr("");
    try {
      await rateMarketplaceOrder(o, { rating: value, comment: comment.trim() });
      onDone();
    } catch (e) {
      const code = marketErrorCode(e);
      if (code === "rating_window_closed") setClosed(true);
      setErr(code && tm.has(code) ? tm(code) : errDetail(e) || t("rating.error"));
    } finally {
      setBusy(false);
    }
  }
  const over = closed || left <= 0;
  return (
    <Dialog
      open
      title={t("rating.title")}
      onClose={onClose}
      onSubmit={() => void send()}
      actions={
        <>
          <Btn onClick={onClose}>{d("cancel")}</Btn>
          <Btn kind="primary" type="submit" busy={busy} disabled={over || !value || (low && !comment.trim())}>
            {busy ? t("rating.sending") : t("rating.submit")}
          </Btn>
        </>
      }
    >
      <p className="dx-dlg__text">{t("rating.lead")}</p>
      {timed && Number.isFinite(left) ? <Banner tone={over ? "err" : "info"} title={over ? t("rating.closed") : `${t("rating.timeLeft")} ${mins}:${String(secs).padStart(2, "0")}`} /> : null}
      <StarPicker value={value} onChange={setValue} label={t("rating.title")} words={(n) => (t.has(`rating.labels.${n}`) ? t(`rating.labels.${n}`) : String(n))} />
      <Field label={low ? t("rating.lowLabel") : t("rating.commentLabel")} hint={low ? t("rating.lowHint") : undefined}>
        <TextArea value={comment} onChange={setComment} placeholder={low ? t("rating.lowPh") : t("rating.commentPh")} rows={3} maxLength={1000} ariaLabel={t("rating.commentLabel")} />
      </Field>
      {err ? <Banner tone="err" title={err} /> : null}
    </Dialog>
  );
}

