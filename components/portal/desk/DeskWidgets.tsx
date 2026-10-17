"use client";

import { useEffect, useState, type ComponentType, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { IconArrowRight, IconBriefcase, IconChat, IconCoins, IconHourglass } from "@/components/icons";
import type { DeskLink, Widget } from "@/lib/services/lawyerDesktop";

// What still matters in focus mode: the day's work and the waiting requests.
const URGENT = new Set(["today_work", "deadlines"]);
type Ico = ComponentType<{ className?: string }>;
// Each widget's colour and glyph; earnings is the wide one.
const LOOK: Record<string, { icon: Ico; c0: string; c1: string; wide?: boolean }> = {
  today_work: { icon: IconBriefcase, c0: "#4F8BFF", c1: "#1D5BE0" },
  deadlines: { icon: IconHourglass, c0: "#FF9F43", c1: "#E8592E" },
  unread_messages: { icon: IconChat, c0: "#34C38F", c1: "#0E9D6A" },
  meetings: { icon: IconHourglass, c0: "#FF5F6D", c1: "#E5303F" },
  earnings: { icon: IconCoins, c0: "#B26CF5", c1: "#6E3BE0", wide: true },
};

// The desktop's widgets (§15), drawn as a computer's own widgets: small
// square tiles in two columns — the day's work, the requests waiting, the
// unread messages, and today's meetings as a calendar leaf — and the
// earnings as a wide card. A tile with things in it lists them. Each
// opens its own deep link; focus mode leaves only the urgent ones.
export default function DeskWidgets({ widgets, order, focus, onOpen }: { widgets: Widget[]; order: string[]; focus: boolean; onOpen: (link: DeskLink, title: string) => void }) {
  const t = useTranslations("portal.desk.widgets");
  const ta = useTranslations("portal.desk.app");
  const [day, setDay] = useState<Date | null>(null);
  useEffect(() => {
    const h = setTimeout(() => setDay(new Date()), 0);
    return () => clearTimeout(h);
  }, []);
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : 99);
  const list = widgets.filter((w) => (!order.length || order.includes(w.id)) && (!focus || URGENT.has(w.id))).sort((a, b) => rank(a.id) - rank(b.id));
  if (!list.length) return null;

  return (
    <div className="wd-wgs" role="list" aria-label={t("title")}>
      {list.map((w) => {
        // The backend's titles are English; the site's own words come first.
        const title = t.has(`id.${w.id}`) ? t(`id.${w.id}`) : w.title || w.id;
        const look = LOOK[w.id] ?? { icon: IconBriefcase, c0: "#7F8EA3", c1: "#56657B" };
        const Icon = look.icon;
        const n = Number(w.value);
        const isNum = w.value !== "" && Number.isFinite(n);
        const money = w.currency && isNum ? n.toLocaleString("ru-RU").replace(/ /g, " ") : "";
        const unit = w.currency === "UZS" ? t("som") : w.currency;
        const empty = isNum && n === 0 && !w.items.length;
        const wide = look.wide || w.items.length > 0;
        const style = { "--wg0": look.c0, "--wg1": look.c1 } as CSSProperties;
        const open = () => onOpen(w.link, title);
        const canOpen = Boolean(w.link.route || w.link.appId);

        if (w.id === "meetings") {
          return (
            <button key={w.id} type="button" role="listitem" className={`wd-wg wd-wg--cal${empty ? " is-empty" : ""}`} style={style} onClick={open} disabled={!canOpen} aria-label={`${title}: ${isNum ? n : 0}`}>
              <span className="wd-wg__wk">{day ? ta(`weekday.${day.getDay()}`) : ""}</span>
              <b className="wd-wg__day">{day ? day.getDate() : ""}</b>
              <span className="wd-wg__sub">{empty ? t("empty.meetings") : t("count.meetings", { n: isNum ? n : 0 })}</span>
            </button>
          );
        }

        return (
          <section key={w.id} role="listitem" className={`wd-wg${wide ? " wd-wg--wide" : ""}${empty ? " is-empty" : ""} wd-wg--${w.id}`} style={style}>
            <button type="button" className="wd-wg__main" onClick={open} disabled={!canOpen} aria-label={`${title}: ${money ? `${money} ${unit}` : isNum ? n : w.value}`}>
              <span className="wd-wg__top">
                <i className="wd-wg__ic" aria-hidden>
                  <Icon />
                </i>
                <small>{title}</small>
                {canOpen ? <IconArrowRight className="wd-wg__go" aria-hidden /> : null}
              </span>
              {money ? (
                <span className="wd-wg__money">
                  <b>{money}</b>
                  <em>{unit}</em>
                </span>
              ) : (
                <b className="wd-wg__num">{isNum ? n : w.value || "—"}</b>
              )}
              <span className="wd-wg__sub">{w.caption || (empty && t.has(`empty.${w.id}`) ? t(`empty.${w.id}`) : t.has(`count.${w.id}`) && isNum ? t(`count.${w.id}`, { n }) : "")}</span>
            </button>
            {w.items.length ? (
              <ul className="wd-wg__list">
                {w.items.map((it, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => onOpen(it.link, it.title)}>
                      <i aria-hidden />
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
