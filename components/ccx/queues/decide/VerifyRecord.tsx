"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAchievementLabels } from "@/components/portal/achievementLabels";
import { dateOnly } from "@/lib/date";
import { logApiError } from "@/lib/http";
import { downloadAchievementEvidence } from "@/lib/services/achievements";
import { downloadLicenseEvidence } from "@/lib/services/advocatePractice";
import { downloadExperienceEvidence, type ExperienceEvidence, type HistoryRow } from "@/lib/services/experience";
import { Section, Timeline } from "../../panel/bits";
import { IcDoc, IcLayers, IcUser } from "../../icons";
import { checkLabel } from "./VerifyChecklist";
import { fmtSize, type VerifyDetail, type VerifyKind } from "./VerifyModel";

type Fact = { label: string; value: string; field?: string; wide?: boolean };

const LICENSE_FIELDS = ["holderName", "certificateNumber", "licenseNumber", "issuingAuthority", "statusStartedAt"] as const;
const ISO_DAY = /d{4}-d{2}-d{2}/g;

function useFacts(kind: VerifyKind, d: VerifyDetail, catName: (id: string) => string): Fact[] {
  const locale = useLocale();
  const tc = useTranslations("callCenter.experience");
  const tp = useTranslations("portal.experience");
  const ta = useTranslations("portal.achievements");
  const tv = useTranslations("callCenter.verify.field");
  const tf = useTranslations("portal.practice.f");
  const L = useAchievementLabels();
  if (kind === "experience") {
    const it = d.exp;
    if (!it) return [];
    const pre = it.kind === "pre_advocate_employment";
    const period = (p: { startedAt: string; endedAt: string; isCurrent: boolean }) => [p.startedAt ? dateOnly(p.startedAt, locale) : "", p.isCurrent ? tp("now") : p.endedAt ? dateOnly(p.endedAt, locale) : ""].filter(Boolean).join(" — ");
    return [
      { label: tp("kindLabel"), value: tp(`kind.${it.kind}`) },
      { label: tp("category"), value: pre ? "" : catName(it.categoryId), field: "category_id" },
      { label: tp("workplace"), value: it.workplace, field: "workplace", wide: true },
      ...it.positions.map((p, i) => ({ label: tp("positionN", { n: i + 1 }), value: [p.title, period(p)].filter(Boolean).join(" · "), field: "positions", wide: true })),
      { label: tc("years"), value: it.years === null || pre ? "" : String(it.years) },
      { label: tp("description"), value: it.description, field: "description", wide: true },
    ];
  }
  if (kind === "achievement") {
    const it = d.ach;
    if (!it) return [];
    return [
      { label: ta("stageLabel"), value: L.stage(it.stage, it.stageLabel) },
      { label: ta("resultLabel"), value: L.result(it.result, it.resultLabel) },
      { label: ta("category"), value: it.categoryTitle || catName(it.categoryId) },
      { label: ta("date"), value: it.achievedAt ? dateOnly(it.achievedAt, locale) : "" },
      { label: tv("description"), value: it.description, wide: true },
    ];
  }
  const it = d.lic;
  if (!it) return [];
  return LICENSE_FIELDS.map((k) => ({ label: tf(k), value: k === "statusStartedAt" && it[k] ? dateOnly(it[k], locale) : it[k], wide: k === "holderName" || k === "issuingAuthority" }));
}

function downloadOf(kind: VerifyKind): (ev: ExperienceEvidence) => Promise<void> {
  if (kind === "achievement") return downloadAchievementEvidence;
  if (kind === "license") return downloadLicenseEvidence;
  return downloadExperienceEvidence;
}

export function RecordCard({ kind, detail, catName }: { kind: VerifyKind; detail: VerifyDetail; catName: (id: string) => string }) {
  const t = useTranslations("callCenter.verify");
  const tx = useTranslations("admin.ccx.verify");
  const facts = useFacts(kind, detail, catName).filter((f) => f.value);
  const [loading, setLoading] = useState("");
  const changed = (field?: string) => !!field && detail.changedFields.some((c) => c === field || c.startsWith(`${field}.`));

  const download = async (ev: ExperienceEvidence) => {
    if (loading) return;
    setLoading(ev.id);
    try {
      await downloadOf(kind)(ev);
    } catch (e) {
      logApiError(`${kind}.download`, e);
    } finally {
      setLoading("");
    }
  };

  return (
    <Section icon={<IcDoc size={17} />} title={t("submitted")}>
      {facts.length ? (
        <dl className="opx-vrf-facts">
          {facts.map((f, i) => {
            const hit = changed(f.field);
            return (
              <div key={`${f.label}-${i}`} data-wide={f.wide ? "" : undefined} data-changed={hit ? "" : undefined}>
                <dt>
                  {f.label}
                  {hit ? <em>{tx("changed")}</em> : null}
                </dt>
                <dd>{f.value}</dd>
              </div>
            );
          })}
        </dl>
      ) : null}
      <div className="opx-vrf-ev">
        <small>{t("field.evidence")}</small>
        {detail.evidence.length ? (
          <span className="opx-files">
            {detail.evidence.map((f) => (
              <button key={f.id} type="button" className="opx-file" aria-busy={loading === f.id} title={tx("download", { name: f.fileName || t("file") })} onClick={() => void download(f)}>
                <IcDoc size={16} />
                <span>{f.fileName || t("file")}</span>
                {f.size ? <small className="opx-num">{fmtSize(f.size)}</small> : null}
                <svg className="opx-i opx-vrf-dl" viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14" />
                </svg>
              </button>
            ))}
          </span>
        ) : (
          <p className="opx-pnone">{t("noFiles")}</p>
        )}
      </div>
    </Section>
  );
}

