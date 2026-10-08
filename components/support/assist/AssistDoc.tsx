"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import DocTypePicker from "@/components/portal/DocTypePicker";
import { aiId } from "@/lib/ai/ids";
import { useAiField } from "@/lib/ai/registry";
import { searchServices, type BackendService } from "@/lib/services/backend";
import {
  ASSIST_DOC_LANGUAGES,
  createAssistDocumentRequest,
  docPayPhase,
  mergeAssistLive,
  pickPayPhase,
  type AssistDocLanguage,
  type AssistDocResult,
  type AssistLive,
  type AssistPayPhase,
} from "@/lib/services/supportAssist";
import { IconDocLines, IconEdit, IconSearch } from "@/components/icons";
import { ConfirmModal, PayState, ResultCard, StatusChip, assistErrorText, clientLine, sumText, useAssistLive, type AssistSectionProps, type InfoRow } from "./bits";

type Base = { kind: "scratch" } | { kind: "service"; service: BackendService };
type Hits = { q: string; items: BackendService[]; failed: boolean };

const TITLE_MAX = 200;
const NEED_MAX = 4000;
const NEED_PREVIEW = 280;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export default function AssistDoc({ ticketId, client, clientName, ctx, onDone, onBlock }: AssistSectionProps) {
  const t = useTranslations("support.assist");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hits | null>(null);
  const [base, setBase] = useState<Base | null>(null);
  const [title, setTitle] = useState("");
  const [autoTitle, setAutoTitle] = useState("");
  const [need, setNeed] = useState("");
  const [language, setLanguage] = useState<AssistDocLanguage>("uz");
  const [docType, setDocType] = useState("");
  const [formKey, setFormKey] = useState(0);
  const [err, setErr] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmErr, setConfirmErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<AssistDocResult | null>(null);
  const [live, setLive] = useState<AssistLive | null>(null);
  const inflight = useRef(false);

  useAssistLive(sent ? [sent.requestId, sent.recordId, sent.workId] : [], (e) => setLive((cur) => mergeAssistLive(cur, e)));

  const term = q.trim();
  const ready = hits && hits.q === term ? hits : null;
  const searching = !base && term.length >= 2 && !ready;

  useEffect(() => {
    if (base || term.length < 2) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      searchServices(term, { limit: 20 }, locale)
        .then((found) => {
          if (!alive) return;
          const items = found.map((h) => h.service).filter((s) => s.id && s.isActive);
          items.sort((a, b) => Number(Boolean(b.documentTemplateId)) - Number(Boolean(a.documentTemplateId)));
          setHits({ q: term, items, failed: false });
        })
        .catch(() => {
          if (alive) setHits({ q: term, items: [], failed: true });
        });
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [term, locale, base]);

  const service = base?.kind === "service" ? base.service : null;
  const flow = service?.documentTemplateId ? "template_lawyer_assisted" : "custom_from_scratch";
  const ai = (...parts: string[]) => aiId("call_center.support.ticket", ticketId, "assist", "document", ...parts);

  useAiField(ai("search"), {
    get: () => (base ? "" : q),
    set: (value) => setQ(value.slice(0, 120)),
    fillable: true,
    disabled: Boolean(base) || busy,
  });
  useAiField(ai("need"), {
    get: () => need,
    set: (value) => {
      setNeed(value.slice(0, NEED_MAX));
      setErr("");
    },
    sensitive: true,
    fillable: true,
    disabled: busy,
  });

  function pickService(s: BackendService) {
    setBase({ kind: "service", service: s });
    setErr("");
    if (!title.trim() || title === autoTitle) {
      const next = s.name.slice(0, TITLE_MAX);
      setTitle(next);
      setAutoTitle(next);
    }
  }

  function pickScratch() {
    setBase({ kind: "scratch" });
    setErr("");
    if (title === autoTitle) {
      setTitle("");
      setAutoTitle("");
    }
  }

  function review() {
    if (busy) return;
    if (!base) {
      setErr(t("doc.baseRequired"));
      return;
    }
    if (!need.trim()) {
      setErr(t("doc.needRequired"));
      return;
    }
    setErr("");
    setConfirmErr("");
    setConfirming(true);
  }

  async function submit() {
    if (!base || !need.trim() || inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setConfirmErr("");
    setSent(null);
    try {
      const r = await createAssistDocumentRequest(ticketId, {
        serviceId: service?.id,
        templateId: service?.documentTemplateId,
        title: title.trim() || service?.name || "",
        need,
        language,
        requestedDocumentType: docType,
      });
      setSent(r);
      setLive(null);
      setConfirming(false);
      setBase(null);
      setQ("");
      setHits(null);
      setTitle("");
      setAutoTitle("");
      setNeed("");
      setLanguage("uz");
      setDocType("");
      setFormKey((k) => k + 1);
      onDone();
    } catch (e) {
      if (onBlock(e)) setConfirming(false);
      else setConfirmErr(assistErrorText(e, t, tc));
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  const confirmRows: InfoRow[] = [
    { key: "client", label: t("confirm.client"), value: clientLine(t, client, clientName) },
    { key: "base", label: t("doc.base"), value: service ? service.name : t("doc.scratch") },
    ...(title.trim() ? [{ key: "title", label: t("doc.title"), value: title.trim() }] : []),
    { key: "need", label: t("doc.need"), value: clip(need.trim(), NEED_PREVIEW) },
    { key: "lang", label: t("doc.language"), value: t(`doc.lang.${language}`) },
    ...(docType.trim() ? [{ key: "type", label: t("doc.type"), value: docType.trim() }] : []),
    ...(service?.price ? [{ key: "price", label: t("doc.price"), value: sumText(t, service.price) }] : []),
  ];
  const servicePrice = service?.price ?? 0;

  const ctxDoc = sent ? ctx.recentDocuments.find((d) => (sent.requestId && d.id === sent.requestId) || (sent.workId && d.workId === sent.workId)) : undefined;
  const basePhase: AssistPayPhase = sent ? docPayPhase(sent) : "";
  const livePhase: AssistPayPhase = live?.phase ?? "";
  const gated = basePhase !== "" || livePhase !== "";
  const ctxPhase: AssistPayPhase = gated && ctxDoc ? (ctxDoc.paid ? "paid" : docPayPhase(ctxDoc)) : "";
  const phase: AssistPayPhase = gated ? pickPayPhase(livePhase, ctxPhase, basePhase) : "";
  const docStatus = sent ? live?.status || ctxDoc?.status || sent.poolStatus || sent.status : "";
  const telegramSent = live?.telegramSent ?? sent?.telegramSent ?? false;

  const sentRows: InfoRow[] = sent
    ? [
        { key: "work", label: t("result.workId"), value: sent.workId ? <span className="sasst__wid">{sent.workId}</span> : "—" },
        ...(sent.title ? [{ key: "title", label: t("doc.title"), value: sent.title }] : []),
        ...(phase === "pending" || phase === "rejected" ? [] : [{ key: "status", label: t("result.status"), value: <StatusChip status={docStatus} prefer="docStatus" /> }]),
        {
          key: "mode",
          label: t("result.mode"),
          value: sent.assignmentMode && t.has(`doc.mode.${sent.assignmentMode}`) ? t(`doc.mode.${sent.assignmentMode}`) : sent.assignmentMode || "—",
        },
        { key: "tg", label: t("result.telegram"), value: telegramSent ? t("result.telegramSent") : t("result.telegramFailed") },
        ...(!phase && sent.price > 0 ? [{ key: "pay", label: t("doc.payment"), value: sent.paid ? t("doc.paid") : `${t("doc.unpaid")} · ${sumText(t, sent.price, sent.currency)}` }] : []),
      ]
    : [];

  return (
    <div className="sasst__secin">
      <h4 className="sasst__h4">{t("doc.heading")}</h4>
      <p className="sasst__lead">{t("doc.lead")}</p>
      {sent ? (
        <ResultCard
          title={phase === "pending" || phase === "rejected" ? t("doc.sentPayTitle") : t("doc.sentTitle")}
          rows={sentRows}
          note={phase === "pending" ? t("pay.docPending") : phase === "rejected" ? t("pay.rejectedNote") : t("doc.poolNote")}
          warn={!telegramSent || phase === "rejected"}
          onDismiss={() => setSent(null)}
        >
          <PayState phase={phase} amount={sent.gate?.amount || sent.price} currency={sent.gate?.currency || sent.currency} />
        </ResultCard>
      ) : null}

      <div className="sasst__f">
        <span className="sasst__lbl">{t("doc.base")}</span>
        {base ? (
          <div className="sasst__chosen">
            <span className="sasst__oic" aria-hidden="true">
              {service ? <IconDocLines /> : <IconEdit />}
            </span>
            <span>
              <b>{service ? service.name : t("doc.scratch")}</b>
              <small>
                {service
                  ? [service.documentTemplateId ? t("doc.withTemplate") : "", service.categoryTitle || "", service.price ? sumText(t, service.price) : ""].filter(Boolean).join(" · ")
                  : t("doc.scratchHint")}
              </small>
            </span>
            <button type="button" className="sasst__link" onClick={() => setBase(null)} disabled={busy}>
              {t("doc.change")}
            </button>
          </div>
        ) : (
          <>
            <label className="sasst__search">
              <IconSearch aria-hidden="true" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("doc.searchPh")} aria-label={t("doc.searchPh")} maxLength={120} data-ai-id={ai("search")} />
            </label>
            <ul className="sasst__pick" aria-label={t("doc.base")}>
              <li>
                <button type="button" className="sasst__opt" onClick={pickScratch}>
                  <span className="sasst__oic" aria-hidden="true">
                    <IconEdit />
                  </span>
                  <span>
                    <b>{t("doc.scratch")}</b>
                    <small>{t("doc.scratchHint")}</small>
                  </span>
                </button>
              </li>
              {ready
                ? ready.items.map((s) => (
                    <li key={s.id}>
                      <button type="button" className="sasst__opt" onClick={() => pickService(s)}>
                        <span className="sasst__oic" aria-hidden="true">
                          <IconDocLines />
                        </span>
                        <span>
                          <b>{s.name}</b>
                          <small>{[s.documentTemplateId ? t("doc.withTemplate") : "", s.categoryTitle || ""].filter(Boolean).join(" · ")}</small>
                        </span>
                        {s.price ? <em>{sumText(t, s.price)}</em> : null}
                      </button>
                    </li>
                  ))
                : null}
            </ul>
            {term.length === 1 ? <p className="sasst__muted">{t("doc.typeMore")}</p> : null}
            {searching ? <p className="sasst__muted" aria-live="polite">{t("doc.searching")}</p> : null}
            {ready && ready.failed ? <p className="sasst__err">{t("doc.searchError")}</p> : null}
            {ready && !ready.failed && !ready.items.length ? <p className="sasst__muted">{t("doc.noHits")}</p> : null}
          </>
        )}
      </div>

      <label className="sasst__f" data-ai-private>
        <span className="sasst__lbl">{t("doc.title")}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("doc.titlePh")} maxLength={TITLE_MAX} />
      </label>

      <label className="sasst__f" data-ai-private>
        <span className="sasst__lbl">{t("doc.need")}</span>
        <textarea
          value={need}
          onChange={(e) => {
            setNeed(e.target.value);
            if (err) setErr("");
          }}
          placeholder={t("doc.needPh")}
          maxLength={NEED_MAX}
          rows={4}
          data-ai-id={ai("need")}
          data-ai-label={t("doc.need")}
        />
        <em>
          {need.length}/{NEED_MAX}
        </em>
      </label>

      <div className="sasst__f">
        <span className="sasst__lbl">{t("doc.language")}</span>
        <div className="sasst__chips" role="group" aria-label={t("doc.language")}>
          {ASSIST_DOC_LANGUAGES.map((l) => (
            <button key={l} type="button" className="supchip" aria-pressed={language === l} onClick={() => setLanguage(l)}>
              {t(`doc.lang.${l}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="sasst__type">
        <DocTypePicker key={formKey} flow={flow} value={docType} onChange={setDocType} />
      </div>

      {err ? (
        <p className="sasst__err" role="alert">
          {err}
        </p>
      ) : null}
      <div className="sasst__acts">
        <button type="button" className="btn btn--grad btn--sm" onClick={review} disabled={busy} data-ai-id={ai("next")}>
          {t("doc.next")}
        </button>
      </div>

      <ConfirmModal
        open={confirming}
        title={t("doc.confirmTitle")}
        rows={confirmRows}
        note={servicePrice > 0 ? t("doc.confirmPaid", { amount: sumText(t, servicePrice) }) : t("doc.confirmNote")}
        busy={busy}
        error={confirmErr}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void submit()}
        aiId={ai("confirm-modal")}
      />
    </div>
  );
}
