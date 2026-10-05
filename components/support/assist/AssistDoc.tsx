"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import DocTypePicker from "@/components/portal/DocTypePicker";
import { searchServices, type BackendService } from "@/lib/services/backend";
import { ASSIST_DOC_LANGUAGES, createAssistDocumentRequest, type AssistDocLanguage, type AssistDocResult } from "@/lib/services/supportAssist";
import { IconDocLines, IconEdit, IconSearch } from "@/components/icons";
import { ConfirmModal, ResultCard, StatusChip, assistErrorText, clientLine, sumText, type AssistSectionProps, type InfoRow } from "./bits";

type Base = { kind: "scratch" } | { kind: "service"; service: BackendService };
type Hits = { q: string; items: BackendService[]; failed: boolean };

const TITLE_MAX = 200;
const NEED_MAX = 4000;
const NEED_PREVIEW = 280;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export default function AssistDoc({ ticketId, client, clientName, onDone, onBlock }: AssistSectionProps) {
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
  const inflight = useRef(false);

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

  const sentRows: InfoRow[] = sent
    ? [
        { key: "work", label: t("result.workId"), value: sent.workId ? <span className="sasst__wid">{sent.workId}</span> : "—" },
        ...(sent.title ? [{ key: "title", label: t("doc.title"), value: sent.title }] : []),
        { key: "status", label: t("result.status"), value: <StatusChip status={sent.poolStatus || sent.status} prefer="docStatus" /> },
        {
          key: "mode",
          label: t("result.mode"),
          value: sent.assignmentMode && t.has(`doc.mode.${sent.assignmentMode}`) ? t(`doc.mode.${sent.assignmentMode}`) : sent.assignmentMode || "—",
        },
        ...(sent.price > 0 ? [{ key: "pay", label: t("doc.payment"), value: sent.paid ? t("doc.paid") : `${t("doc.unpaid")} · ${sumText(t, sent.price, sent.currency)}` }] : []),
      ]
    : [];

  return (
    <div className="sasst__secin">
      <h4 className="sasst__h4">{t("doc.heading")}</h4>
      <p className="sasst__lead">{t("doc.lead")}</p>
      {sent ? <ResultCard title={t("doc.sentTitle")} rows={sentRows} note={t("doc.poolNote")} onDismiss={() => setSent(null)} /> : null}

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
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("doc.searchPh")} aria-label={t("doc.searchPh")} maxLength={120} />
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

      <label className="sasst__f">
        <span className="sasst__lbl">{t("doc.title")}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("doc.titlePh")} maxLength={TITLE_MAX} />
      </label>

      <label className="sasst__f">
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
        <button type="button" className="btn btn--grad btn--sm" onClick={review} disabled={busy}>
          {t("doc.next")}
        </button>
      </div>

      <ConfirmModal
        open={confirming}
        title={t("doc.confirmTitle")}
        rows={confirmRows}
        note={t("doc.confirmNote")}
        busy={busy}
        error={confirmErr}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void submit()}
      />
    </div>
  );
}
