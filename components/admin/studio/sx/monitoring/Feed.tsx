"use client";

import { useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { ListTreeIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { aiId } from "@/lib/ai/ids";
import type { StudioAuditEvent } from "@/lib/services/studio";
import { SxButton } from "../Button";
import { enterStyle } from "../hooks";
import { ActivityIcon, ArchiveIcon, BadgeCheckIcon, BanIcon, ChevronDownIcon, HistoryIcon, MessageSquareTextIcon, PlusIcon, RadioIcon, RotateCcwIcon, SaveIcon, SendIcon, Undo2Icon, glyph } from "../icons";
import type { SxIcon } from "../types";
import { Avatar, useMonFormat } from "./bits";
import { hm, localDayKey } from "./model";

const AI = "admin.studio.monitoring.feed";
const PAGE = 40;

const ACT: Readonly<Record<string, { icon: SxIcon; hue: string }>> = {
  create: { icon: PlusIcon, hue: "jade" },
  save: { icon: SaveIcon, hue: "blue" },
  submit: { icon: SendIcon, hue: "amber" },
  review: { icon: BadgeCheckIcon, hue: "violet" },
  approve: { icon: BadgeCheckIcon, hue: "violet" },
  reject: { icon: BanIcon, hue: "crimson" },
  request_changes: { icon: Undo2Icon, hue: "orange" },
  changes_requested: { icon: Undo2Icon, hue: "orange" },
  publish: { icon: RadioIcon, hue: "teal" },
  archive: { icon: ArchiveIcon, hue: "iris" },
  comment: { icon: MessageSquareTextIcon, hue: "cyan" },
  rollback: { icon: HistoryIcon, hue: "orange" },
  restore: { icon: RotateCcwIcon, hue: "teal" },
};
const OTHER = { icon: ActivityIcon, hue: "iris" };

export type FeedProps = { events: readonly StudioAuditEvent[] | null; nameOf: (userId: string) => string; now: number; loading: boolean };

export function Feed({ events, nameOf, now, loading }: FeedProps): ReactElement {
  const t = useTranslations("studio");
  const fmt = useMonFormat();
  const [limit, setLimit] = useState(PAGE);
  const list = events ? [...events].sort((a, b) => b.at - a.at) : [];
  const shown = list.slice(0, limit);
  const days: { key: string; items: { e: StudioAuditEvent; i: number }[] }[] = [];
  shown.forEach((e, i) => {
    const key = localDayKey(e.at);
    const last = days[days.length - 1];
    if (last && last.key === key) last.items.push({ e, i });
    else days.push({ key, items: [{ e, i }] });
  });
  const did = (a: string) => (t.has(`monitoring.did.${a}`) ? t(`monitoring.did.${a}`) : a === "approve" ? t("monitoring.did.review") : t("monitoring.did.other"));

  return (
    <section className="sx-mon-card sx-mon-feed" data-ai-id={AI} data-ai-type="section" data-ai-label={t("sx.mon.feed.title")}>
      <header className="sx-mon-card__head">
        <span className="sx-mon-sq" data-hue="teal" aria-hidden="true">
          {glyph(ListTreeIcon, { size: 18 })}
        </span>
        <div className="sx-mon-card__titles">
          <h2 className="sx-mon-card__title">{t("sx.mon.feed.title")}</h2>
          <p className="sx-mon-card__lead">{events ? t("sx.mon.feed.lead", { n: list.length }) : t("sx.mon.feed.leadNone")}</p>
        </div>
      </header>
      {loading ? (
        <div className="sx-mon-feed__sk" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="sx-sk" />
          ))}
        </div>
      ) : events === null ? (
        <p className="sx-mon-muted">{t("sx.mon.feed.noAccess")}</p>
      ) : !list.length ? (
        <p className="sx-mon-muted">{t("sx.mon.feed.none")}</p>
      ) : (
        <div className="sx-mon-feed__days">
          {days.map((d) => (
            <section key={d.key} className="sx-mon-feed__day" aria-label={fmt.dayName(d.key, now)}>
              <h3 className="sx-mon-feed__dayh">
                <span>{fmt.dayName(d.key, now)}</span>
                <small className="sx-num">{d.items.length}</small>
              </h3>
              <ol className="sx-mon-feed__list">
                {d.items.map(({ e, i }) => {
                  const look = ACT[e.action] ?? OTHER;
                  const who = nameOf(e.userId);
                  const title = e.title || t("sx.mon.feed.untitled");
                  return (
                    <li key={e.id || `${e.userId}-${e.at}-${e.action}`} className="sx-mon-ev sx-enter" data-enter="fade" style={enterStyle(Math.min(i, 12))}>
                      <span className="sx-mon-ev__icon" data-hue={look.hue} aria-hidden="true">
                        {glyph(look.icon, { size: 15 })}
                      </span>
                      <div className="sx-mon-ev__body">
                        <p className="sx-mon-ev__line">
                          <Avatar name={who} seed={e.userId} size="sm" />
                          <b>{who}</b>
                          <span className="sx-mon-ev__act">{did(e.action)}</span>
                        </p>
                        {e.targetId ? (
                          <Link href={`/admin/studio/o/${encodeURIComponent(e.targetId)}`} className="sx-mon-link sx-mon-ev__obj" data-ai-id={aiId(AI, "item", e.id || i, "open")} data-ai-type="link" data-ai-label={title}>
                            {title}
                          </Link>
                        ) : (
                          <span className="sx-mon-ev__obj">{title}</span>
                        )}
                      </div>
                      <time className="sx-mon-ev__time sx-num" dateTime={new Date(e.at).toISOString()} title={fmt.ago(e.at, now)}>
                        {now && now - e.at < 6 * 3_600_000 ? fmt.ago(e.at, now) : hm(e.at)}
                      </time>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          {list.length > shown.length ? (
            <SxButton variant="ghost" size="sm" icon={ChevronDownIcon} onClick={() => setLimit((v) => v + PAGE)} aiId={aiId(AI, "more")}>
              {t("sx.mon.more", { n: list.length - shown.length })}
            </SxButton>
          ) : null}
        </div>
      )}
    </section>
  );
}
