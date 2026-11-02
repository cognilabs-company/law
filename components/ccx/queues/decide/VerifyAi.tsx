"use client";

import { useLocale, useTranslations } from "next-intl";
import { labelIn } from "@/lib/backendLabel";
import { dateOnly, fmtNum } from "@/lib/date";
import type { AiRisk } from "@/lib/services/achievements";
import type { Mismatch } from "@/lib/services/advocatePractice";
import { IcCheck, IcClose, IcFlag, IcSearch, IcShield } from "../../icons";

type Tone = "ok" | "warn" | "bad";
type Sig = { key: string; label: string; value: string; tone: Tone; sub?: string };

function ToneIcon({ tone }: { tone: Tone }) {
  switch (tone) {
    case "ok":
      return <IcCheck size={15} />;
    case "warn":
      return <IcFlag size={15} />;
    default:
      return <IcClose size={15} />;
  }
}

function Tiles({ items }: { items: Sig[] }) {
  if (!items.length) return null;
  return (
    <ul className="opx-vrf-sig">
      {items.map((s) => (
        <li key={s.key} data-tone={s.tone}>
          <i aria-hidden="true">
            <ToneIcon tone={s.tone} />
          </i>
          <span>
            <small>{s.label}</small>
            <b className="opx-num">{s.value}</b>
            {s.sub ? <em>{s.sub}</em> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

const LEVEL_TONE = { low: "ok", medium: "warn", high: "hot" } as const;

export function AiPanel({ ai, advisory }: { ai: AiRisk; advisory: boolean }) {
  const t = useTranslations("callCenter.achievements.ai");
  const tv = useTranslations("admin.ccx.verify");
  const locale = useLocale();
  const pct = (n: number) => `${fmtNum(Math.round(n * 100), locale)}%`;
  const yes = (key: string, v: boolean | null): Sig | null => (v === null ? null : { key, label: t(key), value: v ? t("yes") : t("no"), tone: v ? "ok" : "bad" });
  const risk = (key: string, s: number | null): Sig | null => (s === null ? null : { key, label: t(key), value: pct(s), tone: s < 0.33 ? "ok" : s < 0.66 ? "warn" : "bad" });
  const trust = (key: string, s: number | null): Sig | null => (s === null ? null : { key, label: t(key), value: pct(s), tone: s >= 0.66 ? "ok" : s >= 0.33 ? "warn" : "bad" });
  const pii: Sig = { key: "pii", label: t("pii"), value: ai.piiCount ? tv("piiN", { n: ai.piiCount }) : t("no"), tone: ai.piiCount ? "bad" : "ok" };
  const items = [
    yes("documentReadable", ai.documentReadable),
    yes("claimSupported", ai.claimSupported),
    yes("stageMatches", ai.stageMatches),
    yes("resultMatches", ai.resultMatches),
    trust("authenticity", ai.authenticity),
    risk("manipulation", ai.manipulation),
    risk("aiGenerated", ai.aiGenerated),
    yes("signature", ai.signature),
    yes("seal", ai.seal),
    yes("eSignature", ai.eSignature),
    pii,
  ].filter((s): s is Sig => s !== null);
  const risks = ai.risks.map((r) => ({ code: r.code, text: labelIn(r, locale) })).filter((r) => r.text);

  return (
    <section className="opx-psec opx-vrf-ai" aria-label={t("title")}>
      <h3>
        <IcShield size={17} />
        {t("title")}
        {ai.status === "running" ? (
          <span className="opx-pill" data-tone="info">
            {t("running")}
          </span>
        ) : ai.riskLevel ? (
          <span className="opx-pill" data-tone={LEVEL_TONE[ai.riskLevel]}>
            {t("risk", { level: t(`level.${ai.riskLevel}`) })}
          </span>
        ) : null}
      </h3>
      <p className="opx-vrf-muted">{advisory ? t("advisory") : t("advisoryShort")}</p>
      <Tiles items={items} />
      {risks.length ? (
        <div className="opx-vrf-codes">
          <small>{t("codes")}</small>
          <ul>
            {risks.map((r) => (
              <li key={r.code} className="opx-pill" data-tone="warn">
                {r.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {ai.notes.length ? (
        <div className="opx-vrf-codes">
          <small>{t("notes")}</small>
          <ol className="opx-vrf-notes">
            {ai.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

export function Mismatches({ rows }: { rows: Mismatch[] }) {
  const t = useTranslations("callCenter.licenses");
  const tv = useTranslations("callCenter.verify.field");
  const locale = useLocale();
  const shown = (field: string, v: string) => (field === "advocate_status_started_at" && /^\d{4}-\d{2}-\d{2}/.test(v) ? dateOnly(v.slice(0, 10), locale) : v);
  const items = rows
    .filter((m) => tv.has(m.field) && (m.extracted || m.submitted))
    .map((m): Sig => ({
      key: m.field,
      label: tv(m.field),
      value: shown(m.field, m.extracted) || t("notRead"),
      tone: m.matches ? "ok" : "warn",
      sub: m.matches ? undefined : t("typed", { v: shown(m.field, m.submitted) || "—" }),
    }));
  if (!items.length) return null;
  return (
    <section className="opx-psec opx-vrf-ai" aria-label={t("aiTitle")}>
      <h3>
        <IcSearch size={17} />
        {t("aiTitle")}
      </h3>
      <p className="opx-vrf-muted">{t("aiAdvisory")}</p>
      <Tiles items={items} />
    </section>
  );
}