export function Changes({ kind, detail, catName }: { kind: VerifyKind; detail: VerifyDetail; catName: (id: string) => string }) {
  const t = useTranslations("callCenter.verify");
  const tv = useTranslations("callCenter.verify.field");
  const tp = useTranslations("portal.experience");
  const tx = useTranslations("admin.ccx.verify");
  const locale = useLocale();
  const L = useAchievementLabels();
  const fieldLabel = (field: string) => {
    if (kind === "experience") {
      const m = /^positions\.(\d+)/.exec(field);
      if (m) return tp("positionN", { n: Number(m[1]) + 1 });
    }
    return tv.has(field) ? tv(field) : tv("other");
  };
  const named = (field: string): ((v: string) => string) | null => {
    if (kind !== "achievement") return null;
    if (field === "process_stage") return (v) => L.stage(v);
    if (field === "result_scope") return (v) => L.result(v);
    if (field === "category_id") return catName;
    if (field === "achieved_at") return (v) => dateOnly(v, locale);
    return null;
  };
  const days = (v: string) => v.replace(ISO_DAY, (d) => dateOnly(d, locale));
  const rows = detail.diff.map((r) => {
    const name = named(r.field);
    return name ? { ...r, before: r.before ? name(r.before) : "", after: r.after ? name(r.after) : "" } : { ...r, before: days(r.before), after: days(r.after) };
  });
  return (
    <section className="opx-psec opx-vrf-diff" aria-label={t("changes")}>
      <h3>
        <IcLayers size={17} />
        {t("changes")}
        <span className="opx-pill" data-tone={detail.isRevision ? "warn" : "info"}>
          {detail.isRevision ? tx("nChanged", { n: detail.diff.length }) : t("newRecord")}
        </span>
      </h3>
      {!detail.isRevision ? (
        <p className="opx-pnone">{t("newRecordText")}</p>
      ) : !rows.length ? (
        <p className="opx-pnone">{t("noChanges")}</p>
      ) : (
        <ul className="opx-vrf-diff__list">
          {rows.map((r) => (
            <li key={r.field} data-kind={r.kind}>
              <b>{r.label || fieldLabel(r.field)}</b>
              {r.before ? <del>{r.before}</del> : null}
              {r.after ? <ins>{r.after}</ins> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Versions({ kind, history }: { kind: VerifyKind; history: HistoryRow[] }) {
  const t = useTranslations("callCenter.verify");
  const tp = useTranslations("portal.experience");
  const ta = useTranslations("portal.achievements");
  const ts = useTranslations("portal.practice.status");
  if (history.length < 2) return null;
  const label = (h: HistoryRow) => {
    if (kind === "experience") return tp.has(`status.${h.status}`) ? tp(`status.${h.status}`) : "";
    if (kind === "achievement") return ta.has(`status.${h.status}`) ? ta(`status.${h.status}`) : "";
    return ts.has(h.status) ? ts(h.status) : "";
  };
  return <Timeline steps={history.map((h) => ({ id: h.id, at: h.submittedAt, title: t("version", { n: h.version ?? 1 }), sub: label(h) }))} empty="" />;
}

const DECISION_TONE = { approved: "ok", changes_requested: "warn", rejected: "hot" } as const;

export function PastReviews({ detail }: { detail: VerifyDetail }) {
  const t = useTranslations("callCenter.verify");
  const tp = useTranslations("portal.experience");
  const locale = useLocale();
  if (!detail.reviews.length) return null;
  return (
    <Section icon={<IcUser size={17} />} title={t("past")} count={detail.reviews.length}>
      <ol className="opx-vrf-past">
        {detail.reviews.map((r) => (
          <li key={r.id || r.reviewedAt}>
            <div className="opx-vrf-past__head">
              <span className="opx-pill" data-tone={r.decision ? DECISION_TONE[r.decision] : "mute"}>
                {r.decision ? (tp.has(`status.${r.decision}`) ? tp(`status.${r.decision}`) : t(`decision.${r.decision}`)) : t("decision.other")}
              </span>
              {r.reviewedAt ? (
                <time className="opx-num" dateTime={r.reviewedAt}>
                  {dateOnly(r.reviewedAt, locale)}
                </time>
              ) : null}
              {r.reviewer ? (
                <span className="opx-vrf-past__by">
                  <IcUser size={14} />
                  {r.reviewer}
                </span>
              ) : null}
            </div>
            {r.reason ? <p>{r.reason}</p> : null}
            {r.checklist.some((c) => c.verdict) ? (
              <ul className="opx-vrf-past__items" aria-label={t("pastItems")}>
                {r.checklist
                  .filter((c) => c.verdict)
                  .map((c) => {
                    const i = detail.checks.findIndex((x) => x.key === c.key);
                    return (
                      <li key={c.key} data-v={c.verdict}>
                        <b>{i >= 0 ? checkLabel(detail.checks[i], i, locale, (n) => t("checkN", { n })) : t("checkUnknown")}</b>
                        <em>{t.has(`verdict.${c.verdict}`) ? t(`verdict.${c.verdict}`) : t("verdictOther")}</em>
                        {c.note ? <small>{c.note}</small> : null}
                      </li>
                    );
                  })}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </Section>
  );
}
