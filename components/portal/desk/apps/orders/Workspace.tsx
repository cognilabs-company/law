"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { errDetail, parseServerTime } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { saveBlob } from "@/lib/download";
import { shortDateTime } from "@/lib/date";
import { getSecureMessageFileAt, startCall } from "@/lib/services/backend";
import { marketChatHref, marketStageOf, type MarketOrder, type MarketPhase } from "@/lib/services/marketplace";
import type { Payout } from "@/lib/services/payouts";
import { normOrderChecklist, priceCapOf, requestCancellationReview, respondNegotiation, startMarketOrder, updateChecklistItem, type ChecklistItem, type ChecklistStatus, type MarketFileRef, type OrderChecklist } from "@/lib/services/marketRuntime";
import { useOrderDetail } from "@/components/marketplace/order/useOrderDetail";
import { useDurationText } from "@/components/marketplace/order/OrderFacts";
import { draftOf, itemProblems, mergeChecklistItem } from "@/components/marketplace/order/checklistRules";
import { negotiationActions, negotiationStateOf } from "@/components/marketplace/order/negotiationRules";
import { DOC_ACTION_KEY, docKindOf, docLeadKey, docRouteOf, needsRecordId, roomDocumentRecordId, templateOfRuntime } from "@/components/marketplace/order/docs";
import { ORDER_FILE_MB, uploadOrderFile, type UploadedFile } from "@/components/marketplace/order/upload";
import { useMarketError } from "@/components/marketplace/useMarketError";
import ChecklistStageGroup, { useFirstStageCheer } from "@/components/marketplace/order/ChecklistStageGroup";
import { firstStageMark, stageAmount, stageGroups, type StageGroup } from "@/components/marketplace/order/payStages";
import { useOrderPayouts } from "@/components/marketplace/order/useOrderPayouts";
import { IconAlert, IconChat, IconCheck, IconClipboardCheck, IconClock, IconClose, IconCoins, IconDownload, IconFileText, IconPaperclip, IconPause, IconPhone, IconRefresh, IconRocket, IconUser, IconVideo } from "@/components/icons";
import { Banner, Btn, Dialog, Empty, Field, Input, Loading, Progress, Seg, Tag, TextArea, useToast } from "../../kit/kit";
import type { NativeProps } from "../../native";
import { CompleteDialog, SupplementalDialog } from "./dialogs";

// Contract 2026-10-26 §4: at least 3 characters.
const CANCEL_REASON_MIN = 3;

