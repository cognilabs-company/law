"use client";

import "@/components/portal/sosIntake1920.css";
import { useState, type CSSProperties } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  CircleCheck,
  Clock,
  ExternalLink,
  FileText,
  Info,
  MapPin,
  Phone,
  ShieldCheck,
  Siren,
  Star,
  TriangleAlert,
} from "lucide-react";
import AiLabel from "@/components/ui/AiLabel";
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
import { specName } from "@/components/portal/LawyerProfileModal";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { HOTLINE, HOTLINE_TEL } from "@/lib/contact";
import BusinessHoursBadge from "@/components/portal/BusinessHoursBadge";
import { PassportView } from "@/components/portal/ServicePassport";
import LawyerProfileModal from "@/components/portal/LawyerProfileModal";
import { fmtRating } from "@/lib/date";

const URGENT = new Set(["urgent", "high", "critical"]);
// The dashboard's black line drawings (public/img/xizmatlar), in white circles.
const ASK_ART = "/img/xizmatlar/Muammo_tahlili.webp";
const SOS_ART = "/img/xizmatlar/Shoshilinch_yordam.webp";
const artStyle = (src: string) => ({ "--art": `url(${src})` }) as CSSProperties;
// The urgency pill in the dashboard's .cx-pill tones.
const urgTone = (u: string, urgent: boolean) => (urgent ? "err" : u === "low" ? "gray" : "blue");

