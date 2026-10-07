"use client";

import { useEffect, useId, useRef, useState, type ComponentType, type SVGProps } from "react";
import { useTranslations } from "next-intl";
import { aiId } from "@/lib/ai/ids";
import { useAiField } from "@/lib/ai/registry";
import { isRouteMissing } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { isPriorPurchaseRequired, urgentChannels, urgentMinutes, urgentPrice, type UrgentService } from "@/lib/services/backend";
import {
  ASSIST_URGENT_DIRECTIONS,
  ASSIST_URGENT_GROUP,
  ASSIST_URGENT_KINDS,
  ASSIST_URGENT_NEED_MIN,
  assistUrgentDuplicateOf,
  assistUrgentFallback,
  assistUrgentFieldErrors,
  createAssistUrgentRequest,
  isAssistUrgentKind,
  loadAssistUrgentCatalog,
  mergeAssistLive,
  pickPayPhase,
  urgentPayPhase,
  type AssistLive,
  type AssistPayPhase,
  type AssistUrgentCatalog,
  type AssistUrgentField,
  type AssistUrgentKind,
  type AssistUrgentResult,
} from "@/lib/services/supportAssist";
import {
  IconAlert,
  IconBolt,
  IconChatConsult,
  IconCheck,
  IconExpressCall,
  IconHourglass,
  IconLock,
  IconMinus,
  IconOpinionPanel,
  IconPlus,
  IconSecondOpinion,
  IconTrafficCase,
  IconVideoConsult,
} from "@/components/icons";
import { AssistNote, ConfirmModal, InfoList, PayState, ResultCard, StatusChip, assistErrorText, clientLine, sumText, useAssistLive, type AssistSectionProps, type InfoRow } from "./bits";

export type AssistUrgentState = "open" | "soon" | "checking";

type Bad = Partial<Record<AssistUrgentField, string>>;

const KIND_ICON: Record<AssistUrgentKind, ComponentType<SVGProps<SVGSVGElement>>> = {
  video_consultation: IconVideoConsult,
  express_video_consultation: IconExpressCall,
  traffic_accident_consultation: IconTrafficCase,
  chat_consultation: IconChatConsult,
  second_opinion_single: IconSecondOpinion,
  second_opinion_group: IconOpinionPanel,
};

const NEED_MAX = 4000;
const NEED_PREVIEW = 280;
const FALLBACK = assistUrgentFallback();

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function fromPrice(s: UrgentService | undefined): number {
  if (!s) return 0;
  const prices = urgentChannels(s)
    .map((c) => urgentPrice(s, c, 1))
    .filter((p) => p > 0);
  return prices.length ? Math.min(...prices) : 0;
}

