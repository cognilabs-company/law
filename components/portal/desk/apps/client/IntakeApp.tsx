"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { classifyProblem, getLegalCorpus, getMyMatches, sendAiFeedback, type AiClassification, type AiOffer, type LawyerMatch, type LegalSource } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { humanizeSlug } from "@/lib/lawyers";
import { fmtUzs } from "@/lib/money";
import { fmtRating } from "@/lib/date";
import { HOTLINE, HOTLINE_TEL } from "@/lib/contact";
import { IconAlert, IconArrowRight, IconClock, IconDocLines, IconExternal, IconInfo, IconPhone, IconShieldCheck, IconSparkle, IconUsers } from "@/components/icons";
import { App, Avatar, Banner, Btn, Empty, Tag, Toolbar, useOs, type Tone } from "../../kit/kit";
import type { NativeProps } from "../../native";
import "./client.css";

// Describing a problem as a desktop program — a note on the left (what
// happened, in the client's words) and the AI's reading of it on the right,
// like a Mac inspector / a Windows details pane: the area of law and how
// urgent it is, the services that fit (basic, standard, premium) with their
// terms, the advocates matched to it, the official sources it rests on, and
// whether the answer helped. An urgent matter puts SOS and the hotline
// first.

const URGENT = new Set(["urgent", "high", "critical"]);