// One order, everything that can be seen and done with it, by where it
// stands: an offer to answer, the work to start, the checklist to keep,
// the document, a request to cancel, the result. The order is read and
// kept fresh by the cabinet's own order hook; each step calls the same
// endpoints as the cabinet's order page.
export default function Workspace({ orderId, openApp, base, onChanged }: NativeProps & { orderId: string; onChanged: () => void }) {
  const t = useTranslations("marketplace.orderDetail");
  const to = useTranslations("marketplace.orders");
  const te = useTranslations("enums");
  const d = useTranslations("portal.desk.orders");
  const locale = useLocale();
  const det = useOrderDetail(orderId, "seller");
  const durationText = useDurationText();
  const [calling, setCalling] = useState<"" | "audio" | "video">("");
  const [completeOpen, setCompleteOpen] = useState(false);
  const [supOpen, setSupOpen] = useState(false);
  const [toast, say] = useToast();
  const o = det.order;
  const phase = det.phase;
  // The payout rows behind the checklist's 30% and 40% stages; re-read as
  // the checklist moves.
  const settled = det.checklist ? det.checklist.items.filter((i) => i.status !== "pending").length : 0;
  const firstDone = !!firstStageMark(det.checklist ? stageGroups(det.checklist.items, null) : [])?.complete;
  const pay = useOrderPayouts(orderId, `${o?.status}:${o?.paymentStatus}:${det.changed}:${settled}`, det.status === "ready" && !!o, firstDone && (phase === "in_progress" || phase === "review"));

  if (det.status === "loading" || (det.status === "ready" && !o)) return <div className="dxm-ws"><Loading label={t("loading")} /></div>;
  if (det.status === "missing") return <div className="dxm-ws"><Empty icon={<IconAlert />} title={t("missingTitle")} text={t("missingSeller")} /></div>;
  if (det.status === "error" || !o || !phase) return <div className="dxm-ws"><Empty icon={<IconAlert />} title={t("error")} action={<Btn onClick={() => det.refresh("all")}>{t("retry")}</Btn>} /></div>;

  const cur = (v: number) => `${fmtUzs(v)} ${!o.currency || o.currency === "UZS" ? te("currency") : o.currency}`;
  const stage = marketStageOf(o);
  const patch = (p?: Partial<MarketOrder>) => {
    det.patchOrder(p ?? {});
    onChanged();
  };
  const chat = o.canStartChat ? "open" : o.roomId && o.chatReadOnly ? "view" : "";
  const closed = phase === "completed" || phase === "rated" || phase === "cancelled";
  const calls = o.canCreateCall && o.callsAllowed && !closed;
  const supplemental = (phase === "paid" || phase === "in_progress") && !o.workPaused && !!(o.serviceId || o.packageId);
  const complete = o.canComplete && (phase === "in_progress" || (phase === "paid" && !o.canStart));
  const steps = ["request", "confirm", "work", "done"] as const;
  const stepAt = { pending: 1, active: 2, completed: 4, cancelled: -1 }[stage];
  const duration = durationText(o.duration ?? (det.runtime && det.runtime.duration.value > 0 ? det.runtime.duration : null));

  async function call(kind: "audio" | "video") {
    if (calling || !o?.roomId) return;
    setCalling(kind);
    try {
      const c = await startCall(o.roomId, kind, o.serviceTitle || o.workId || "LexGo", o.clientUserId ? { participantUserIds: [o.clientUserId] } : undefined);
      openApp("messages", `/portal/chat/${encodeURIComponent(o.roomId)}?join=${encodeURIComponent(c.id)}`);
    } catch (e) {
      say(errDetail(e) || to("callError"), "err");
    } finally {
      setCalling("");
    }
  }

  return (
    <article className="dxm-ws" aria-label={o.serviceTitle}>
      <header className="dxm-ws__h">
        <div className="dxm-ws__title">
          <span>
            {o.workId ? <code>{o.workId}</code> : null}
            <Tag tone={stage === "completed" ? "ok" : stage === "cancelled" ? "neutral" : phase === "review" ? "warn" : "accent"}>{t(`phase.${phase}`)}</Tag>
            {o.workPaused ? (
              <Tag tone="warn">
                <IconPause aria-hidden />
                {to("paused")}
              </Tag>
            ) : null}
          </span>
          <h2>{o.serviceTitle || o.packageTitle || "—"}</h2>
        </div>
        <b className="dxm-ws__price">{o.price ? cur(o.price) : "—"}</b>
        <Btn kind="plain" small icon={<IconRefresh />} title={t("refresh")} busy={det.refreshing} onClick={() => det.refresh("all")} />
      </header>
      {stage !== "cancelled" ? (
        <ol className="dxm-track" aria-label={to(`stage.${stage}`)}>
          {steps.map((s, i) => (
            <li key={s} className={i < stepAt ? "is-done" : i === stepAt ? "is-now" : ""}>
              <i>{i < stepAt ? <IconCheck /> : i + 1}</i>
              <span>{to(`steps.${s}`)}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {chat || calls || supplemental || complete ? (
        <div className="dxm-acts">
          {chat ? (
            <Btn kind={chat === "open" ? "primary" : "default"} icon={<IconChat />} onClick={() => openApp("messages", marketChatHref(o))}>
              {chat === "open" ? to("openChat") : t("actions.viewChat")}
            </Btn>
          ) : null}
          {calls ? (
            <>
              <Btn icon={<IconPhone />} busy={calling === "audio"} disabled={!!calling} onClick={() => void call("audio")}>
                {to("audio")}
              </Btn>
              <Btn icon={<IconVideo />} busy={calling === "video"} disabled={!!calling} onClick={() => void call("video")}>
                {to("video")}
              </Btn>
            </>
          ) : null}
          {supplemental ? (
            <Btn icon={<IconCoins />} onClick={() => setSupOpen(true)}>
              {to("supplemental")}
            </Btn>
          ) : null}
          {complete ? (
            <Btn kind="primary" icon={<IconCheck />} disabled={o.workPaused} title={o.workPaused ? to("pausedHint") : undefined} onClick={() => setCompleteOpen(true)}>
              {to("complete")}
            </Btn>
          ) : null}
        </div>
      ) : null}

      <div className="dxm-cols">
        <div className="dxm-main">
          {phase === "pending" ? <Negotiation o={o} phase={phase} cap={det.runtime ? priceCapOf(det.runtime.pricing) : null} cur={cur} onChanged={patch} /> : null}
          {phase === "pending" ? <Banner tone="info" title={to("waitNote")} /> : null}
          {phase === "paid" && o.canStart ? <StartWork o={o} duration={duration} onStarted={(r) => {
            det.patchOrder({ status: r.status || "in_progress", startedAt: r.startedAt, expectedCompletedAt: r.expectedCompletedAt, roomId: r.chat?.roomId || o.roomId, canStartChat: !!(r.chat?.roomId || o.roomId), canStart: false });
            if (r.checklist.length) det.setChecklist(normOrderChecklist(r.raw, o.id));
            det.refresh("all");
            onChanged();
          }} onRefresh={() => det.refresh("order")} /> : null}
          {phase === "in_progress" || phase === "review" ? <Checklist o={o} list={det.checklist} state={det.checklistState} payouts={pay.ready ? pay.rows : null} onChange={det.setChecklist} onRetry={() => det.refresh("checklist")} onStageDone={say} /> : null}
          {o.supplemental ? <SupplementalStatus o={o} cur={cur} /> : null}
          {phase === "completed" || phase === "rated" ? <Result o={o} /> : null}
          <Documents o={o} phase={phase} runtime={det.runtime} base={base} onOpen={(href) => openApp(href.includes("/chat/") ? "messages" : "documentRequests", href)} />
          {phase === "paid" || phase === "in_progress" || phase === "review" || o.cancellationReview ? <Cancellation o={o} phase={phase} onChanged={patch} openChat={(room) => openApp("messages", `/portal/chat/${room}`)} /> : null}
        </div>
        <aside className="dxm-facts" aria-label={t("facts.title")}>
          <h3>{t("facts.title")}</h3>
          <dl>
            {o.clientName ? <Fact label={t("facts.client")}><IconUser aria-hidden />{o.clientName}</Fact> : null}
            <Fact label={to("phone")}>{o.paymentStatus === "paid" && o.clientPhone ? <a href={`tel:${o.clientPhone.replace(/[^\d+]/g, "")}`}>{o.clientPhone}</a> : <span className="dxm-muted">{to("phoneHidden")}</span>}</Fact>
            <Fact label={t("facts.price")}>{o.price ? cur(o.price) : "—"}</Fact>
            {o.preferredChannel ? <Fact label={to("channel")}>{o.preferredChannel}</Fact> : null}
            {o.preferredTime ? <Fact label={to("time")}>{o.preferredTime}</Fact> : null}
            {o.createdAt ? <Fact label={t("facts.created")}>{shortDateTime(o.createdAt, locale)}</Fact> : null}
            {o.startedAt ? <Fact label={t("facts.started")}>{shortDateTime(o.startedAt, locale)}</Fact> : null}
            {o.expectedCompletedAt ? <Fact label={t("facts.due")}><IconClock aria-hidden />{shortDateTime(o.expectedCompletedAt, locale)}</Fact> : null}
            {o.completedAt ? <Fact label={t("facts.completed")}>{shortDateTime(o.completedAt, locale)}</Fact> : null}
            {duration ? <Fact label={t("facts.duration")}>{duration}</Fact> : null}
          </dl>
          {o.selectedOptions.length ? (
            <div className="dxm-opts">
              <b>{to("optionsTitle")}</b>
              {o.selectedOptions.map((x) => (
                <span key={x.id || x.label}>
                  {x.label}
                  {x.amount ? <em>+{cur(x.amount)}</em> : null}
                </span>
              ))}
            </div>
          ) : null}
          {o.note ? (
            <blockquote className="dxm-note">
              <b>{to("note")}</b>
              {o.note}
            </blockquote>
          ) : null}
          {!o.roomId && !closed ? <p className="dxm-muted">{d("noChatYet")}</p> : null}
        </aside>
      </div>

      <CompleteDialog
        open={completeOpen}
        o={o}
        checklist={det.checklist}
        onClose={() => setCompleteOpen(false)}
        onDone={(status, r) => {
          const at = r?.ratingDeadlineAt ? parseServerTime(r.ratingDeadlineAt) : Number.NaN;
          patch({ status, chatReadOnly: r?.chatReadOnly ?? true, callsAllowed: r?.callsAllowed ?? false, canComplete: false, canStartChat: false, canCreateCall: false, ...(r?.ratingDeadlineAt ? { rating: { ...o.rating, canRate: true, available: true, closed: false, deadlineAt: r.ratingDeadlineAt, expiresAt: Number.isFinite(at) ? at : 0 } } : {}) });
          say(to("updated"));
        }}
      />
      <SupplementalDialog
        open={supOpen}
        o={o}
        onClose={() => setSupOpen(false)}
        onSent={(s) => {
          patch(s ? { supplemental: s, workPaused: s.status === "pending" } : undefined);
          say(to("supplementalSent"));
        }}
      />
      {toast}
    </article>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Box({ title, lead, icon, children, end }: { title: string; lead?: string; icon?: ReactNode; children?: ReactNode; end?: ReactNode }) {
  return (
    <section className="dxm-box">
      <header>
        {icon ? <span className="dxm-box__ic">{icon}</span> : null}
        <h3>{title}</h3>
        {end}
      </header>
      {lead ? <p className="dxm-muted">{lead}</p> : null}
      {children}
    </section>
  );
}

// ── start the work ─────────────────────────────────────────────────────────
function StartWork({ o, duration, onStarted, onRefresh }: { o: MarketOrder; duration: string; onStarted: (r: Awaited<ReturnType<typeof startMarketOrder>>) => void; onRefresh: () => void }) {
  const t = useTranslations("marketplace.orderDetail.start");
  const marketErr = useMarketError();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function run() {
    setBusy(true);
    setErr("");
    try {
      const r = await startMarketOrder(o.id);
      setOpen(false);
      onStarted(r);
    } catch (e) {
      setErr(marketErr(e, t("error")));
      onRefresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Box title={t("title")} lead={t("lead")} icon={<IconRocket />}>
      {duration ? <p className="dxm-line">{t("duration", { duration })}</p> : null}
      <div>
        <Btn kind="primary" icon={<IconRocket />} onClick={() => setOpen(true)}>
          {t("button")}
        </Btn>
      </div>
      <Dialog
        open={open}
        title={t("confirmTitle")}
        onClose={() => !busy && setOpen(false)}
        onSubmit={() => void run()}
        width={420}
        actions={
          <>
            <Btn onClick={() => setOpen(false)} disabled={busy}>
              {t("keep")}
            </Btn>
            <Btn kind="primary" type="submit" busy={busy}>
              {t("confirm")}
            </Btn>
          </>
        }
      >
        <p className="dx-dlg__text">{t("lead")}</p>
        {duration ? <p className="dx-dlg__text">{t("duration", { duration })}</p> : null}
        {err ? <Banner tone="err" title={err} /> : null}
      </Dialog>
    </Box>
  );
}

// ── price negotiation (the seller answers) ──────────────────────────────────
function Negotiation({ o, phase, cap, cur, onChanged }: { o: MarketOrder; phase: MarketPhase; cap: number | null; cur: (v: number) => string; onChanged: (p?: Partial<MarketOrder>) => void }) {
  const t = useTranslations("marketplace.orderDetail.negotiation");
  const d = useTranslations("portal.desk.orders");
  const locale = useLocale();
  const marketErr = useMarketError();
  const n = o.negotiation;
  const [now, setNow] = useState(0);
  const [counter, setCounter] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    const h = setTimeout(() => setNow(Date.now()), 0);
    const iv = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      clearTimeout(h);
      clearInterval(iv);
    };
  }, []);
  if (!n || phase !== "pending") return null;
  const st = negotiationStateOf(n, now);
  async function respond(action: "accept" | "reject" | "counter") {
    if (busy || !n) return;
    setErr("");
    const value = Math.round(Number(amount.replace(/[^\d]/g, "")));
    if (action === "counter") {
      if (!value) return setErr(t("err.required"));
      if (cap !== null && value > cap) return setErr(t("err.aboveMax", { max: cur(cap) }));
    }
    setBusy(action);
    try {
      const r = await respondNegotiation(n.id, action === "counter" ? { action, amount: value, note: note.trim() || undefined } : { action });
      const merged = { ...n, ...r, id: r.id || n.id, status: r.status || (action === "accept" ? "accepted" : action === "reject" ? "rejected" : "countered"), counterAmount: r.counterAmount || (action === "counter" ? value : n.counterAmount) };
      onChanged({ negotiation: merged, ...(action === "accept" ? { price: merged.counterAmount || merged.amount } : {}) });
      setCounter(false);
    } catch (e) {
      setErr(marketErr(e, t("err.respond")));
    } finally {
      setBusy("");
    }
  }
  const expiresAt = n.expiresAt ? parseServerTime(n.expiresAt) : Number.NaN;
  const expires = Number.isFinite(expiresAt) ? d("answerUntil", { date: shortDateTime(new Date(expiresAt).toISOString(), locale) }) : "";
  return (
    <Box title={t("title")} lead={st === "proposed" ? t("leadSeller") : st === "countered" ? t("leadSellerDone") : undefined} icon={<IconCoins />} end={<Tag tone={st === "accepted" ? "ok" : st === "rejected" || st === "expired" ? "neutral" : "warn"}>{t(`state.${st === "none" ? "proposed" : st}`)}</Tag>}>
      <div className="dxm-offers">
        <div>
          <small>{t("currentPrice")}</small>
          <b>{o.price > 0 ? cur(o.price) : "—"}</b>
        </div>
        <div className="is-offer">
          <small>{t("clientOffer")}</small>
          <b>{n.amount ? cur(n.amount) : "—"}</b>
          {n.note ? <em>«{n.note}»</em> : null}
        </div>
        {n.counterAmount > 0 ? (
          <div>
            <small>{t("counterOffer")}</small>
            <b>{cur(n.counterAmount)}</b>
            {n.responseNote ? <em>«{n.responseNote}»</em> : null}
          </div>
        ) : null}
      </div>
      {expires && (st === "proposed" || st === "countered") ? (
        <p className="dxm-line">
          <IconClock aria-hidden />
          {expires}
        </p>
      ) : null}
      {st === "proposed" ? (
        counter ? (
          <div className="dxm-form">
            <Field label={t("counterLabel")} hint={cap !== null ? t("counterHint", { max: cur(cap) }) : t("counterHintNoMax")}>
              <Input value={amount} onChange={(v) => setAmount(v.replace(/[^\d ]/g, ""))} placeholder="0" />
            </Field>
            <Field label={t("responseNoteLabel")}>
              <TextArea value={note} onChange={setNote} rows={2} placeholder={t("responseNotePh")} maxLength={1000} />
            </Field>
            <div className="dxm-row-btns">
              <Btn kind="primary" busy={busy === "counter"} onClick={() => void respond("counter")}>
                {t("sendCounter")}
              </Btn>
              <Btn onClick={() => setCounter(false)}>{t("cancelCounter")}</Btn>
            </div>
          </div>
        ) : (
          <div className="dxm-row-btns">
            {negotiationActions(n).length === 0 || negotiationActions(n).includes("accept") ? (
              <Btn kind="primary" icon={<IconCheck />} busy={busy === "accept"} disabled={!!busy} onClick={() => void respond("accept")}>
                {t("accept")}
              </Btn>
            ) : null}
            <Btn icon={<IconCoins />} disabled={!!busy} onClick={() => setCounter(true)}>
              {t("counter")}
            </Btn>
            <Btn kind="danger" icon={<IconClose />} busy={busy === "reject"} disabled={!!busy} onClick={() => void respond("reject")}>
              {t("reject")}
            </Btn>
          </div>
        )
      ) : null}
      {err ? <Banner tone="err" title={err} /> : null}
    </Box>
  );
}

// ── checklist ─────────────────────────────────────────────────────────────
// The seller's list in its two payout stages: the 30% items first (paid the
// moment they are done), then the final 40% ones.
function Checklist({ o, list, state, payouts, onChange, onRetry, onStageDone }: { o: MarketOrder; list: OrderChecklist | null; state: string; payouts: readonly Payout[] | null; onChange: (c: OrderChecklist) => void; onRetry: () => void; onStageDone: (text: string) => void }) {
  const t = useTranslations("marketplace.orderDetail.checklist");
  const ts = useTranslations("marketplace.orderDetail.payStage");
  const d = useTranslations("portal.desk.orders");
  const [open, setOpen] = useState("");
  const groups = list ? stageGroups(list.items, payouts) : [];
  const celebrate = useFirstStageCheer(groups);
  const first = groups.find((g) => g.stage === "first_checklist");
  // Said once, as a toast too, when the last 30% item is done here.
  const cheerKey = celebrate && first ? `${first.state}:${first.payout?.amount ?? ""}` : "";
  const said = useRef("");
  useEffect(() => {
    if (!cheerKey || said.current === cheerKey || !first || first.state === "open") return;
    said.current = cheerKey;
    const amount = stageAmount(first);
    const share = amount !== null ? ts("shareWith", { percent: first.percent, amount: `${fmtUzs(amount)} ${ts("som")}` }) : ts("share", { percent: first.percent });
    onStageDone(ts(`cheer.first_checklist.${first.state}.title`, { share, percent: first.percent }));
  }, [cheerKey, first, onStageDone, ts]);
  if (state === "loading" && !list) return <Box title={t("title")} icon={<IconClipboardCheck />}><Loading label={t("loading")} /></Box>;
  if (state === "error") return <Box title={t("title")} icon={<IconClipboardCheck />}><Banner tone="err" title={t("error")} action={<Btn small onClick={onRetry}>{d("retry")}</Btn>} /></Box>;
  if (!list || !list.items.length) return state === "none" ? <Box title={t("title")} icon={<IconClipboardCheck />} lead={t("empty")} /> : null;
  const p = list.progress;
  const rows = (g: StageGroup) => (
    <ul className="dxm-cl">
      {g.items.map((it) => (
        <li key={it.id} className={`is-${it.status}`}>
          <div className="dxm-cl__row">
            <i aria-hidden>{it.status === "done" ? <IconCheck /> : it.status === "skipped_with_reason" ? <IconClose /> : null}</i>
            <span className="dxm-cl__t">
              <b>{it.title}</b>
              {it.description ? <small>{it.description}</small> : null}
              <span className="dxm-cl__marks">
                {it.required ? <Tag tone="warn">{t("mark.required")}</Tag> : null}
                {it.commentRequired ? <Tag>{t("mark.comment")}</Tag> : null}
                {it.fileRequired ? <Tag>{t("mark.file")}</Tag> : null}
                <Tag tone={it.status === "done" ? "ok" : it.status === "skipped_with_reason" ? "neutral" : "info"}>{t(`status.${it.status}`)}</Tag>
              </span>
              {it.comment ? <q>{it.comment}</q> : null}
              {it.files.length ? (
                <span className="dxm-files">
                  {it.files.map((f) => (
                    <ItemFile key={f.id || f.url} f={f} />
                  ))}
                </span>
              ) : null}
            </span>
            <Btn small onClick={() => setOpen(open === it.id ? "" : it.id)}>
              {t("edit")}
            </Btn>
          </div>
          {open === it.id ? <ItemEditor o={o} item={it} list={list} onSaved={(next) => (onChange(next), setOpen(""))} onCancel={() => setOpen("")} /> : null}
        </li>
      ))}
    </ul>
  );
  return (
    <Box title={t("title")} lead={t("leadSeller")} icon={<IconClipboardCheck />} end={<Tag tone={p.done === p.total ? "ok" : "accent"}>{t("progress", { done: p.done, total: p.total })}</Tag>}>
      <Progress value={p.percent || (p.total ? (p.done / p.total) * 100 : 0)} label={t("progressLabel")} />
      {groups.map((g) => (
        <ChecklistStageGroup key={g.stage} group={g} idBase={`dxm-stage-${o.id}-${g.stage}`} celebrate={celebrate && g.stage === "first_checklist"} ai={`desk.orders.checklist.${g.stage}`}>
          {rows(g)}
        </ChecklistStageGroup>
      ))}
    </Box>
  );
}

function ItemFile({ f }: { f: MarketFileRef }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="dxm-file"
      disabled={busy || !f.url}
      onClick={async () => {
        setBusy(true);
        try {
          saveBlob(await getSecureMessageFileAt(f.url), f.name || "file");
        } catch {
          /* the file stays in the chat */
        } finally {
          setBusy(false);
        }
      }}
    >
      <IconPaperclip aria-hidden />
      {f.name || "file"}
      <IconDownload aria-hidden />
    </button>
  );
}

function ItemEditor({ o, item, list, onSaved, onCancel }: { o: MarketOrder; item: ChecklistItem; list: OrderChecklist; onSaved: (c: OrderChecklist) => void; onCancel: () => void }) {
  const t = useTranslations("marketplace.orderDetail.checklist");
  const d = useTranslations("portal.desk.orders");
  const tc = useTranslations("marketplace.complete");
  const marketErr = useMarketError();
  const [draft, setDraft] = useState(() => draftOf(item));
  const [adds, setAdds] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pick = useRef<HTMLInputElement>(null);
  const done = draft.status === "done";
  const skip = draft.status === "skipped_with_reason";
  async function save() {
    const planned = { ...draft, files: [...draft.files, ...adds.map((f) => ({ id: "", name: f.name, url: "" }))] };
    const problems = itemProblems(item, planned);
    if (problems.length) return setErr(problems.includes("reason") ? t("needReason") : problems.includes("comment") ? t("needComment") : t("needFile"));
    setBusy(true);
    setErr("");
    try {
      const uploaded: UploadedFile[] = [];
      if (done) for (const f of adds) uploaded.push(await uploadOrderFile(o.roomId, f, tc("caption")));
      const files = done ? [...draft.files, ...uploaded] : [];
      const comment = draft.comment.trim();
      const r = await updateChecklistItem(o.id, item.id, { status: draft.status, comment, files: files.map(({ id, name }) => ({ id, name })) });
      const local: ChecklistItem = { ...item, status: draft.status, statusRaw: draft.status, comment, files: files.map((f) => ({ id: f.id, name: f.name, url: f.url })), raw: { id: item.id, status: draft.status, comment, files } };
      onSaved(r.checklist ?? mergeChecklistItem(list, r.item ?? local));
    } catch (e) {
      setErr(marketErr(e, t("saveError")));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="dxm-cl__edit">
      <Seg
        label={t("statusLabel")}
        small
        value={draft.status}
        onChange={(s: ChecklistStatus) => setDraft((x) => ({ ...x, status: s }))}
        items={[
          { id: "done" as ChecklistStatus, label: t("opt.done") },
          { id: "skipped_with_reason" as ChecklistStatus, label: t("opt.skip") },
          { id: "pending" as ChecklistStatus, label: t("opt.pending") },
        ]}
      />
      <Field label={skip ? t("reason") : item.commentRequired && done ? t("commentRequired") : t("comment")}>
        <TextArea value={draft.comment} onChange={(v) => setDraft((x) => ({ ...x, comment: v }))} rows={3} placeholder={skip ? t("reasonPh") : t("commentPh")} maxLength={2000} />
      </Field>
      {done ? (
        <Field label={item.fileRequired ? t("filesRequired") : t("files")} hint={o.roomId ? t("filesHint", { mb: ORDER_FILE_MB }) : t("noRoom")}>
          <span className="dxm-files">
            {draft.files.map((f) => (
              <span key={f.id} className="dxm-file is-static">
                <IconPaperclip aria-hidden />
                {f.name}
                <button type="button" onClick={() => setDraft((x) => ({ ...x, files: x.files.filter((y) => y.id !== f.id) }))} aria-label={d("removeFile", { name: f.name })}>
                  <IconClose />
                </button>
              </span>
            ))}
            {adds.map((f, i) => (
              <span key={`${f.name}-${i}`} className="dxm-file is-static is-new">
                <IconPaperclip aria-hidden />
                {f.name}
                <button type="button" onClick={() => setAdds((l) => l.filter((_, k) => k !== i))} aria-label={d("removeFile", { name: f.name })}>
                  <IconClose />
                </button>
              </span>
            ))}
            {o.roomId ? (
              <Btn small icon={<IconPaperclip />} onClick={() => pick.current?.click()}>
                {t("attach")}
              </Btn>
            ) : null}
          </span>
          <input ref={pick} type="file" multiple hidden onChange={(e) => (setAdds((l) => [...l, ...[...(e.target.files ?? [])].filter((f) => f.size <= ORDER_FILE_MB * 1048576)]), (e.target.value = ""))} />
        </Field>
      ) : null}
      {err ? <Banner tone="err" title={err} /> : null}
      <div className="dxm-row-btns">
        <Btn kind="primary" busy={busy} onClick={() => void save()}>
          {t("save")}
        </Btn>
        <Btn onClick={onCancel} disabled={busy}>
          {d("cancel")}
        </Btn>
      </div>
    </div>
  );
}

// ── the document of this service ───────────────────────────────────────────
function Documents({ o, phase, runtime, base, onOpen }: { o: MarketOrder; phase: MarketPhase; runtime: Parameters<typeof templateOfRuntime>[0]; base: string; onOpen: (href: string) => void }) {
  const t = useTranslations("marketplace.orderDetail.docs");
  const template = templateOfRuntime(runtime);
  const sellerRole = base.includes("/lawyer") ? "lawyer" : "advocate";
  const kind = template ? docKindOf(template) : "unknown";
  const modeOn = !!template && (template.mode === "required" || template.mode === "optional");
  const want = modeOn && phase !== "cancelled" && needsRecordId(kind, "seller", o.roomId);
  const [record, setRecord] = useState<{ room: string; id: string } | null>(null);
  useEffect(() => {
    if (!want) return;
    const c = new AbortController();
    roomDocumentRecordId(o.roomId, c.signal).then((id) => !c.signal.aborted && setRecord({ room: o.roomId, id }));
    return () => c.abort();
  }, [want, o.roomId]);
  if (!template || phase === "cancelled") return null;
  const known = record && record.room === o.roomId ? record.id : "";
  const route = docRouteOf({ template, view: "seller", sellerRole, serviceId: o.serviceId, roomId: o.roomId, recordId: known, workId: o.workId, serviceTitle: o.serviceTitle });
  if (!route) return null;
  const key = DOC_ACTION_KEY[route.action];
  return (
    <Box title={t("title")} icon={<IconFileText />} end={<Tag tone={route.mode === "required" ? "warn" : "neutral"}>{route.mode === "required" ? t("required") : t("optional")}</Tag>}>
      <p className="dxm-line">{t(docLeadKey(route.kind, "seller", route.action))}</p>
      {key ? (
        <div>
          <Btn kind={route.mode === "required" ? "primary" : "default"} icon={<IconFileText />} busy={want && !known} onClick={() => onOpen(route.href)}>
            {t(key)}
          </Btn>
        </div>
      ) : null}
    </Box>
  );
}

// ── asking to cancel, and the decision ─────────────────────────────────────
function Cancellation({ o, phase, onChanged, openChat }: { o: MarketOrder; phase: MarketPhase; onChanged: (p?: Partial<MarketOrder>) => void; openChat: (room: string) => void }) {
  const t = useTranslations("marketplace.orderDetail.cancel");
  const te = useTranslations("enums");
  const locale = useLocale();
  const marketErr = useMarketError();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const review = o.cancellationReview;
  const resolved = !!review && (!!review.action || !!review.resolvedAt || /resolv|closed|done/.test(review.status));
  async function send() {
    if (text.trim().length < CANCEL_REASON_MIN) return setErr(t("reasonShort", { n: CANCEL_REASON_MIN }));
    setBusy(true);
    setErr("");
    try {
      const r = await requestCancellationReview(o.id, text);
      onChanged({ status: "cancellation_review", cancellationReview: { ...r, orderId: r.orderId || o.id, reason: r.reason || text, status: r.status || "open" }, deadlinePaused: true });
      setOpen(false);
      setText("");
    } catch (e) {
      setErr(marketErr(e, t("error")));
    } finally {
      setBusy(false);
    }
  }
  if (review && !resolved)
    return (
      <Box title={t("reviewTitle")} icon={<IconAlert />}>
        <p className="dxm-line">{t("reviewSeller")}</p>
        {review.reason ? (
          <blockquote className="dxm-note">
            <b>{t("reviewReason")}</b>
            {review.reason}
          </blockquote>
        ) : null}
        {review.createdAt ? <p className="dxm-muted">{t("reviewSent", { date: shortDateTime(review.createdAt, locale) })}</p> : null}
      </Box>
    );
  if (review && resolved)
    return (
      <Box title={t("resolvedTitle")} icon={<IconCheck />}>
        {review.amount ? <p className="dxm-line">{t("newPrice", { price: `${fmtUzs(review.amount)} ${te("currency")}` })}</p> : null}
        {review.note ? (
          <blockquote className="dxm-note">
            <b>{t("resolvedNote")}</b>
            {review.note}
          </blockquote>
        ) : null}
        {review.groupChatRoomId && review.groupChatRoomId !== o.roomId ? (
          <div>
            <Btn icon={<IconChat />} onClick={() => openChat(review.groupChatRoomId)}>
              {t("openGroupChat")}
            </Btn>
          </div>
        ) : null}
      </Box>
    );
  if (!(phase === "paid" || phase === "in_progress")) return null;
  return (
    <Box title={t("problemTitle")} lead={t("problemLead")} icon={<IconAlert />}>
      <div>
        <Btn kind="danger" onClick={() => setOpen(true)}>
          {t("request")}
        </Btn>
      </div>
      <Dialog
        open={open}
        title={t("dialogTitle")}
        onClose={() => !busy && setOpen(false)}
        onSubmit={() => void send()}
        width={480}
        actions={
          <>
            <Btn onClick={() => setOpen(false)} disabled={busy}>
              {t("keep")}
            </Btn>
            <Btn kind="danger" type="submit" busy={busy}>
              {t("submit")}
            </Btn>
          </>
        }
      >
        <p className="dx-dlg__text">{t("dialogLead")}</p>
        <Field label={t("reason")} error={err || undefined} hint={`${text.trim().length}/${CANCEL_REASON_MIN}+`}>
          <TextArea value={text} onChange={setText} rows={5} placeholder={t("reasonPh")} maxLength={2000} />
        </Field>
      </Dialog>
    </Box>
  );
}

function SupplementalStatus({ o, cur }: { o: MarketOrder; cur: (v: number) => string }) {
  const t = useTranslations("marketplace.supplemental");
  const d = useTranslations("portal.desk.orders");
  const s = o.supplemental;
  if (!s) return null;
  return (
    <Box title={t("title")} icon={<IconCoins />} end={<Tag tone={s.status === "approved" ? "ok" : s.status === "pending" ? "warn" : "neutral"}>{d(`sup.${s.status}`)}</Tag>}>
      <div className="dxm-offers">
        <div>
          <small>{d("supAmount")}</small>
          <b>{cur(s.amount)}</b>
        </div>
        <div>
          <small>{t("newTotal")}</small>
          <b>{cur(s.newTotal)}</b>
        </div>
      </div>
      {s.options.length ? <p className="dxm-line">{s.options.map((x) => x.label).join(" · ")}</p> : null}
      {s.note ? <q className="dxm-q">{s.note}</q> : null}
    </Box>
  );
}

function Result({ o }: { o: MarketOrder }) {
  const d = useTranslations("portal.desk.orders");
  if (!o.resultText && !o.resultFiles.length) return null;
  return (
    <Box title={d("result")} icon={<IconCheck />}>
      {o.resultText ? <p className="dxm-result">{o.resultText}</p> : null}
      {o.resultFiles.length ? (
        <span className="dxm-files">
          {o.resultFiles.map((f) => (
            <ItemFile key={f.fileId || f.downloadUrl} f={{ id: f.fileId, name: f.fileName, url: f.downloadUrl }} />
          ))}
        </span>
      ) : null}
    </Box>
  );
}

