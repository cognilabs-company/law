"use client";

import "./experienceReview.css";
import { useEffect, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconAward } from "@/components/icons";
import QueueHead from "./QueueHead";
import QueueSeller from "./QueueSeller";
import ListPager from "@/components/ui/ListPager";
import Segmented from "@/components/ui/Segmented";
import { EmptyState, ErrorState, Skeleton } from "@/components/portal/DataState";
import { categoryName } from "@/lib/categoryNames";
import { dateOnly } from "@/lib/date";
import { getServiceCategories, type BackendCategory } from "@/lib/services/backend";
import {
  EXPERIENCE_KINDS,
  experienceQueueItemOf,
  closeExperienceRoom,
  downloadExperienceEvidence,
  getExperienceForReview,
  listExperienceQueue,
  openExperienceRoom,
  reviewExperience,
  type ExperienceKind,
  type ExperienceQueueItem,
} from "@/lib/services/experience";
import { useReviewQueue } from "./useReviewQueue";
import VerifyReview, { type VerifySource } from "./VerifyReview";

// Experience verification for the call center (TSK-659111, TSK-100467,
// TSK-874927, TSK-365169): the queue, oldest first; each record opens the
// shared verification screen (VerifyReview).

const EVENTS = /^marketplace\.experience_(submitted|queue_updated|reviewed)$/;
const STATUSES = ["pending_review", "approved", "rejected", ""] as const;

