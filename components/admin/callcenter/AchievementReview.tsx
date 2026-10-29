"use client";

import "./experienceReview.css";
import { useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconAlert, IconCheck, IconCircleX, IconMinus, IconSparkle, IconStar } from "@/components/icons";
import QueueHead from "./QueueHead";
import PersonName from "@/components/ui/PersonName";
import ListPager from "@/components/ui/ListPager";
import { EmptyState, ErrorState, Skeleton } from "@/components/portal/DataState";
import { useAchievementLabels } from "@/components/portal/achievementLabels";
import { dateOnly, fmtNum } from "@/lib/date";
import { closeAchievementRoom, downloadAchievementEvidence, getAchievementForReview, listAchievementQueue, openAchievementRoom, reviewAchievement, type AchievementQueueItem, type AiRisk, type Level } from "@/lib/services/achievements";
import { useCategories } from "./ExperienceReview";
import { useReviewQueue } from "./useReviewQueue";
import VerifyReview, { type VerifySource } from "./VerifyReview";

// Contract 2026-10-29 §3: the operator's achievement queue. Each record
// opens the shared verification screen with the software's risk indicators
// beside it — advice only; the operator alone decides, and approval needs a
// safe public text for the profile.

const EVENTS = /^marketplace\.achievement_(submitted|queue_updated)$/;
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
function Risk({ label, level, score }: { label: string; level: Level; score: number | null }): ReactElement | null {
  const t = useTranslations("callCenter.achievements.ai");
  const locale = useLocale();
  if (!level && score === null) return null;
  const lv: Level = level || (score === null ? "" : score >= 0.66 ? "high" : score >= 0.33 ? "medium" : "low");
  return (
    <li data-tone={lv === "low" ? "ok" : lv === "high" ? "bad" : "warn"}>
      <i aria-hidden="true">{lv === "low" ? <IconCheck /> : lv === "high" ? <IconAlert /> : <IconMinus />}</i>
      <span>
        <small>{label}</small>
        <b>{[lv ? t(`level.${lv}`) : "", score !== null ? `${fmtNum(Math.round(score * 100), locale)}%` : ""].filter(Boolean).join(" · ")}</b>
      </span>
    </li>
  );
}

export function AiRiskPanel({ ai }: { ai: AiRisk }): ReactElement {
  const t = useTranslations("callCenter.achievements.ai");
  const locale = useLocale();
  const codeLabel = (c: { code: string; label: string }) => c.label || (t.has(`code.${c.code}`) ? t(`code.${c.code}`) : t("codeOther"));
  return (
    <section className="vrf__ai" aria-label={t("title")}>
      <div className="vrf__ai-h">
        <span aria-hidden="true">
          <IconSparkle />
        </span>
        <div>
          <b>{t("title")}</b>
          <small>{t("advisory")}</small>
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
        <Risk label={t("manipulation")} {...ai.manipulation} />
        <Risk label={t("aiGenerated")} {...ai.aiGenerated} />
        <Sig label={t("signature")} v={ai.signature} />
        <Sig label={t("seal")} v={ai.seal} />
        <Sig label={t("eSignature")} v={ai.eSignature} />
        <Sig label={t("pii")} v={ai.pii} good={false} />
      </ul>
      {ai.riskCodes.length ? (
        <ul className="vrf__codes" aria-label={t("codes")}>
          {ai.riskCodes.map((c) => (
            <li key={c.code}>{codeLabel(c)}</li>
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
  const [ai, setAi] = useState<AiRisk | null>(null);
  const source: VerifySource = {
    kind: "achievement",
    title: id,
    load: async (signal) => {
      const d = await getAchievementForReview(id, signal);
      const it = d.record;
      setAi(d.ai);
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
      };
    },
    review: (input) => reviewAchievement(id, input),
    openRoom: () => openAchievementRoom(id),
    closeRoom: (room) => closeAchievementRoom(id, room),
    download: downloadAchievementEvidence,
    facts: (raw) => {
      const it = raw as AchievementQueueItem | null;
      if (!it) return [];
      return [
        { label: t("stageLabel"), value: L.stage(it.stage) },
        { label: t("resultLabel"), value: L.result(it.result) },
        { label: t("category"), value: it.categoryTitle || catName(it.categoryId) },
        { label: t("date"), value: it.achievedAt ? dateOnly(it.achievedAt, locale) : "" },
        { label: t("version"), value: it.version ? String(it.version) : "" },
        { label: t("description"), value: it.description },
      ];
    },
    fieldLabel: (field) => (tv.has(field) ? tv(field) : tv("other")),
    aside: () => (ai ? <AiRiskPanel ai={ai} /> : null),
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
  const q = useReviewQueue<AchievementQueueItem>((o, signal) => listAchievementQueue(o, signal), { scope: "achievements", events: EVENTS, onCount });
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
                  <b>{it.sellerName || it.sellerUserId ? <PersonName id={it.sellerUserId} name={it.sellerName} /> : t("seller")}</b>
                  <span>{[L.stage(it.stage), L.result(it.result), it.categoryTitle || catName(it.categoryId)].filter(Boolean).join(" · ")}</span>
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
