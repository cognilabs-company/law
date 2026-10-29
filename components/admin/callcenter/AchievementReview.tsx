"use client";

import "./experienceReview.css";
import { useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconAlert, IconCheck, IconCircleX, IconMinus, IconSparkle, IconStar } from "@/components/icons";
import QueueHead from "./QueueHead";
import QueueSeller from "./QueueSeller";
import ListPager from "@/components/ui/ListPager";
import { EmptyState, ErrorState, Skeleton } from "@/components/portal/DataState";
import { useAchievementLabels } from "@/components/portal/achievementLabels";
import { dateOnly, fmtNum } from "@/lib/date";
import { closeAchievementRoom, downloadAchievementEvidence, getAchievementForReview, listAchievementQueue, openAchievementRoom, queueItemOf, reviewAchievement, type AchievementQueueItem, type AiRisk } from "@/lib/services/achievements";
import { labelIn } from "@/lib/backendLabel";
import { useCategories } from "./ExperienceReview";
import { useReviewQueue } from "./useReviewQueue";
import VerifyReview, { type VerifySource } from "./VerifyReview";

// Contract 2026-10-29 §3: the operator's achievement queue. Each record
// opens the shared verification screen with the software's risk indicators
// beside it — advice only; the operator alone decides, and approval needs a
// safe public text for the profile.

const EVENTS = /^marketplace\.achievement_(submitted|queue_updated|reviewed)$/;
const STATUSES = ["pending_review", "ai_analysis_pending", "changes_requested", "approved", "rejected", ""] as const;

// A yes/no indicator: is a "yes" good news (readable) or a warning (PII)?
function Sig({ label, v, good = true }: { label: string; v: boolean | null; good?: boolean }): ReactElement | null {
  const t = useTranslations("callCenter.achievements.ai");
  if (v === null) return null;
  const ok = v === good;
  const Icon = ok ? IconCheck : IconCircleX;
  return (
    <li data-tone={ok ? "ok" : "bad"}>
      <i aria-hidden="true">
        <Icon />
      </i>
      <span>
        <small>{label}</small>
        <b>{v ? t("yes") : t("no")}</b>
      </span>
    </li>
  );
}
// A risk share 0…1 (§7): lower is better.
function Risk({ label, score }: { label: string; score: number | null }): ReactElement | null {
  const locale = useLocale();
  if (score === null) return null;
  const tone = score < 0.33 ? "ok" : score < 0.66 ? "warn" : "bad";
  return (
    <li data-tone={tone}>
      <i aria-hidden="true">{tone === "ok" ? <IconCheck /> : tone === "bad" ? <IconAlert /> : <IconMinus />}</i>
      <span>
        <small>{label}</small>
        <b>{`${fmtNum(Math.round(score * 100), locale)}%`}</b>
      </span>
    </li>
  );
}

