"use client";

import "./experienceReview.css";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconAward } from "@/components/icons";
import QueueHead from "./QueueHead";
import PersonName from "@/components/ui/PersonName";
import { EmptyState, ErrorState, Skeleton } from "@/components/portal/DataState";
import { categoryName } from "@/lib/categoryNames";
import { dateOnly } from "@/lib/date";
import { isAborted, isForbidden, logApiError } from "@/lib/http";
import { getServiceCategories, type BackendCategory } from "@/lib/services/backend";
import { subscribeUserEvents } from "@/lib/userSocket";
import {
  closeExperienceRoom,
  downloadExperienceEvidence,
  getExperienceForReview,
  listExperienceQueue,
  openExperienceRoom,
  reviewExperience,
  type ExperienceQueueItem,
} from "@/lib/services/experience";
import VerifyReview, { type VerifySource } from "./VerifyReview";

// Experience verification for the call center (TSK-659111, TSK-100467,
// TSK-874927, TSK-365169): the queue, oldest first; each record opens the
// shared verification screen (VerifyReview).

const isExperienceEvent = (e: { event?: unknown }) => String(e.event ?? "").startsWith("marketplace.experience_");

function useCategories() {
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
  const locale = useLocale();
  const catName = useCategories();
  const [items, setItems] = useState<ExperienceQueueItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  // The queue is for call_center/admin/manager or approvals.manage;
  // callcenter.access alone answers 403, and the tab then stays away.
  const [denied, setDenied] = useState(false);
  const [open, setOpen] = useState("");
  const onCountRef = useRef(onCount);
  useEffect(() => {
    onCountRef.current = onCount;
  });

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const r = await listExperienceQueue({}, signal);
      setItems(r.items);
      setFailed(false);
      onCountRef.current?.(r.total);
    } catch (e) {
      if (isAborted(e)) return;
      if (isForbidden(e)) return setDenied(true);
      logApiError("experience.queue", e);
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    const ctl = new AbortController();
    void Promise.resolve().then(() => load(ctl.signal));
    const off = subscribeUserEvents((e) => {
      if (isExperienceEvent(e)) void load();
    });
    return () => {
      ctl.abort();
      off();
    };
  }, [load]);

  if (denied) return null;
  return (
    <section className="ppanel xpr esc" data-ai-target="callcenter:experience">
      <QueueHead
        icon={IconAward}
        title={t("queue")}
        lead={t("queueLead")}
        count={items && !failed ? items.length : null}
        refreshLabel={t("refresh")}
        onRefresh={() => void load()}
        aiBase="call_center.experience"
      />
      {failed ? (
        <ErrorState title={t("loadFailed")} onRetry={() => void load()} compact />
      ) : !items ? (
        <Skeleton rows={3} />
      ) : !items.length ? (
        <EmptyState size="sm" icon={<IconAward />} title={t("queueEmpty")} />
      ) : null}
      {items?.length ? (
        <ul className="xpr__queue">
          {items.map((it) => (
            <li key={it.id} data-open={open === it.id || undefined}>
              <button type="button" className="xpr__qrow" onClick={() => setOpen(open === it.id ? "" : it.id)} aria-expanded={open === it.id}>
                <b>{it.sellerName || it.sellerUserId ? <PersonName id={it.sellerUserId} name={it.sellerName} /> : t("seller")}</b>
                <span>{[it.workplace, catName(it.categoryId)].filter(Boolean).join(" · ")}</span>
                <span>{it.sourceId ? t("revision", { n: it.version ?? 2 }) : t("newRecord")}</span>
                <time>{it.submittedAt ? dateOnly(it.submittedAt, locale) : ""}</time>
              </button>
              {open === it.id ? (
                <ExperienceReview
                  experienceId={it.id}
                  onDone={() => {
                    setOpen("");
                    void load();
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
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
      };
    },
    review: (input) => reviewExperience(experienceId, input),
    openRoom: () => openExperienceRoom(experienceId),
    closeRoom: (room) => closeExperienceRoom(experienceId, room),
    download: downloadExperienceEvidence,
    facts: (raw) => {
      const it = raw as ExperienceQueueItem | null;
      if (!it) return [];
      return [
        { label: tp("category"), value: catName(it.categoryId) },
        { label: tp("workplace"), value: it.workplace },
        ...it.positions.map((p, i) => ({ label: tp("positionN", { n: i + 1 }), value: [p.title, period(p)].filter(Boolean).join(" · ") })),
        { label: t("years"), value: it.years === null ? "" : String(it.years) },
        { label: tp("description"), value: it.description },
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
