"use client";

import "../sx-group.css";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { aiId } from "@/lib/ai/ids";
import { logApiError } from "@/lib/http";
import { listStudioRecords, studioObjectIdOf, type StudioRecord, type StudioRecords } from "@/lib/services/studio";
import { SxButton } from "../../Button";
import { enterStyle } from "../../hooks";
import { ArrowRightIcon, ChevronRightIcon, RefreshCwIcon, glyph } from "../../icons";
import { useNow } from "../../live";
import { StatusPill } from "../../StatusPill";
import { useStudioLabels } from "../../useStudioLabels";

const enc = encodeURIComponent;
const LIMIT = 3;
const SK = [0, 1, 2];

type Loaded = { tick: number; data: StudioRecords | null; error: unknown };

function viewHref(code: string, url: string): string {
  const oid = studioObjectIdOf(url);
  if (oid) return `/admin/studio/o/${enc(oid)}`;
  if (url.includes("/form-context")) return `/admin/studio/o/new?new=${enc(code)}&ctx=${enc(url)}`;
  return "";
}

export function stepRecordHref(code: string, r: StudioRecord): string {
  if (r.source === "studio") {
    const id = r.studioObjectId || r.id;
    if (id) return `/admin/studio/o/${enc(id)}`;
  }
  return viewHref(code, r.actions.view) || `/admin/studio/c/${enc(code)}`;
}

export function StepRecords({ code, id, name }: { code: string; id: string; name: string }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const now = useNow();
  const [tick, setTick] = useState(0);
  const [got, setGot] = useState<Loaded | null>(null);
  const base = aiId("admin.studio.group.step", code, "latest");

  useEffect(() => {
    const ctl = new AbortController();
    listStudioRecords(code, { source: "", limit: LIMIT, offset: 0 }, ctl.signal).then(
      (data) => {
        if (!ctl.signal.aborted) setGot({ tick, data, error: null });
      },
      (e: unknown) => {
        if (ctl.signal.aborted) return;
        logApiError("studio.group.latest", e);
        setGot({ tick, data: null, error: e ?? new Error("failed") });
      },
    );
    return () => ctl.abort();
  }, [code, tick]);

  const current = got && got.tick === tick ? got : null;
  const items = current?.data?.items.slice(0, LIMIT) ?? [];
  const total = current?.data?.total ?? 0;

  let body: ReactElement;
  if (!current)
    body = (
      <ul className="sx-tlr__list" aria-hidden="true">
        {SK.map((i) => (
          <li key={i} className="sx-tlr__sk">
            <span className="sx-sk" />
            <span className="sx-sk" />
          </li>
        ))}
      </ul>
    );
  else if (current.error)
    body = (
      <p className="sx-tlr__note" role="alert">
        <span>{t("sx.gp.recordsFail")}</span>
        <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={() => setTick((n) => n + 1)} aiId={aiId(base, "retry")}>
          {t("sx.ui.retry")}
        </SxButton>
      </p>
    );
  else if (!items.length)
    body = (
      <p className="sx-tlr__note" role="status">
        {t("sx.gp.noRecords")}
      </p>
    );
  else
    body = (
      <ul className="sx-tlr__list">
        {items.map((r, i) => {
          const title = r.title || t("sx.ui.untitled");
          const when = now && r.updatedAt ? labels.ago(r.updatedAt, now) : "";
          return (
            <li key={`${r.source}-${r.id}`} className="sx-enter" data-enter="fade" style={enterStyle(i)}>
              <Link href={stepRecordHref(code, r)} className="sx-tlr__row" data-ai-id={aiId(base, "item", r.id)} data-ai-type="list_item" data-ai-label={title}>
                <span className="sx-tlr__title">{title}</span>
                <StatusPill status={r.status} source={r.source} size="sm" />
                {when ? (
                  <span className="sx-tlr__when sx-num" title={labels.dateTime(r.updatedAt)}>
                    {when}
                  </span>
                ) : null}
                <span className="sx-tlr__caret">{glyph(ChevronRightIcon, { size: 14 })}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    );

  return (
    <div id={id} className="sx-tlr" role="region" aria-label={t("sx.gp.latestOf", { name })} aria-busy={!current || undefined}>
      <div className="sx-tlr__head">
        <span className="sx-tlr__h">{t("sx.gp.latest")}</span>
        {current?.data && total > 0 ? (
          <Link href={`/admin/studio/c/${enc(code)}`} className="sx-tlr__all" data-ai-id={aiId(base, "all")} data-ai-type="link" data-ai-label={t("sx.gp.allRecords", { n: total })}>
            <span className="sx-num">{t("sx.gp.allRecords", { n: total })}</span>
            {glyph(ArrowRightIcon, { size: 14 })}
          </Link>
        ) : null}
      </div>
      {body}
    </div>
  );
}
