"use client";

import "./experienceReview.css";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconStar } from "@/components/icons";
import QueueHead from "./QueueHead";
import PersonName from "@/components/ui/PersonName";
import { EmptyState, ErrorState, Skeleton } from "@/components/portal/DataState";
import { dateOnly } from "@/lib/date";
import { isAborted, isForbidden, logApiError } from "@/lib/http";
import { subscribeUserEvents } from "@/lib/userSocket";
import { closeAchievementRoom, downloadAchievementEvidence, getAchievementForReview, listAchievementQueue, openAchievementRoom, reviewAchievement, type AchievementQueueItem } from "@/lib/services/achievements";
import VerifyReview, { type VerifySource } from "./VerifyReview";

// TSK-100467 / TSK-493303: the call center's achievement queue, oldest
// first; each opens the shared verification screen. Only an approved
// achievement reaches the public profile and the rating.

const isAchievementEvent = (e: { event?: unknown }) => String(e.event ?? "").startsWith("marketplace.achievement_");

function AchievementReview({ id, onDone }: { id: string; onDone: () => void }): ReactElement {
  const t = useTranslations("portal.achievements");
  const tv = useTranslations("callCenter.verify.field");
  const locale = useLocale();
  const source: VerifySource = {
    kind: "achievement",
    title: id,
    load: async (signal) => {
      const d = await getAchievementForReview(id, signal);
      const it = d.record;
      return {
        pending: it?.status === "pending_review",
        isRevision: !!d.previous,
        record: it,
        evidence: it?.evidence ?? [],
        diff: d.diff.map((r) => (r.field === "achievement_type" ? { ...r, before: r.before ? t(`type.${r.before}`) : "", after: r.after ? t(`type.${r.after}`) : "" } : r)),
        checks: d.checks,
        reviews: d.reviews,
        room: d.room,
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
        { label: t("secType"), value: t(`type.${it.type}`) },
        { label: t("titleLabel"), value: it.title },
        { label: t("date"), value: it.achievedAt ? dateOnly(it.achievedAt, locale) : "" },
        { label: t("description"), value: it.description },
      ];
    },
    fieldLabel: (field) => (tv.has(field) ? tv(field) : tv("other")),
  };
  return <VerifyReview source={source} onDone={onDone} />;
}

export function AchievementQueue({ onCount }: { onCount?: (n: number) => void }): ReactElement | null {
  const t = useTranslations("callCenter.achievements");
  const ta = useTranslations("portal.achievements");
  const locale = useLocale();
  const [items, setItems] = useState<AchievementQueueItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [open, setOpen] = useState("");
  const onCountRef = useRef(onCount);
  useEffect(() => {
    onCountRef.current = onCount;
  });
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const r = await listAchievementQueue({}, signal);
      setItems(r.items);
      setFailed(false);
      onCountRef.current?.(r.total);
    } catch (e) {
      if (isAborted(e)) return;
      if (isForbidden(e)) return setDenied(true);
      logApiError("achievements.queue", e);
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    const ctl = new AbortController();
    void Promise.resolve().then(() => load(ctl.signal));
    const off = subscribeUserEvents((e) => {
      if (isAchievementEvent(e)) void load();
    });
    return () => {
      ctl.abort();
      off();
    };
  }, [load]);

  if (denied) return null;
  return (
    <section className="ppanel xpr esc" data-ai-target="callcenter:achievements">
      <QueueHead icon={IconStar} title={t("title")} lead={t("lead")} count={items && !failed ? items.length : null} refreshLabel={t("refresh")} onRefresh={() => void load()} aiBase="call_center.achievements" />
      {failed ? (
        <ErrorState title={t("loadFailed")} onRetry={() => void load()} compact />
      ) : !items ? (
        <Skeleton rows={3} />
      ) : !items.length ? (
        <EmptyState size="sm" icon={<IconStar />} title={t("empty")} />
      ) : (
        <ul className="xpr__queue">
          {items.map((it) => (
            <li key={it.id} data-open={open === it.id || undefined}>
              <button type="button" className="xpr__qrow" onClick={() => setOpen(open === it.id ? "" : it.id)} aria-expanded={open === it.id}>
                <b>{it.sellerName || it.sellerUserId ? <PersonName id={it.sellerUserId} name={it.sellerName} /> : t("seller")}</b>
                <span>{[it.title, ta(`type.${it.type}`)].filter(Boolean).join(" · ")}</span>
                <span>{it.sourceId ? t("revision") : t("newRecord")}</span>
                <time>{it.submittedAt ? dateOnly(it.submittedAt, locale) : ""}</time>
              </button>
              {open === it.id ? (
                <AchievementReview
                  id={it.id}
                  onDone={() => {
                    setOpen("");
                    void load();
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