export default function IntakeApp({ openLink }: NativeProps) {
  const t = useTranslations("portal.client.intake");
  const os = useOs();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiClassification | null>(null);
  const [matches, setMatches] = useState<LawyerMatch[]>([]);
  const [failed, setFailed] = useState(false);
  const prev = useResource(() => getMyMatches(), []);
  const corpus = useResource(getLegalCorpus, []);
  const go = (route: string) => openLink({ appId: "", route });

  async function analyze() {
    if (busy || text.trim().length < 8) return;
    setBusy(true);
    setFailed(false);
    setResult(null);
    setMatches([]);
    try {
      const cls = await classifyProblem(text.trim());
      setResult(cls);
      // The classification made a lead; the backend matches advocates to it.
      getMyMatches()
        .then(setMatches)
        .catch(() => setMatches([]));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const urgent = !!result && URGENT.has(result.urgency);
  const label = (group: string, key: string) => (key && t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key);
  const urgTone: Tone = urgent ? "err" : result?.urgency === "normal" ? "ok" : "warn";

  return (
    <App name="cintake">
      <Toolbar title={t("title")} subtitle={os === "mac" ? t("subtitle") : undefined} />
      <div className="dxci">
        <form
          className="dxci-note"
          onSubmit={(e) => {
            e.preventDefault();
            void analyze();
          }}
        >
          <label className="dxci-pad">
            <span>{t("label")}</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t("placeholder")} maxLength={4000} />
          </label>
          <span className="dxci-bar">
            <small>{t("hint")}</small>
            <Btn kind="primary" type="submit" icon={<IconSparkle />} busy={busy} disabled={text.trim().length < 8}>
              {busy ? t("analyzing") : t("analyze")}
            </Btn>
          </span>
          <small className="dxci-hours">
            <IconClock aria-hidden /> {t("operatorHours")}
          </small>
        </form>

        <div className="dxci-out dx-scroll">
          {failed ? (
            <Empty icon={<IconAlert />} title={t("failedTitle")} text={t("failedText")} action={<Btn kind="primary" onClick={() => go("/portal/client/sos")}>{t("orSos")}</Btn>} />
          ) : result ? (
            <>
              {urgent ? (
                <Banner
                  tone="err"
                  title={t("urgentTitle")}
                  action={
                    <span className="dxci-urg">
                      <Btn kind="danger" onClick={() => go("/portal/client/sos")}>
                        {t("urgentCta")}
                      </Btn>
                      <a className="dx-btn dx-btn--default" href={HOTLINE_TEL}>
                        <IconPhone /> <span>{HOTLINE}</span>
                      </a>
                    </span>
                  }
                >
                  {t("urgentText")}
                </Banner>
              ) : null}
              <section className="dxcs-box">
                <h2>
                  {t("resultTitle")}
                  <Tag tone={urgTone}>{label("urgency", result.urgency)}</Tag>
                </h2>
                <dl className="dxcs-facts">
                  <div>
                    <dt>{t("category")}</dt>
                    <dd>{label("categories", result.category) || "—"}</dd>
                  </div>
                  {result.executorType ? (
                    <div>
                      <dt>{t("executor")}</dt>
                      <dd>{label("executors", result.executorType)}</dd>
                    </div>
                  ) : null}
                </dl>
                {result.summary && !text.trim().startsWith(result.summary.trim().slice(0, 200)) ? <p className="dxcs-bio">{result.summary}</p> : null}
                {!result.offers.length && result.recommendedService ? (
                  <Btn kind="primary" icon={<IconArrowRight />} onClick={() => go(`/portal/client/services?q=${encodeURIComponent(label("categories", result.recommendedService))}`)}>
                    {t("orderRecommended")}
                  </Btn>
                ) : null}
              </section>
              {result.offers.length ? (
                <section className="dxcs-box">
                  <h2>
                    {t("offersTitle")} <small>{t("offersSub")}</small>
                  </h2>
                  <div className="dxci-offers">
                    {result.offers.map((o) => (
                      <Offer key={o.serviceId} o={o} onOrder={() => go(`/portal/client/services?service=${encodeURIComponent(o.serviceId)}`)} />
                    ))}
                  </div>
                </section>
              ) : null}
              {matches.length ? <Matches items={matches} title={t("matchesTitle")} onOpen={(id) => go(`/portal/client/lawyers/${encodeURIComponent(id)}`)} /> : null}
              <Sources sources={result.sources} title={t("sourcesTitle")} />
              {result.answerStatus === "reliable_source_required" ? <Banner tone="warn">{t("sourceUnverified")}</Banner> : null}
              <p className="dxci-disc">
                <IconInfo aria-hidden /> {result.disclaimer || t("disclaimer")}
              </p>
              <Feedback key={result.leadId || result.summary} requestId={result.leadId || ""} />
              {urgent ? null : (
                <span>
                  <Btn onClick={() => go("/portal/client/sos")}>{t("orSos")}</Btn>
                </span>
              )}
            </>
          ) : (
            <>
              <div className="dxci-hello">
                <span className="dxci-hello__ic" aria-hidden>
                  <IconSparkle />
                </span>
                <h2>{t("title")}</h2>
                <p>{t("subtitle")}</p>
              </div>
              {prev.data.length ? <Matches items={prev.data} title={t("prevMatchesTitle")} onOpen={(id) => go(`/portal/client/lawyers/${encodeURIComponent(id)}`)} /> : null}
              <Sources sources={corpus.data} title={t("corpusTitle")} lead={t("corpusLead")} />
            </>
          )}
        </div>
      </div>
    </App>
  );
}

// One matched service: its level, price, term and documents, with its
// passport to unfold.
function Offer({ o, onOrder }: { o: AiOffer; onOrder: () => void }) {
  const t = useTranslations("portal.client.intake");
  const tp = useTranslations("portal.passport");
  const [open, setOpen] = useState(false);
  const p = o.passport;
  const price = o.basePrice || p.standardPrice;
  const rows: [string, string][] = (
    [
      [tp("code"), p.catalogCode],
      [tp("family"), p.family],
      [tp("standardTerm"), p.standardDuration || (p.standardDays ? String(p.standardDays) : "")],
      [tp("urgentTerm"), p.urgentDuration || (p.urgentDays ? String(p.urgentDays) : "")],
    ] as [string, string][]
  ).filter((r) => !!r[1]);
  return (
    <article className={`dxci-offer is-${o.level}`}>
      <Tag tone={o.level === "premium" ? "accent" : o.level === "standard" ? "info" : "neutral"}>{t.has(`levels.${o.level}`) ? t(`levels.${o.level}`) : o.level}</Tag>
      <b>{o.title}</b>
      <span className="dxci-offer__price">{price ? `${fmtUzs(price)} ${t("som")}` : t("byRequest")}</span>
      <span className="dxci-offer__meta">
        {p.standardDays ? (
          <span>
            <IconClock aria-hidden /> {t("termDays", { n: p.standardDays })}
          </span>
        ) : null}
        {p.requiredDocuments.length ? (
          <span>
            <IconDocLines aria-hidden /> {t("docsN", { n: p.requiredDocuments.length })}
          </span>
        ) : null}
        {p.advokatRequired ? (
          <span>
            <IconShieldCheck aria-hidden /> {t("advokatOnly")}
          </span>
        ) : null}
      </span>
      {open ? (
        <dl className="dxci-pass">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
          {p.requiredDocuments.length ? (
            <div>
              <dt>{tp("documents")}</dt>
              <dd>{p.requiredDocuments.join(", ")}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <span className="dxci-offer__acts">
        <Btn small onClick={() => setOpen((v) => !v)}>
          {open ? t("hidePassport") : t("showPassport")}
        </Btn>
        <Btn small kind="primary" icon={<IconArrowRight />} onClick={onOrder}>
          {t("orderOffer")}
        </Btn>
      </span>
    </article>
  );
}

function Matches({ items, title, onOpen }: { items: LawyerMatch[]; title: string; onOpen: (id: string) => void }) {
  const t = useTranslations("portal.client.intake");
  const te = useTranslations("enums");
  const locale = useLocale();
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 4);
  return (
    <section className="dxcs-box">
      <h2>
        <IconUsers aria-hidden /> {title}
      </h2>
      <ul className="dxch-list">
        {shown.map((m) => (
          <li key={m.id}>
            <button type="button" onClick={() => onOpen(m.lawyerUserId || m.id)}>
              <Avatar name={m.name || "A"} size={32} />
              <span className="dxci-m">
                <b>{m.name || "—"}</b>
                <small>
                  {[m.rating ? `★ ${fmtRating(m.rating, locale)}` : "", m.region ? (te.has(`regions.${m.region}`) ? te(`regions.${m.region}`) : humanizeSlug(m.region)) : "", m.reason].filter(Boolean).join(" · ")}
                </small>
              </span>
              <Tag tone="accent">{t("matchPct", { n: Math.min(m.matchPct, 100) })}</Tag>
            </button>
          </li>
        ))}
      </ul>
      {items.length > 4 ? (
        <span>
          <Btn small kind="plain" onClick={() => setAll((v) => !v)}>
            {all ? t("fewerMatches") : t("viewAllMatches")}
          </Btn>
        </span>
      ) : null}
    </section>
  );
}

function Sources({ sources, title, lead }: { sources: LegalSource[]; title: string; lead?: string }) {
  const t = useTranslations("portal.client.intake");
  if (!sources.length) return null;
  return (
    <section className="dxcs-box">
      <h2>{title}</h2>
      {lead ? <p className="dxcs-lead">{lead}</p> : null}
      <ul className="dxci-src">
        {sources.map((s) => (
          <li key={s.key || s.url || s.title}>
            {s.url ? (
              <a href={s.url} target="_blank" rel="noreferrer noopener">
                <span>{s.title}</span>
                {s.trustLevel === "official" ? <Tag tone="ok">{t("official")}</Tag> : null}
                <IconExternal aria-hidden />
              </a>
            ) : (
              <span>
                <span>{s.title}</span>
                {s.trustLevel === "official" ? <Tag tone="ok">{t("official")}</Tag> : null}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// "Useful / not useful"; not useful goes to the moderators.
function Feedback({ requestId }: { requestId: string }) {
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
      /* best effort */
    } finally {
      setBusy(false);
    }
  }
  if (sent) return <p className="dxci-fb">{t(sent === "yes" ? "feedbackThanks" : "feedbackQueued")}</p>;
  return (
    <p className="dxci-fb">
      <span>{t("feedbackAsk")}</span>
      <Btn small disabled={busy} onClick={() => void send(true)}>
        {t("feedbackYes")}
      </Btn>
      <Btn small disabled={busy} onClick={() => void send(false)}>
        {t("feedbackNo")}
      </Btn>
    </p>
  );
}
