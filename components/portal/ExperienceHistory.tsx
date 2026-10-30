"use client";

import { useEffect, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { Notice } from "@/components/admin/AdminBits";
import { IconCheck, IconCircleX, IconClock, IconEdit, IconHistory, IconRefresh } from "@/components/icons";
import { dateOnly } from "@/lib/date";
import { logApiError } from "@/lib/http";
import { experienceHistory, type ExperienceItem, type ExperienceReviewEntry } from "@/lib/services/experience";

// The advocate's own history of one experience record (TSK-874927): every
// revision with its status, and every operator decision with its comment —
// read only, from GET /marketplace/me/experience/{id}/history.
const DECISION_ICON = { approved: IconCheck, rejected: IconCircleX, changes_requested: IconEdit } as const;

export default function ExperienceHistory({ experienceId, title, onClose }: { experienceId: string; title: string; onClose: () => void }): ReactElement {
  const t = useTranslations("portal.experience.history");
  const ts = useTranslations("portal.experience.status");
  const locale = useLocale();
  const [data, setData] = useState<{ items: ExperienceItem[]; reviews: ExperienceReviewEntry[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    experienceHistory(experienceId).then(
      (d) => {
        if (!live) return;
        setData(d);
        setFailed(false);
      },
      (e) => {
        if (!live) return;
        logApiError("experience.history", e);
        setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [experienceId, tick]);

  const status = (s: string) => (ts.has(s) ? ts(s) : ts("other"));
  return (
    <Modal open onClose={onClose} title={t("title")} description={title} icon={<IconHistory />} variant="drawer">
      {failed ? (
        <div className="exh__fail">
          <Notice ok={false} msg={t("failed")} />
          <button type="button" className="btn btn--line btn--sm" onClick={() => setTick((n) => n + 1)}>
            <IconRefresh aria-hidden="true" />
            {t("retry")}
          </button>
        </div>
      ) : !data ? (
        <div className="exp__card exp__card--ghost" aria-busy="true" />
      ) : (
        <div className="exh">
          <section aria-labelledby="exh-v">
            <h4 id="exh-v">{t("versions")}</h4>
            {data.items.length ? (
              <ol className="exh__list">
                {data.items.map((it) => (
                  <li key={it.id} data-s={it.status}>
                    <i aria-hidden="true">{it.status === "approved" ? <IconCheck /> : it.status === "pending_review" ? <IconClock /> : <IconEdit />}</i>
                    <span>
                      <b>{t("version", { n: it.version ?? 1 })}</b>
                      <small>{[status(it.status), it.submittedAt ? dateOnly(it.submittedAt, locale) : ""].filter(Boolean).join(" · ")}</small>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="exh__none">{t("noVersions")}</p>
            )}
          </section>
          <section aria-labelledby="exh-r">
            <h4 id="exh-r">{t("decisions")}</h4>
            {data.reviews.length ? (
              <ol className="exh__list">
                {data.reviews.map((r, i) => {
                  const Icon = r.decision ? DECISION_ICON[r.decision] : IconClock;
                  return (
                    <li key={r.id || i} data-s={r.decision || "other"}>
                      <i aria-hidden="true">
                        <Icon />
                      </i>
                      <span>
                        <b>{r.decision ? t(`decision.${r.decision}`) : t("decision.other")}</b>
                        <small>{[r.reviewedAt ? dateOnly(r.reviewedAt, locale) : "", r.reviewer].filter(Boolean).join(" · ")}</small>
                        {r.reason ? <p>{r.reason}</p> : null}
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="exh__none">{t("noDecisions")}</p>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