export default function ClientIntake() {
  const t = useTranslations("portal.client.intake");
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiClassification | null>(null);
  const [matches, setMatches] = useState<LawyerMatch[]>([]);
  const [failed, setFailed] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const prev = useResource(() => getMyMatches(), []);
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
        .then((m) => setMatches(m))
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

  // The dashboard's vocabulary: the shell's header names the page, so the
  // question card opens with the problem-analysis picture instead of a second
  // hero; the composer is the dashboard's AI box; the result, the offers, the
  // advocates and the sources are cards, chips and pills from dash1920.css.
  return (
    <div className="intake sosi-in">
      <section className="ppanel sosi-ask" aria-labelledby="sosi-ask-h">
        <div className="sosi-ask__h">
          <span className="sosi-ask__art" style={artStyle(ASK_ART)} aria-hidden />
          <div className="sosi-ask__ht">
            <h2 id="sosi-ask-h" className="cx-h3">{t("title")}</h2>
            <p className="lx-sub">{t("subtitle")}</p>
          </div>
        </div>
        <label className="intake__lbl sosi-lbl" htmlFor="sosi-q">{t("label")}</label>
        <div className="cx-ai__f sosi-ask__f">
          <textarea
            id="sosi-q"
            className="intake__ta cx-ai__q sosi-ask__q"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("placeholder")}
            data-ai-target="intake:input"
            data-ai-label={t("label")}
          />
          <button className="cx-ai__go sosi-ask__go" type="button" onClick={analyze} disabled={busy || text.trim().length < 8} data-ai-target="button:intake-analyze">
            {busy ? t("analyzing") : t("analyze")}
            <ArrowRight />
          </button>
        </div>
        <div className="sosi-ask__ft">
          <p className="intake__hint">{t("hint")}</p>
          <div className="intake__bh"><BusinessHoursBadge note={t("operatorHours")} /></div>
        </div>
      </section>

      {!result && prev.data.length ? (
        <section className="ppanel sosi-sec">
          <MatchPicks items={prev.data} title={t("prevMatchesTitle")} onView={setViewId} />
        </section>
      ) : null}

      {result ? (
        <>
          {/* Level 3: urgent matter — call-center and SOS first. */}
          {urgent ? (
            <section className="urgblk sosi-urg" role="alert">
              <span className="urgblk__i sosi-urg__art" style={artStyle(SOS_ART)} aria-hidden />
              <div className="urgblk__t sosi-urg__t">
                <b>{t("urgentTitle")}</b>
                <span>{t("urgentText")}</span>
              </div>
              <div className="urgblk__act sosi-urg__act">
                <button className="btn urgblk__sos sosi-urg__cta" type="button" onClick={() => router.push("/portal/client/sos")}>
                  <Siren />
                  {t("urgentCta")}
                </button>
                <a className="urgblk__call sosi-urg__call" href={HOTLINE_TEL}>
                  <Phone />
                  {HOTLINE}
                </a>
              </div>
            </section>
          ) : null}

          <section className="ppanel intake__res sosi-res" data-ai-target="intake:result">
            <div className="intake__resh sosi-head">
              <h3 className="cx-h3">{t("resultTitle")}</h3>
              <span className={`intake__urg intake__urg--${urgent ? "critical" : result.urgency} cx-pill sosi-pill sosi-pill--${urgTone(result.urgency, urgent)}`}>
                {urgent ? <Siren /> : <Clock />}
                {label("urgency", result.urgency)}
              </span>
            </div>
            <dl className="sosi-kv">
              <div className="intake__kv"><dt>{t("category")}</dt><dd>{label("categories", result.category) || "—"}</dd></div>
              {result.executorType ? (
                <div className="intake__kv"><dt>{t("executor")}</dt><dd>{label("executors", result.executorType)}</dd></div>
              ) : null}
            </dl>
            {result.summary && !text.trim().startsWith(result.summary.trim().slice(0, 200)) ? <p className="intake__summary">{result.summary}</p> : null}
            <AiLabel />

            {/* Level 2: matched services with their passports. */}
            {result.offers.length ? (
              <div className="sosi-part">
                <div className="intake__resh sosi-head sosi-head--sub">
                  <h4 className="sosi-h4">{t("offersTitle")}</h4>
                  <span className="advmuted">{t("offersSub")}</span>
                </div>
                <div className="aioff sosi-offs">
                  {result.offers.map((o) => (
                    <OfferCard key={o.serviceId} offer={o} onOrder={() => router.push(`/portal/client/services?service=${encodeURIComponent(o.serviceId)}`)} />
                  ))}
                </div>
              </div>
            ) : result.recommendedService ? (
              // Level 1: a plain link to the catalog.
              <button
                className="btn btn--pri btn--full sosi-rec"
                type="button"
                onClick={() => router.push(`/portal/client/services?q=${encodeURIComponent(label("categories", result.recommendedService))}`)}
              >
                {t("orderRecommended")}
                <ArrowRight />
              </button>
            ) : null}

            {matches.length ? <MatchPicks items={matches} title={t("matchesTitle")} spaced onView={setViewId} /> : null}

            <SourceList sources={result.sources} title={t("sourcesTitle")} spaced />
            {result.answerStatus === "reliable_source_required" ? (
              <p className="aidisc aidisc--warn sosi-note sosi-note--warn" role="note"><TriangleAlert />{t("sourceUnverified")}</p>
            ) : null}

            {/* Always shown under the answer; cannot be dismissed. */}
            <p className="aidisc sosi-note"><Info />{result.disclaimer || t("disclaimer")}</p>
            <AiFeedback key={result.leadId || result.summary} requestId={result.leadId || ""} />

            {urgent ? null : (
              <div className="intake__acts">
                <button className="btn btn--soft sosi-sos" type="button" onClick={() => router.push("/portal/client/sos")}>
                  <Siren />
                  {t("orSos")}
                </button>
              </div>
            )}
          </section>
        </>
      ) : null}

      {failed ? (
        <section className="ppanel intake__res sosi-fail" role="alert">
          <div className="cx-empty sosi-fail__e">
            <span className="cx-empty__ic intake__failicon sosi-fail__ic"><TriangleAlert /></span>
            <b>{t("failedTitle")}</b>
            <p>{t("failedText")}</p>
            <button className="btn btn--pri btn--sm" type="button" onClick={() => router.push("/portal/client/sos")}>
              <Siren />
              {t("orSos")}
            </button>
          </div>
        </section>
      ) : null}

      {!result && sources.length ? (
        <section className="ppanel sosi-sec" data-ai-target="intake:sources">
          <SourceList sources={sources} title={t("corpusTitle")} lead={t("corpusLead")} />
        </section>
      ) : null}

      <LawyerProfileModal userId={viewId} open={viewId !== null} onClose={() => setViewId(null)} />
    </div>
  );
}