// A category's name by id (the list is read once per screen).
export function useCategories() {
  const locale = useLocale();
  const [cats, setCats] = useState<BackendCategory[]>([]);
  useEffect(() => {
    let alive = true;
    getServiceCategories().then(
      (c) => alive && setCats(c),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);
  return (id: string) => {
    const c = cats.find((x) => x.id === id);
    return c ? categoryName({ slug: c.slug, title: c.name }, locale) : "";
  };
}

export function ExperienceQueue({ onCount }: { onCount?: (n: number) => void }): ReactElement | null {
  const t = useTranslations("callCenter.experience");
  const tp = useTranslations("portal.experience");
  const locale = useLocale();
  const catName = useCategories();
  // The queue is for call_center/admin/manager or approvals.manage;
  // callcenter.access alone answers 403, and the tab then stays away.
  // Category experience and pre-advocate employment, apart: experience_kind
  // is the backend's own filter (2026-10-29 §13).
  const [kind, setKind] = useState<ExperienceKind | "">("");
  const q = useReviewQueue<ExperienceQueueItem>((o, signal) => listExperienceQueue({ ...o, kind }, signal), { scope: "experience", events: EVENTS, parse: experienceQueueItemOf, accept: (r) => !kind || r.kind === kind, filterKey: kind, onCount });
  const [open, setOpen] = useState("");

  if (q.denied) return null;
  const { items } = q;
  return (
    <section className="ppanel xpr esc" data-ai-target="callcenter:experience">
      <QueueHead
        icon={IconAward}
        title={t("queue")}
        lead={t("queueLead")}
        count={q.items && !q.failed ? q.total : null}
        refreshLabel={t("refresh")}
        onRefresh={() => void q.reload()}
        refreshing={q.loading}
        aiBase="call_center.experience"
        statuses={STATUSES.map((s) => ({ value: s, label: s ? t(`st.${s}`) : t("all") }))}
        status={q.status}
        onStatus={q.setStatus}
        statusLabel={t("filter")}
      />
      <div className="qhead__seg">
        <Segmented
          size="sm"
          value={kind}
          onChange={(v) => setKind(v as ExperienceKind | "")}
          label={t("kindFilter")}
          aiId="call_center.experience.kind"
          options={[
            { value: "", label: t("kindAll") },
            ...EXPERIENCE_KINDS.map((k) => ({ value: k, label: tp(`kind.${k}`) })),
          ]}
        />
      </div>
      {q.failed ? (
        <ErrorState title={t("loadFailed")} onRetry={() => void q.reload()} compact />
      ) : !items ? (
        <Skeleton rows={3} />
      ) : !items.length ? (
        <EmptyState size="sm" icon={<IconAward />} title={t("queueEmpty")} />
      ) : null}
      {items?.length ? (
        <>
          <ul className="xpr__queue">
            {items.map((it) => (
              <li key={it.id} data-open={open === it.id || undefined} data-kind={it.kind}>
                <button type="button" className="xpr__qrow" onClick={() => setOpen(open === it.id ? "" : it.id)} aria-expanded={open === it.id}>
                  <QueueSeller seller={it.seller} fallback={t("seller")} />
                  <span>{[it.workplace, it.kind === "pre_advocate_employment" ? tp(`kind.${it.kind}`) : catName(it.categoryId)].filter(Boolean).join(" · ")}</span>
                  <span>{it.sourceId ? t("revision", { n: it.version ?? 2 }) : t("newRecord")}</span>
                  <time>{it.submittedAt ? dateOnly(it.submittedAt, locale) : ""}</time>
                </button>
                {open === it.id ? (
                  <ExperienceReview
                    experienceId={it.id}
                    onDone={() => {
                      setOpen("");
                      void q.reload();
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
          <ListPager count={q.items?.length ?? 0} total={q.total} step={50} onMore={() => void q.more()} loading={q.loading} />
        </>
      ) : null}
    </section>
  );
}

// TSK-874927 / TSK-100467 / TSK-365169: the shared verification screen,
// fed with this record's facts, diff, checklist and review room.
export default function ExperienceReview({ experienceId, onDone }: { experienceId: string; onDone?: () => void }): ReactElement {
  const t = useTranslations("callCenter.experience");
  const tp = useTranslations("portal.experience");
  const tv = useTranslations("callCenter.verify.field");
  const locale = useLocale();
  const catName = useCategories();
  const period = (p: { startedAt: string; endedAt: string; isCurrent: boolean }) => [p.startedAt ? dateOnly(p.startedAt, locale) : "", p.isCurrent ? tp("now") : p.endedAt ? dateOnly(p.endedAt, locale) : ""].filter(Boolean).join(" — ");
  const source: VerifySource = {
    kind: "experience",
    title: experienceId,
    load: async (signal) => {
      const d = await getExperienceForReview(experienceId, signal);
      const it = d.record;
      return {
        pending: it?.status === "pending_review",
        isRevision: !!d.previous,
        record: it,
        evidence: it?.evidence ?? [],
        diff: d.diff,
        checks: d.checks,
        reviews: d.reviews,
        room: d.room,
        seller: d.seller,
        history: d.history,
        changedFields: d.changedFields,
      };
    },
    historyLabel: (h) => (tp.has(`status.${h.status}`) ? tp(`status.${h.status}`) : ""),
    review: (input) => reviewExperience(experienceId, input),
    openRoom: () => openExperienceRoom(experienceId),
    closeRoom: (room) => closeExperienceRoom(experienceId, room),
    download: downloadExperienceEvidence,
    facts: (raw) => {
      const it = raw as ExperienceQueueItem | null;
      if (!it) return [];
      const pre = it.kind === "pre_advocate_employment";
      return [
        { label: tp("kindLabel"), value: tp(`kind.${it.kind}`) },
        { label: tp("category"), value: pre ? "" : catName(it.categoryId), field: "category_id" },
        { label: tp("workplace"), value: it.workplace, field: "workplace" },
        ...it.positions.map((p, i) => ({ label: tp("positionN", { n: i + 1 }), value: [p.title, period(p)].filter(Boolean).join(" · "), field: "positions" })),
        { label: t("years"), value: it.years === null || pre ? "" : String(it.years) },
        { label: tp("description"), value: it.description, field: "description" },
      ];
    },
    fieldLabel: (field) => {
      const m = /^positions\.(\d+)/.exec(field);
      if (m) return tp("positionN", { n: Number(m[1]) + 1 });
      return tv.has(field) ? tv(field) : tv("other");
    },
  };
  return <VerifyReview source={source} onDone={onDone} />;
}