export default function AssistUrgent({ ticketId, client, clientName, onDone, onBlock, state }: AssistSectionProps & { state: AssistUrgentState }) {
  const t = useTranslations("support.assist");
  const tc = useTranslations("common");
  const tu = useTranslations("portal.client.urgent");
  const te = useTranslations("enums");
  const uid = useId();
  const open = state === "open";
  const [cat, setCat] = useState<AssistUrgentCatalog | null>(null);
  const [kind, setKind] = useState<AssistUrgentKind | "">("");
  const [channelPref, setChannelPref] = useState("video");
  const [count, setCount] = useState(3);
  const [dirs, setDirs] = useState<string[]>([]);
  const [need, setNeed] = useState("");
  const [bad, setBad] = useState<Bad>({});
  const [confirming, setConfirming] = useState(false);
  const [confirmErr, setConfirmErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<AssistUrgentResult | null>(null);
  const [live, setLive] = useState<AssistLive | null>(null);
  const inflight = useRef(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void loadAssistUrgentCatalog().then((c) => {
      if (alive) setCat(c);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  useAssistLive(sent ? [sent.id, sent.workId] : [], (e) => setLive((cur) => mergeAssistLive(cur, e)));

  const catalog = cat ?? FALLBACK;
  const svc = kind ? catalog.services.find((s) => s.key === kind) : undefined;
  const channels = urgentChannels(svc);
  const channel = channels.includes(channelPref) ? channelPref : channels[0] || "video";
  const group = kind === ASSIST_URGENT_GROUP;
  const min = svc?.lawyerCountMin || 2;
  const max = svc?.lawyerCountMax || 7;
  const lawyers = Math.min(max, Math.max(min, count));
  const price = svc && catalog.priced ? urgentPrice(svc, channel, group ? lawyers : 1) : 0;
  const minutes = svc ? urgentMinutes(svc, channel) : 0;
  const ai = (...parts: string[]) => aiId("call_center.support.ticket", ticketId, "assist", "urgent-advokat", ...parts);
  const kindLabel = (k: string) => (tu.has(`kinds.${k}`) ? tu(`kinds.${k}`) : k);
  const chLabel = (c: string) => (c === "video" ? tu("chVideo") : c === "chat" ? tu("chChat") : c);
  const dirLabel = (d: { slug: string; area: string }) => (te.has(`areas.${d.area}`) ? te(`areas.${d.area}`) : d.slug);
  const ChosenIcon = KIND_ICON[kind || "video_consultation"];

  const kindMeta = (k: AssistUrgentKind) => {
    const s = catalog.services.find((x) => x.key === k);
    const chans = urgentChannels(s);
    const from = catalog.priced ? fromPrice(s) : 0;
    const priceText = !from
      ? ""
      : k === ASSIST_URGENT_GROUP
        ? tu("fromPerLawyer", { price: fmtUzs(from) })
        : chans.length > 1
          ? tu("from", { price: fmtUzs(from) })
          : sumText(t, from);
    return (
      <small className="sasst__ometa">
        <span>{[chans.map(chLabel).join(" · "), priceText].filter(Boolean).join(" · ")}</span>
        {s?.immediateCall ? (
          <span className="sasst__otag">
            <IconBolt aria-hidden="true" />
            {tu("immediate")}
          </span>
        ) : null}
        {s?.requiresPriorPurchase ? (
          <span className="sasst__otag sasst__otag--lock">
            <IconLock aria-hidden="true" />
            {tu("priorPurchaseShort")}
          </span>
        ) : null}
      </small>
    );
  };

  const dropBad = (...fields: AssistUrgentField[]) =>
    setBad((b) => (fields.some((f) => b[f]) ? (Object.fromEntries(Object.entries(b).filter(([f]) => !fields.some((x) => x === f))) as Bad) : b));

  function pickKind(k: AssistUrgentKind) {
    setKind(k);
    dropBad("kind", "channel", "count");
    if (k === ASSIST_URGENT_GROUP) setCount((n) => Math.max(n, 3));
  }

  function toggleDir(slug: string) {
    setDirs((cur) => (cur.includes(slug) ? cur.filter((x) => x !== slug) : [...cur, slug]));
    dropBad("directions");
  }

  useAiField(open ? ai("need") : "", {
    get: () => need,
    set: (value) => {
      setNeed(value.slice(0, NEED_MAX));
      if (value.trim().length >= ASSIST_URGENT_NEED_MIN) dropBad("need");
    },
    sensitive: true,
    fillable: true,
    disabled: busy,
  });
  useAiField(open ? ai("kind") : "", {
    get: () => kind,
    set: (value) => {
      const w = value.trim().toLowerCase();
      const key = w.replace(/[\s-]+/g, "_");
      const hit = isAssistUrgentKind(key) ? key : ASSIST_URGENT_KINDS.find((k) => kindLabel(k).toLowerCase() === w);
      if (hit) pickKind(hit);
    },
    disabled: busy,
  });

  function review() {
    if (busy) return;
    const next: Bad = {};
    if (!svc) next.kind = t("urgent.pickKind");
    if (!dirs.length) next.directions = t("urgent.missDirection");
    if (need.trim().length < ASSIST_URGENT_NEED_MIN) next.need = t("urgent.missNeed", { n: ASSIST_URGENT_NEED_MIN });
    setBad(next);
    const first = next.kind ? "kind" : next.directions ? "dirs" : next.need ? "need" : "";
    if (first) {
      document.getElementById(`${uid}-${first}`)?.focus();
      return;
    }
    setConfirmErr("");
    setConfirming(true);
  }

  const errorOf = (e: unknown) => {
    const dup = assistUrgentDuplicateOf(e);
    if (dup) return dup.workId ? t("errors.urgentDuplicate", { id: dup.workId }) : t("errors.urgentDuplicatePlain");
    if (isPriorPurchaseRequired(e)) return t("errors.priorPurchase");
    return assistErrorText(e, t, tc);
  };

  async function submit() {
    if (!svc || !kind || inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setConfirmErr("");
    try {
      const r = await createAssistUrgentRequest(ticketId, { serviceKind: kind, channel, need, directions: dirs, lawyerCount: group ? lawyers : undefined });
      setSent({ ...r, serviceKind: r.serviceKind || kind, channel: r.channel || channel, amount: r.amount || price });
      setLive(null);
      setConfirming(false);
      setKind("");
      setChannelPref("video");
      setCount(3);
      setDirs([]);
      setNeed("");
      setBad({});
      onDone();
    } catch (e) {
      const fields = assistUrgentFieldErrors(e);
      if (isRouteMissing(e) || onBlock(e)) {
        setConfirming(false);
      } else if (Object.keys(fields).length) {
        setBad(fields);
        setConfirming(false);
      } else {
        setConfirmErr(errorOf(e));
      }
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  const confirmRows: InfoRow[] = svc
    ? [
        { key: "client", label: t("confirm.client"), value: clientLine(t, client, clientName) },
        { key: "kind", label: t("urgent.kind"), value: kindLabel(svc.key) },
        { key: "channel", label: t("urgent.channel"), value: chLabel(channel) },
        ...(group ? [{ key: "count", label: t("urgent.count"), value: String(lawyers) }] : []),
        {
          key: "dirs",
          label: t("urgent.directions"),
          value: ASSIST_URGENT_DIRECTIONS.filter((d) => dirs.includes(d.slug))
            .map(dirLabel)
            .join(", "),
        },
        { key: "need", label: t("urgent.need"), value: clip(need.trim(), NEED_PREVIEW) },
        ...(price > 0 ? [{ key: "price", label: t("urgent.price"), value: sumText(t, price) }] : []),
      ]
    : [];

  const basePhase: AssistPayPhase = sent ? urgentPayPhase(sent) : "";
  const phase: AssistPayPhase = sent ? pickPayPhase(live?.phase ?? "", basePhase) : "";
  const urgentStatus = sent ? live?.status || sent.status : "";
  const sentRows: InfoRow[] = sent
    ? [
        sent.workId
          ? { key: "work", label: t("result.workId"), value: <span className="sasst__wid">{sent.workId}</span> }
          : { key: "req", label: t("result.requestId"), value: sent.id || "—" },
        ...(sent.serviceKind ? [{ key: "kind", label: t("urgent.kind"), value: kindLabel(sent.serviceKind) }] : []),
        ...(urgentStatus ? [{ key: "status", label: t("result.status"), value: <StatusChip status={urgentStatus} /> }] : []),
        ...(sent.lawyerName ? [{ key: "lawyer", label: t("urgent.lawyer"), value: sent.lawyerName }] : []),
        ...(!phase && sent.amount > 0 ? [{ key: "amount", label: t("urgent.price"), value: sumText(t, sent.amount, sent.currency) }] : []),
      ]
    : [];

  if (state === "soon") {
    return (
      <div className="sasst__secin">
        <AssistNote icon={<IconHourglass />} title={t("urgent.soonTitle")} text={t("urgent.soonText")} />
      </div>
    );
  }
  if (state === "checking") {
    return (
      <p className="sasst__muted" aria-live="polite">
        {t("urgent.checking")}
      </p>
    );
  }

  const kindBad = bad.kind || (channels.length <= 1 ? bad.channel : "") || (!group ? bad.count : "");

  return (
    <div className="sasst__secin">
      <h4 className="sasst__h4">{t("urgent.heading")}</h4>
      <p className="sasst__lead">{t("urgent.lead")}</p>
      {sent ? (
        <ResultCard
          title={t("urgent.sentTitle")}
          rows={sentRows}
          warn={phase === "rejected"}
          onDismiss={() => setSent(null)}
          note={
            <>
              {sent.clientNotified !== false ? (
                <span className="sasst__ok">
                  <IconCheck aria-hidden="true" />
                  {t("result.notified")}
                </span>
              ) : null}
              <span>{phase === "rejected" ? t("pay.rejectedNote") : sent.immediateCall ? t("urgent.callNote") : t("urgent.poolNote")}</span>
            </>
          }
        >
          <PayState phase={phase} amount={sent.gate?.amount || sent.amount} currency={sent.gate?.currency || sent.currency} />
        </ResultCard>
      ) : null}

      <div className="sasst__f" data-ai-id={ai("kind")} data-ai-type="select" data-ai-label={t("urgent.kind")}>
        <span className="sasst__lbl" id={`${uid}-kind-l`}>
          {t("urgent.kind")}
        </span>
        {kind && svc ? (
          <div className="sasst__chosen">
            <span className="sasst__oic" aria-hidden="true">
              <ChosenIcon />
            </span>
            <span>
              <b>{kindLabel(kind)}</b>
              {kindMeta(kind)}
            </span>
            <button type="button" className="sasst__link" onClick={() => setKind("")} disabled={busy} data-ai-id={ai("kind", "change")}>
              {t("doc.change")}
            </button>
          </div>
        ) : (
          <ul id={`${uid}-kind`} tabIndex={-1} className={`sasst__pick sasst__pick--all${kindBad ? " is-bad" : ""}`} aria-labelledby={`${uid}-kind-l`}>
            {ASSIST_URGENT_KINDS.map((k) => {
              const Icon = KIND_ICON[k];
              return (
                <li key={k}>
                  <button type="button" className="sasst__opt" onClick={() => pickKind(k)} disabled={busy} data-ai-id={ai("kind", k)}>
                    <span className="sasst__oic" aria-hidden="true">
                      <Icon />
                    </span>
                    <span>
                      <b>{kindLabel(k)}</b>
                      {kindMeta(k)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {kindBad ? (
          <p className="sasst__ferr" role="alert">
            <IconAlert aria-hidden="true" />
            {kindBad}
          </p>
        ) : svc && tu.has(`about.${svc.key}`) ? (
          <small className="sasst__hint">{tu(`about.${svc.key}`)}</small>
        ) : null}
      </div>

      {svc && channels.length > 1 ? (
        <div className="sasst__f">
          <span className="sasst__lbl" id={`${uid}-ch`}>
            {t("urgent.channel")}
          </span>
          <div className={`sasst__chips${bad.channel ? " is-bad" : ""}`} role="group" aria-labelledby={`${uid}-ch`}>
            {channels.map((c) => (
              <button
                key={c}
                type="button"
                className="supchip"
                aria-pressed={channel === c}
                onClick={() => {
                  setChannelPref(c);
                  dropBad("channel");
                }}
                disabled={busy}
                data-ai-id={ai("channel", c)}
              >
                {chLabel(c)}
              </button>
            ))}
          </div>
          {bad.channel ? (
            <p className="sasst__ferr" role="alert">
              <IconAlert aria-hidden="true" />
              {bad.channel}
            </p>
          ) : null}
        </div>
      ) : null}

      {group ? (
        <div className="sasst__f">
          <span className="sasst__lbl" id={`${uid}-n`}>
            {t("urgent.count")}
          </span>
          <div className="sasst__count" role="group" aria-labelledby={`${uid}-n`}>
            <button
              type="button"
              className="btn btn--line btn--sm"
              onClick={() => {
                setCount(Math.max(min, lawyers - 1));
                dropBad("count");
              }}
              disabled={busy || lawyers <= min}
              aria-label={tu("less")}
              title={tu("less")}
            >
              <IconMinus />
            </button>
            <b aria-live="polite">{lawyers}</b>
            <button
              type="button"
              className="btn btn--line btn--sm"
              onClick={() => {
                setCount(Math.min(max, lawyers + 1));
                dropBad("count");
              }}
              disabled={busy || lawyers >= max}
              aria-label={tu("more")}
              title={tu("more")}
            >
              <IconPlus />
            </button>
            <small>{tu("lawyerRange", { min, max })}</small>
          </div>
          {bad.count ? (
            <p className="sasst__ferr" role="alert">
              <IconAlert aria-hidden="true" />
              {bad.count}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="sasst__f">
        <span className="sasst__lbl" id={`${uid}-dirs-l`}>
          {t("urgent.directions")}
        </span>
        <div
          id={`${uid}-dirs`}
          tabIndex={-1}
          className={`sasst__chips${bad.directions ? " is-bad" : ""}`}
          role="group"
          aria-labelledby={`${uid}-dirs-l`}
          aria-describedby={bad.directions ? `${uid}-dirs-bad` : undefined}
          data-ai-id={ai("directions")}
          data-ai-label={t("urgent.directions")}
        >
          {ASSIST_URGENT_DIRECTIONS.map((d) => (
            <button key={d.slug} type="button" className="supchip" aria-pressed={dirs.includes(d.slug)} onClick={() => toggleDir(d.slug)} disabled={busy} data-ai-id={ai("directions", d.slug)}>
              {dirLabel(d)}
            </button>
          ))}
        </div>
        {bad.directions ? (
          <p className="sasst__ferr" id={`${uid}-dirs-bad`} role="alert">
            <IconAlert aria-hidden="true" />
            {bad.directions}
          </p>
        ) : (
          <small className="sasst__hint">{t("urgent.directionsHint")}</small>
        )}
      </div>

      <label className="sasst__f" data-ai-private>
        <span className="sasst__lbl">{t("urgent.need")}</span>
        <textarea
          id={`${uid}-need`}
          value={need}
          onChange={(e) => {
            setNeed(e.target.value);
            if (e.target.value.trim().length >= ASSIST_URGENT_NEED_MIN) dropBad("need");
          }}
          placeholder={t("urgent.needPh")}
          maxLength={NEED_MAX}
          rows={4}
          className={bad.need ? "is-bad" : undefined}
          aria-invalid={bad.need ? true : undefined}
          data-ai-id={ai("need")}
          data-ai-label={t("urgent.need")}
        />
        {bad.need ? (
          <span className="sasst__ferr" role="alert">
            <IconAlert aria-hidden="true" />
            {bad.need}
          </span>
        ) : null}
        <em>
          {need.length}/{NEED_MAX}
        </em>
      </label>

      {svc ? (
        <div className="sasst__quote" aria-live="polite">
          <InfoList
            rows={[
              ...(minutes > 0 ? [{ key: "len", label: t("urgent.meeting"), value: tu("minutesN", { n: minutes }) }] : []),
              ...(group && price > 0 ? [{ key: "per", label: t("urgent.perLawyer"), value: `${sumText(t, urgentPrice(svc, channel, 1))} × ${lawyers}` }] : []),
              { key: "total", label: t("plan.total"), value: price > 0 ? <span className="sasst__total">{sumText(t, price)}</span> : "—" },
            ]}
          />
          {cat && !cat.priced ? (
            <p className="sasst__note">
              <IconAlert aria-hidden="true" />
              {t("urgent.catalogOff")}
            </p>
          ) : null}
          {svc.immediateCall ? (
            <p className="sasst__note">
              <IconBolt aria-hidden="true" />
              {t("urgent.immediate")}
            </p>
          ) : null}
          {svc.requiresPriorPurchase ? (
            <p className="sasst__note">
              <IconLock aria-hidden="true" />
              {tu("priorPurchaseNote")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="sasst__acts">
        <button type="button" className="btn btn--grad btn--sm" onClick={review} disabled={busy} data-ai-id={ai("next")}>
          {t("urgent.next")}
        </button>
      </div>

      <ConfirmModal
        open={confirming && Boolean(svc)}
        title={t("urgent.confirmTitle")}
        rows={confirmRows}
        note={t("urgent.confirmNote", { name: client?.name || clientName || t("client.noName") })}
        busy={busy}
        error={confirmErr}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void submit()}
        aiId={ai("confirm-modal")}
      />
    </div>
  );
}