function MatchPicks({ items, title, spaced, onView }: { items: LawyerMatch[]; title: string; spaced?: boolean; onView: (id: string) => void }) {
  const t = useTranslations("portal.client.intake");
  const tp = useTranslations("portal.client.lawyerProfile");
  const te = useTranslations("enums");
  const locale = useLocale();
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 4);
  return (
    <div className={`intake__matches sosi-mts${spaced ? " sosi-part" : ""}`}>
      <div className="intake__resh sosi-head">
        {spaced ? (
          <h4 className="sosi-h4">{title}<span className="cx-count">{items.length}</span></h4>
        ) : (
          <h3 className="cx-h3">{title}<span className="cx-count">{items.length}</span></h3>
        )}
        {items.length > 4 ? (
          <button className="rf__link cx-link sosi-more" type="button" aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? t("fewerMatches") : t("viewAllMatches")}
            <ArrowRight />
          </button>
        ) : null}
      </div>
      <div className="advpick sosi-mts__grid">
        {shown.map((m) => {
          const areas = [...new Set(m.area.split(",").map((a) => a.trim()).filter(Boolean).map((a) => specName(te, a, locale)))];
          return (
            <button key={m.id} type="button" className="advpick__c sosi-mt" onClick={() => onView(m.lawyerUserId || m.id)}>
              <span className="advpick__av cx-av sosi-mt__av">{initials(m.name || "A")}</span>
              <span className="advpick__m sosi-mt__m">
                <span className="sosi-mt__top">
                  <span className="sosi-mt__n">{m.name || "—"}</span>
                  <span className="advpick__price cx-pill cx-pill--blue sosi-mt__pct">{t("matchPct", { n: Math.min(m.matchPct, 100) })}</span>
                </span>
                <span className="advpick__stats sosi-mt__meta">
                  <i>{tp(`kind.${m.kind === "advocate" ? "advocate" : "lawyer"}`)}</i>
                  <i><Star />{m.rating ? fmtRating(m.rating, locale) : "—"}</i>
                  {m.region ? <i><MapPin />{te.has(`regions.${m.region}`) ? te(`regions.${m.region}`) : humanizeSlug(m.region)}</i> : null}
                </span>
                {areas.length ? (
                  <span className="cx-tags">
                    {areas.map((a) => <span key={a} className="cx-tag">{a}</span>)}
                  </span>
                ) : null}
                {m.reason ? <span className="mtchcard__reason sosi-mt__why">{m.reason}</span> : null}
              </span>
              <span className="cx-iconbtn sosi-mt__go" aria-hidden><ArrowUpRight /></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OfferCard({ offer: o, onOrder }: { offer: AiOffer; onOrder: () => void }) {
  const t = useTranslations("portal.client.intake");
  const [open, setOpen] = useState(false);
  const p = o.passport;
  const price = o.basePrice || p.standardPrice;
  return (
    <div className={`aioff__c aioff__c--${o.level} sosi-off sosi-off--${o.level}`}>
      <span className="aioff__lv sosi-off__lv">{t.has(`levels.${o.level}`) ? t(`levels.${o.level}`) : o.level}</span>
      <b className="aioff__t sosi-off__t">{o.title}</b>
      <span className="aioff__price sosi-off__price">{price ? `${fmtUzs(price)} ${t("som")}` : t("byRequest")}</span>
      <span className="aioff__meta sosi-off__meta">
        {p.standardDays ? <i><Clock />{t("termDays", { n: p.standardDays })}</i> : null}
        {p.requiredDocuments.length ? <i><FileText />{t("docsN", { n: p.requiredDocuments.length })}</i> : null}
        {p.advokatRequired ? <i><ShieldCheck />{t("advokatOnly")}</i> : null}
      </span>
      {open ? <PassportView passport={p} /> : null}
      <span className="aioff__act sosi-off__act">
        <button type="button" className="btn btn--pri btn--sm sosi-off__go" onClick={onOrder}>
          {t("orderOffer")}
          <ArrowRight />
        </button>
        <button type="button" className="cx-link sosi-off__pass" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? t("hidePassport") : t("showPassport")}
          <ChevronDown />
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

function SourceList({ sources, title, lead, spaced }: { sources: LegalSource[]; title: string; lead?: string; spaced?: boolean }) {
  const t = useTranslations("portal.client.intake");
  if (!sources.length) return null;
  return (
    <div className={`lsrc sosi-src${spaced ? " sosi-part" : ""}`}>
      {spaced ? <h4 className="lsrc__h sosi-h4">{title}</h4> : <h3 className="lsrc__h cx-h3">{title}</h3>}
      {lead ? <p className="ppanel__note lx-sub">{lead}</p> : null}
      <div className="lsrc__list sosi-src__list">
        {sources.map((s) =>
          s.url ? (
            <a key={s.key || s.url} className="lsrc__i sosi-src__i" href={s.url} target="_blank" rel="noreferrer noopener">
              <span>{s.title}</span>
              {s.trustLevel === "official" ? <em><CircleCheck />{t("official")}</em> : null}
              <ExternalLink className="sosi-src__ext" />
            </a>
          ) : (
            <span key={s.key || s.title} className="lsrc__i sosi-src__i">
              <span>{s.title}</span>
              {s.trustLevel === "official" ? <em><CircleCheck />{t("official")}</em> : null}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
