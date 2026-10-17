"use client";

import { useTranslations } from "next-intl";
import type { DeskLink, Widget } from "@/lib/services/lawyerDesktop";

// What still matters in focus mode: the day's work and the deadlines.
const URGENT = new Set(["today_work", "deadlines"]);

// The desktop's widgets (§15): the day's work, deadlines, unread messages,
// meetings and earnings, in the order the preferences keep, each opening
// its own deep link. Focus mode leaves only the urgent ones.
export default function DeskWidgets({ widgets, order, focus, onOpen }: { widgets: Widget[]; order: string[]; focus: boolean; onOpen: (link: DeskLink, title: string) => void }) {
  const t = useTranslations("portal.desk.widgets");
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : 99);
  const list = widgets.filter((w) => (!order.length || order.includes(w.id)) && (!focus || URGENT.has(w.id))).sort((a, b) => rank(a.id) - rank(b.id));
  if (!list.length) return null;
  return (
    <div className="wd-wgs" role="list" aria-label={t("title")}>
      {list.map((w) => {
        // The backend's titles are English; the site's own words come first.
        const title = t.has(`id.${w.id}`) ? t(`id.${w.id}`) : w.title || w.id;
        const n = Number(w.value);
        const value = w.currency && w.value !== "" && Number.isFinite(n) ? `${n.toLocaleString("ru-RU").replace(/\u00a0/g, " ")} ${w.currency === "UZS" ? t("som") : w.currency}` : w.value;
        return (
          <section key={w.id} role="listitem" className={`wd-wg wd-wg--${w.id}`}>
            <button type="button" className="wd-wg__head" onClick={() => onOpen(w.link, title)} disabled={!w.link.route && !w.link.appId}>
              <small>{title}</small>
              {value !== "" ? <b>{value}</b> : null}
              {w.caption ? <span>{w.caption}</span> : null}
            </button>
            {w.items.length ? (
              <ul>
                {w.items.map((it, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => onOpen(it.link, it.title)}>
                      <b>{it.title}</b>
                      {it.subtitle ? <small>{it.subtitle}</small> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
