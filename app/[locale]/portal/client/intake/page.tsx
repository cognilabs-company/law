"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  classifyProblem,
  getMyMatches,
  getLegalCorpus,
  sendAiFeedback,
  type AiClassification,
  type AiOffer,
  type LawyerMatch,
  type LegalSource,
} from "@/lib/services/backend";
import { initials, humanizeSlug } from "@/lib/lawyers";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { HOTLINE, HOTLINE_TEL } from "@/lib/contact";
import BusinessHoursBadge from "@/components/portal/BusinessHoursBadge";
import { PassportView } from "@/components/portal/ServicePassport";
import {
  IconSparkle,
  IconArrowRight,
  IconAlert,
  IconStar,
  IconMapPin,
  IconPhone,
  IconShieldCheck,
  IconExternal,
  IconInfo,
  IconClock,
  IconDocLines,
} from "@/components/icons";

const URGENT = new Set(["urgent", "high", "critical"]);

export default function ClientIntake() {
  const t = useTranslations("portal.client.intake");
  const te = useTranslations("enums");
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiClassification | null>(null);
  const [matches, setMatches] = useState<LawyerMatch[]>([]);
  const [failed, setFailed] = useState(false);
  // Official sources the AI relies on (T1-04), shown before the first analysis.
  const corpus = useResource(getLegalCorpus, []);

  async function analyze() {
    if (busy || text.trim().length < 8) return;
    setBusy(true);
    setFailed(false);
    setResult(null);
    setMatches([]);
    try {
      const cls = await classifyProblem(text.trim());
      setResult(cls);
      // The classification created a lead; the backend matches advocates to it.
      getMyMatches()
        .then((m) => setMatches(m.slice(0, 4)))
        .catch(() => setMatches([]));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const urgent = !!result && URGENT.has(result.urgency);
  const label = (group: string, key: string) => (key && t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key);
  const sources = result?.sources.length ? result.sources : corpus.data;

  return (
    <div className="intake">
      <div className="intake__hero">
        <span className="intake__ico"><IconSparkle /></span>
        <div>
          <h1 className="intake__title">{t("title")}</h1>
          <p className="intake__sub">{t("subtitle")}</p>
        </div>
      </div>

      <div className="ppanel">
        <label className="intake__lbl">{t("label")}</label>
        <textarea className="intake__ta" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("placeholder")} />
        <button className="btn btn--pri btn--full" type="button" onClick={analyze} disabled={busy || text.trim().length < 8}>
          <IconSparkle />
          {busy ? t("analyzing") : t("analyze")}
        </button>
        <p className="intake__hint">{t("hint")}</p>
        <div className="intake__bh"><BusinessHoursBadge note={t("operatorHours")} /></div>
      </div>

      {result ? (
        <>
          {/* Level 3: urgent matter — call-center and SOS first. */}
          {urgent ? (
            <div className="urgblk" role="alert">
              <span className="urgblk__i"><IconAlert /></span>
              <div className="urgblk__t">
                <b>{t("urgentTitle")}</b>
                <span>{t("urgentText")}</span>
              </div>
              <div className="urgblk__act">
                <button className="btn urgblk__sos" type="button" onClick={() => router.push("/portal/client/sos")}>
                  {t("urgentCta")}
                </button>
                <a className="urgblk__call" href={HOTLINE_TEL}>
                  <IconPhone />
                  {HOTLINE}
                </a>
              </div>
            </div>
          ) : null}

          <div className="ppanel intake__res">
            <div className="intake__resh">
              <b>{t("resultTitle")}</b>
              <span className={`intake__urg intake__urg--${urgent ? "critical" : result.urgency}`}>{label("urgency", result.urgency)}</span>
            </div>
            <div className="intake__kv"><label>{t("category")}</label><b>{label("categories", result.category) || "—"}</b></div>
            {result.executorType ? (
              <div className="intake__kv"><label>{t("executor")}</label><b>{label("executors", result.executorType)}</b></div>
            ) : null}
            {result.summary && !text.trim().startsWith(result.summary.trim().slice(0, 200)) ? <p className="intake__summary">{result.summary}</p> : null}

            {/* Level 2: matched services with their passports. */}
            {result.offers.length ? (
              <>
                <div className="intake__resh" style={{ marginTop: 14 }}>
                  <b>{t("offersTitle")}</b>
                  <span className="advmuted">{t("offersSub")}</span>
                </div>
                <div className="aioff">
                  {result.offers.map((o) => (
                    <OfferCard key={o.serviceId} offer={o} onOrder={() => router.push(`/portal/client/services?service=${encodeURIComponent(o.serviceId)}`)} />
                  ))}
                </div>
              </>
            ) : result.recommendedService ? (
              // Level 1: a plain link to the catalog.
              <button
                className="btn btn--grad btn--full"
                type="button"
                onClick={() => router.push(`/portal/client/services?q=${encodeURIComponent(label("categories", result.recommendedService))}`)}
              >
                {t("orderRecommended")}
                <IconArrowRight />
              </button>
            ) : null}

            {matches.length ? (
              <div className="intake__matches">
                <div className="intake__resh" style={{ marginTop: 14 }}>
                  <b>{t("matchesTitle")}</b>
                  <button className="rf__link" type="button" onClick={() => router.push("/portal/client/matches")}>
                    {t("viewAllMatches")}
                  </button>
                </div>
                <div className="advpick">
                  {matches.map((m) => (
                    <button key={m.id} type="button" className="advpick__c" onClick={() => router.push("/portal/client/matches")}>
                      <span className="advpick__av">{initials(m.name || "A")}</span>
                      <span className="advpick__m">
                        <b>{m.name || "—"}</b>
                        <span className="advpick__stats">
                          <i><IconStar />{m.rating ? m.rating.toFixed(1) : "—"}</i>
                          {m.region ? <i><IconMapPin />{te.has(`regions.${m.region}`) ? te(`regions.${m.region}`) : humanizeSlug(m.region)}</i> : null}
                          {m.area ? <i>{m.area.split(",").map((a) => humanizeSlug(a.trim())).filter(Boolean).join(", ")}</i> : null}
                        </span>
                      </span>
                      <span className="advpick__price">{t("matchPct", { n: Math.min(m.matchPct, 100) })}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <SourceList sources={result.sources} title={t("sourcesTitle")} />
            {result.answerStatus === "reliable_source_required" ? (
              <p className="aidisc aidisc--warn" role="note"><IconAlert />{t("sourceUnverified")}</p>
            ) : null}

            {/* Always shown under the answer; cannot be dismissed. */}
            <p className="aidisc"><IconInfo />{result.disclaimer || t("disclaimer")}</p>
            <AiFeedback key={result.leadId || result.summary} requestId={result.leadId || ""} />

            {urgent ? null : (
              <div className="intake__acts">
                <button className="btn btn--soft" type="button" onClick={() => router.push("/portal/client/sos")}>{t("orSos")}</button>
              </div>
            )}
          </div>
        </>
      ) : null}

      {failed ? (
        <div className="ppanel intake__res">
          <div className="intake__resh"><span className="intake__failicon"><IconAlert /></span><b>{t("failedTitle")}</b></div>
          <p className="intake__summary">{t("failedText")}</p>
          <button className="btn btn--pri" type="button" onClick={() => router.push("/portal/client/sos")}>{t("orSos")}</button>
        </div>
      ) : null}

      {!result && sources.length ? (
        <div className="ppanel">
          <SourceList sources={sources} title={t("corpusTitle")} lead={t("corpusLead")} />
        </div>
      ) : null}
    </div>
  );
}

function OfferCard({ offer: o, onOrder }: { offer: AiOffer; onOrder: () => void }) {
  const t = useTranslations("portal.client.intake");
  const [open, setOpen] = useState(false);
  const p = o.passport;
  const price = o.basePrice || p.standardPrice;
  return (
    <div className={`aioff__c aioff__c--${o.level}`}>
      <span className="aioff__lv">{t.has(`levels.${o.level}`) ? t(`levels.${o.level}`) : o.level}</span>
      <b className="aioff__t">{o.title}</b>
      <span className="aioff__price">{price ? `${fmtUzs(price)} ${t("som")}` : t("byRequest")}</span>
      <span className="aioff__meta">
        {p.standardDays ? <i><IconClock />{t("termDays", { n: p.standardDays })}</i> : null}
        {p.requiredDocuments.length ? <i><IconDocLines />{t("docsN", { n: p.requiredDocuments.length })}</i> : null}
        {p.advokatRequired ? <i><IconShieldCheck />{t("advokatOnly")}</i> : null}
      </span>
      {open ? <PassportView passport={p} /> : null}
      <span className="aioff__act">
        <button type="button" className="btn btn--line btn--sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? t("hidePassport") : t("showPassport")}
        </button>
        <button type="button" className="btn btn--pri btn--sm" onClick={onOrder}>
          {t("orderOffer")}
          <IconArrowRight />
        </button>
      </span>
    </div>
  );
}

// T1-04: "useful / not useful"; not useful goes to the moderator queue.
function AiFeedback({ requestId }: { requestId: string }) {
  const t = useTranslations("portal.client.intake");
  const [sent, setSent] = useState<"" | "yes" | "no">("");
  const [busy, setBusy] = useState(false);
  async function send(useful: boolean) {
    if (busy || sent) return;
    setBusy(true);
    try {
      await sendAiFeedback(useful, "", requestId);
      setSent(useful ? "yes" : "no");
    } catch {
      /* feedback is best effort */
    } finally {
      setBusy(false);
    }
  }
  if (sent) return <p className="aifb aifb--done">{t(sent === "yes" ? "feedbackThanks" : "feedbackQueued")}</p>;
  return (
    <div className="aifb">
      <span>{t("feedbackAsk")}</span>
      <button type="button" className="btn btn--line btn--sm" disabled={busy} onClick={() => send(true)}>{t("feedbackYes")}</button>
      <button type="button" className="btn btn--line btn--sm" disabled={busy} onClick={() => send(false)}>{t("feedbackNo")}</button>
    </div>
  );
}

function SourceList({ sources, title, lead }: { sources: LegalSource[]; title: string; lead?: string }) {
  const t = useTranslations("portal.client.intake");
  if (!sources.length) return null;
  return (
    <div className="lsrc">
      <b className="lsrc__h">{title}</b>
      {lead ? <p className="ppanel__note">{lead}</p> : null}
      <div className="lsrc__list">
        {sources.map((s) =>
          s.url ? (
            <a key={s.key || s.url} className="lsrc__i" href={s.url} target="_blank" rel="noreferrer noopener">
              <span>{s.title}</span>
              {s.trustLevel === "official" ? <em>{t("official")}</em> : null}
              <IconExternal />
            </a>
          ) : (
            <span key={s.key || s.title} className="lsrc__i">
              <span>{s.title}</span>
              {s.trustLevel === "official" ? <em>{t("official")}</em> : null}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