// The normalized software analysis (§7), shared by achievements and
// certificates: indicators for the operator, never a verdict. Risks show
// with the backend's labels only.
export function AiRiskPanel({ ai, advisory = true }: { ai: AiRisk; advisory?: boolean }): ReactElement {
  const t = useTranslations("callCenter.achievements.ai");
  const locale = useLocale();
  const risks = ai.risks.map((r) => ({ code: r.code, text: labelIn(r, locale) })).filter((r) => r.text);
  return (
    <section className="vrf__ai" aria-label={t("title")}>
      <div className="vrf__ai-h">
        <span aria-hidden="true">
          <IconSparkle />
        </span>
        <div>
          <b>{t("title")}</b>
          <small>{advisory ? t("advisory") : t("advisoryShort")}</small>
        </div>
        {ai.status === "running" ? <span className="vrf__lvl">{t("running")}</span> : ai.riskLevel ? <span className="vrf__lvl" data-l={ai.riskLevel}>{t("risk", { level: t(`level.${ai.riskLevel}`) })}</span> : null}
      </div>
      <ul className="vrf__sig">
        <Sig label={t("documentReadable")} v={ai.documentReadable} />
        <Sig label={t("claimSupported")} v={ai.claimSupported} />
        <Sig label={t("stageMatches")} v={ai.stageMatches} />
        <Sig label={t("resultMatches")} v={ai.resultMatches} />
        {ai.authenticity !== null ? (
          <li data-tone={ai.authenticity >= 0.66 ? "ok" : ai.authenticity >= 0.33 ? "warn" : "bad"}>
            <i aria-hidden="true">{ai.authenticity >= 0.66 ? <IconCheck /> : <IconAlert />}</i>
            <span>
              <small>{t("authenticity")}</small>
              <b>{`${fmtNum(Math.round(ai.authenticity * 100), locale)}%`}</b>
            </span>
          </li>
        ) : null}
        <Risk label={t("manipulation")} score={ai.manipulation} />
        <Risk label={t("aiGenerated")} score={ai.aiGenerated} />
        <Sig label={t("signature")} v={ai.signature} />
        <Sig label={t("seal")} v={ai.seal} />
        <Sig label={t("eSignature")} v={ai.eSignature} />
        <li data-tone={ai.piiCount ? "bad" : "ok"}>
          <i aria-hidden="true">{ai.piiCount ? <IconCircleX /> : <IconCheck />}</i>
          <span>
            <small>{t("pii")}</small>
            <b>{ai.piiCount ? t("piiN", { n: ai.piiCount }) : t("no")}</b>
          </span>
        </li>
      </ul>
      {risks.length ? (
        <ul className="vrf__codes" aria-label={t("codes")}>
          {risks.map((r) => (
            <li key={r.code}>{r.text}</li>
          ))}
        </ul>
      ) : null}
      {ai.notes.length ? (
        <ul className="vrf__notes" aria-label={t("notes")}>
          {ai.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function AchievementReview({ id, onDone }: { id: string; onDone: () => void }): ReactElement {
  const t = useTranslations("portal.achievements");
  const tc = useTranslations("callCenter.achievements");
  const tv = useTranslations("callCenter.verify.field");
  const locale = useLocale();
  const L = useAchievementLabels();
  const catName = useCategories();
  const [ai, setAi] = useState<{ risk: AiRisk; advisory: boolean } | null>(null);
  const source: VerifySource = {
    kind: "achievement",
    title: id,
    load: async (signal) => {
      const d = await getAchievementForReview(id, signal);
      const it = d.record;
      setAi(d.ai ? { risk: d.ai, advisory: d.advisoryOnly } : null);
      const running = it?.status === "ai_analysis_pending" || d.ai?.status === "running";
      return {
        pending: it?.status === "pending_review" || it?.status === "ai_analysis_pending",
        blocked: running ? tc("aiPending") : "",
        isRevision: !!d.previous,
        record: it,
        evidence: it?.evidence ?? [],
        diff: d.diff.map((r) => {
          const name = r.field === "process_stage" ? L.stage : r.field === "result_scope" ? L.result : r.field === "category_id" ? catName : r.field === "achieved_at" ? (v: string) => dateOnly(v, locale) : null;
          return name ? { ...r, before: r.before ? name(r.before) : "", after: r.after ? name(r.after) : "" } : r;
        }),
        checks: d.checks,
        reviews: d.reviews,
        room: d.room,
        seller: d.seller,
        history: d.history,
      };
    },
    historyLabel: (h) => (t.has(`status.${h.status}`) ? t(`status.${h.status}`) : ""),
    review: (input) => reviewAchievement(id, input),
    openRoom: () => openAchievementRoom(id),
    closeRoom: (room) => closeAchievementRoom(id, room),
    download: downloadAchievementEvidence,
    facts: (raw) => {
      const it = raw as AchievementQueueItem | null;
      if (!it) return [];
      return [
        { label: t("stageLabel"), value: L.stage(it.stage, it.stageLabel) },
        { label: t("resultLabel"), value: L.result(it.result, it.resultLabel) },
        { label: t("category"), value: it.categoryTitle || catName(it.categoryId) },
        { label: t("date"), value: it.achievedAt ? dateOnly(it.achievedAt, locale) : "" },
        { label: t("version"), value: it.version ? String(it.version) : "" },
        { label: t("description"), value: it.description },
      ];
    },
    fieldLabel: (field) => (tv.has(field) ? tv(field) : tv("other")),
    aside: () => (ai ? <AiRiskPanel ai={ai.risk} advisory={ai.advisory} /> : null),
    publicText: { label: tc("publicLabel"), hint: tc("publicHint") },
  };
  return <VerifyReview source={source} onDone={onDone} />;
}

export function AchievementQueue({ onCount }: { onCount?: (n: number) => void }): ReactElement | null {
  const t = useTranslations("callCenter.achievements");
  const ta = useTranslations("portal.achievements");
  const locale = useLocale();
  const L = useAchievementLabels();
  const catName = useCategories();
  const q = useReviewQueue<AchievementQueueItem>((o, signal) => listAchievementQueue(o, signal), { scope: "achievements", events: EVENTS, parse: queueItemOf, onCount });
  const [open, setOpen] = useState("");

  if (q.denied) return null;
  const { items } = q;
  return (
    <section className="ppanel xpr esc" data-ai-target="callcenter:achievements">
      <QueueHead
        icon={IconStar}
        title={t("title")}
        lead={t("lead")}
        count={items && !q.failed ? q.total : null}
        refreshLabel={t("refresh")}
        onRefresh={() => void q.reload()}
        refreshing={q.loading}
        aiBase="call_center.achievements"
        statuses={STATUSES.map((s) => ({ value: s, label: s ? ta(`status.${s}`) : t("all") }))}
        status={q.status}
        onStatus={q.setStatus}
        statusLabel={t("filter")}
      />
      {q.failed ? (
        <ErrorState title={t("loadFailed")} onRetry={() => void q.reload()} compact />
      ) : !items ? (
        <Skeleton rows={3} />
      ) : !items.length ? (
        <EmptyState size="sm" icon={<IconStar />} title={t("empty")} />
      ) : (
        <>
          <ul className="xpr__queue">
            {items.map((it) => (
              <li key={it.id} data-open={open === it.id || undefined}>
                <button type="button" className="xpr__qrow" onClick={() => setOpen(open === it.id ? "" : it.id)} aria-expanded={open === it.id}>
                  <QueueSeller seller={it.seller} fallback={t("seller")} />
                  <span>{[L.stage(it.stage, it.stageLabel), L.result(it.result, it.resultLabel), it.categoryTitle || catName(it.categoryId)].filter(Boolean).join(" · ")}</span>
                  <span>{[it.sourceId ? t("revision") : t("newRecord"), q.status ? "" : L.status(it.status)].filter(Boolean).join(" · ")}</span>
                  <time>{it.submittedAt ? dateOnly(it.submittedAt, locale) : ""}</time>
                </button>
                {open === it.id ? (
                  <AchievementReview
                    id={it.id}
                    onDone={() => {
                      setOpen("");
                      void q.reload();
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
          <ListPager count={items.length} total={q.total} step={50} onMore={() => void q.more()} loading={q.loading} />
        </>
      )}
    </section>
  );
}
