"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { classifyProblem, getMyMatches, type AiClassification, type LawyerMatch } from "@/lib/services/backend";
import { initials } from "@/lib/lawyers";
import BusinessHoursBadge from "@/components/portal/BusinessHoursBadge";
import { IconSparkle, IconArrowRight, IconAlert, IconStar, IconMapPin } from "@/components/icons";

export default function ClientIntake() {
  const t = useTranslations("portal.client.intake");
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiClassification | null>(null);
  const [matches, setMatches] = useState<LawyerMatch[]>([]);
  const [failed, setFailed] = useState(false);

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
        <div className="ppanel intake__res">
          <div className="intake__resh">
            <b>{t("resultTitle")}</b>
            <span className={`intake__urg intake__urg--${result.urgency}`}>{t.has(`urgency.${result.urgency}`) ? t(`urgency.${result.urgency}`) : result.urgency}</span>
          </div>
          <div className="intake__kv"><label>{t("category")}</label><b>{result.category || "—"}</b></div>
          {result.summary ? <p className="intake__summary">{result.summary}</p> : null}
          {result.recommendedService ? (
            <>
              <div className="intake__kv"><label>{t("recommended")}</label><b>{result.recommendedService}</b></div>
              <button
                className="btn btn--grad btn--full"
                type="button"
                onClick={() => router.push(`/portal/client/services?q=${encodeURIComponent(result.recommendedService)}`)}
              >
                {t("orderRecommended")}
                <IconArrowRight />
              </button>
            </>
          ) : null}

          {matches.length ? (
            <div className="intake__matches">
              <div className="intake__resh" style={{ marginTop: 10 }}>
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
                        {m.region ? <i><IconMapPin />{m.region}</i> : null}
                        {m.area ? <i>{m.area}</i> : null}
                      </span>
                    </span>
                    <span className="advpick__price">{t("matchPct", { n: Math.min(m.matchPct, 100) })}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="intake__acts">
            <button className="btn btn--soft" type="button" onClick={() => router.push("/portal/client/sos")}>{t("orSos")}</button>
          </div>
        </div>
      ) : null}

      {failed ? (
        <div className="ppanel intake__res">
          <div className="intake__resh"><span className="intake__failicon"><IconAlert /></span><b>{t("failedTitle")}</b></div>
          <p className="intake__summary">{t("failedText")}</p>
          <button className="btn btn--pri" type="button" onClick={() => router.push("/portal/client/sos")}>{t("orSos")}</button>
        </div>
      ) : null}
    </div>
  );
}
