"use client";

import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import { getLiveEmployeeRaw, type LivePerson } from "@/lib/services/internalLive";
import {
  IconBriefcase,
  IconBuilding,
  IconCalendar,
  IconChartBar,
  IconChat,
  IconChevronLeft,
  IconCoins,
  IconEdit,
  IconFileText,
  IconHeadset,
  IconHelpCircle,
  IconHourglass,
  IconInfo,
  IconLock,
  IconMonitor,
  IconMoon,
  IconScale,
  IconSliders,
  IconSparkle,
  IconStore,
  IconUser,
} from "@/components/icons";
import { useHrmFormat, useNow } from "@/components/internal/HrmUi";
import CharacterArt, { backdropOf } from "./CharacterArt";
import type { Look } from "./character";
import { screenOf } from "./monitor";
import { LiveStatus, hms, shownStatus, useLiveText } from "./bits";

type Ico = ComponentType<SVGProps<SVGSVGElement>>;
// The backend's Lucide codes (§19), drawn with the icons the site has.
const ICON: Record<string, Ico> = {
  "wand-sparkles": IconSparkle,
  "chart-no-axes-combined": IconChartBar,
  "life-buoy": IconHelpCircle,
  headphones: IconHeadset,
  store: IconStore,
  "briefcase-business": IconBriefcase,
  "file-text": IconFileText,
  scale: IconScale,
  "messages-square": IconChat,
  "building-2": IconBuilding,
  "calendar-check": IconCalendar,
  "wallet-cards": IconCoins,
  settings: IconSliders,
  monitor: IconMonitor,
};
// The modules down the side of the app on the screen, as the catalog lists them.
const MODULES: [string, string][] = [
  ["studio", "wand-sparkles"],
  ["crm", "chart-no-axes-combined"],
  ["support", "life-buoy"],
  ["call_center", "headphones"],
  ["marketplace", "store"],
  ["services", "briefcase-business"],
  ["documents", "file-text"],
  ["legal_work", "scale"],
  ["communications", "messages-square"],
  ["internal_hrm", "building-2"],
  ["attendance", "calendar-check"],
  ["payroll", "wallet-cards"],
];
// The ICON key for a code, or for the module when the code is unknown.
const iconKey = (code: string, mod: string) => (ICON[code] ? code : (MODULES.find(([m]) => m === mod)?.[1] ?? "monitor"));
const DARK = new Set(["offline"]);
const ASLEEP = new Set(["inactive", "break"]);

// What a person is doing, shown on their desk monitor brought close: the
// LexGo page they have open, the section, the task and its progress, and
// the other LexGo work open beside it. Busy, away and offline turn the
// screen into what it would show then. The way back is the floor.
export default function LiveScreen({
  person,
  look,
  roomName,
  unitName,
  inactiveAfter,
  onBack,
  onRecord,
  onDress,
}: {
  person: LivePerson;
  look: Look;
  roomName: string;
  unitName: string;
  inactiveAfter: number;
  onBack: () => void;
  onRecord: () => void;
  onDress?: () => void;
}) {
  const { t, module } = useLiveText();
  const f = useHrmFormat();
  const now = useNow(1_000);
  const backRef = useRef<HTMLButtonElement>(null);
  const [detail, setDetail] = useState<{ id: string; d: Record<string, unknown> } | null>(null);
  const id = person.id;

  useEffect(() => {
    backRef.current?.focus({ preventScroll: true });
    backRef.current?.closest("section")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [id]);
  // The card on the board may come without a monitor; the person's own
  // record has the last one.
  useEffect(() => {
    const c = new AbortController();
    getLiveEmployeeRaw(id, c.signal)
      .then((d) => !c.signal.aborted && setDetail({ id, d }))
      .catch(() => undefined);
    return () => c.abort();
  }, [id]);

  const screen = screenOf(person, detail?.id === id ? detail.d : undefined);
  const status = shownStatus(person.status, person.lastSeenAt, now, inactiveAfter);
  const busy = person.busy && !person.busy.endedAt ? person.busy : null;
  const ago = (iso: string) => {
    const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
    return !iso || !now || !Number.isFinite(s) ? "" : s < 60 ? t("screen.secAgo", { n: s }) : s < 3600 ? t("screen.minAgo", { n: Math.floor(s / 60) }) : f.dateTime(iso);
  };
  const busyFor = busy?.startedAt && now ? hms((now - Date.parse(busy.startedAt)) / 1000) : "";
  const AppIcon = ICON[iconKey(screen?.icon ?? "", screen?.module ?? "")];
  const where = [roomName, unitName].filter(Boolean).join(" · ");
  const mode = DARK.has(status) ? "off" : ASLEEP.has(status) ? "sleep" : screen ? "app" : "idle";
  const clock = now ? f.time(new Date(now).toISOString()) : "";

  return (
    <section
      className="lvs"
      aria-label={t("screen.title", { name: person.name })}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.preventDefault();
          onBack();
        }
      }}
    >
      <header className="lvs__bar">
        <button ref={backRef} type="button" className="lf-btn lvs__back" onClick={onBack}>
          <IconChevronLeft />
          {t("screen.back")}
        </button>
        <span className="lvs__who">
          <span className="lvs__av" style={{ background: backdropOf(look) }} aria-hidden>
            <CharacterArt look={look} variant="bust" />
          </span>
          <span className="lvs__name">
            <b>{person.name}</b>
            <small>{[person.position, where].filter(Boolean).join(" · ") || person.code}</small>
          </span>
          <LiveStatus value={status} compact />
        </span>
        <span className="lvs__acts">
          {onDress ? (
            <button type="button" className="lf-btn" onClick={onDress} aria-label={t("avatar.dress")} title={t("avatar.dress")}>
              <IconEdit />
              <span>{t("avatar.dress")}</span>
            </button>
          ) : null}
          <button type="button" className="lf-btn" onClick={onRecord} aria-label={t("screen.record")} title={t("screen.record")}>
            <IconUser />
            <span>{t("screen.record")}</span>
          </button>
        </span>
      </header>

      <div className="lvs__scene">
        <figure className={`lvs__mon lvs__mon--${mode}`} aria-label={t("screen.monitor")}>
          <div className="lvs__glass">
            {mode === "off" ? (
              <div className="lvs__off">
                <IconMoon aria-hidden />
                <b>{t("screen.off")}</b>
                {person.lastSeenAt ? <small>{t("detail.lastSeen", { time: f.dateTime(person.lastSeenAt) })}</small> : null}
              </div>
            ) : mode === "sleep" ? (
              <div className="lvs__sleep">
                <span className="lvs__saver" style={{ background: backdropOf(look) }} aria-hidden>
                  <CharacterArt look={look} variant="bust" />
                </span>
                <b>{status === "break" ? t("screen.onBreak") : t("screen.away")}</b>
                <time>{clock}</time>
                {person.lastSeenAt ? <small>{t("detail.lastSeen", { time: f.dateTime(person.lastSeenAt) })}</small> : null}
              </div>
            ) : (
              <div className="lvs__win">
                <div className="lvs__chrome">
                  <i aria-hidden />
                  <i aria-hidden />
                  <i aria-hidden />
                  <div className="lvs__tabs" role="list" aria-label={t("screen.openWork")}>
                    <span role="listitem" className="is-on">
                      <AppIcon aria-hidden />
                      {screen?.pageTitle || (screen ? module(screen.module) : t("screen.desktop"))}
                    </span>
                    {screen?.tabs.map((x, i) => {
                      const TabIcon = ICON[iconKey(x.icon, x.module)];
                      return (
                        <span key={i} role="listitem">
                          <TabIcon aria-hidden />
                          {x.title || x.task || module(x.module)}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="lvs__addr">
                  <IconLock aria-hidden />
                  <span>lexgo.uz{screen?.route || "/"}</span>
                  {screen?.viewMode ? <em>{t.has(`screen.mode.${screen.viewMode}`) ? t(`screen.mode.${screen.viewMode}`) : screen.viewMode}</em> : null}
                </div>
                <div className="lvs__app">
                  <nav className="lvs__nav" aria-hidden>
                    {MODULES.map(([m, code]) => {
                      const I = ICON[code];
                      return (
                        <span key={m} className={screen?.module === m ? "is-on" : ""}>
                          <I />
                        </span>
                      );
                    })}
                  </nav>
                  <div className="lvs__page">
                    {screen ? (
                      <>
                        <p className="lvs__crumbs">
                          {[module(screen.module), screen.pageTitle, screen.section].filter(Boolean).map((c, i) => (
                            <span key={i}>{c}</span>
                          ))}
                        </p>
                        <div className="lvs__task">
                          <span className="lvs__glyph" aria-hidden>
                            <AppIcon />
                          </span>
                          <div>
                            <h3>{screen.task || screen.pageTitle || module(screen.module)}</h3>
                            <p>
                              {screen.workCode ? <code>{screen.workCode}</code> : null}
                              {screen.section ? <span>{screen.section}</span> : null}
                            </p>
                          </div>
                        </div>
                        {screen.progress !== null ? (
                          <div className="lvs__prog">
                            <span>
                              {t("screen.progress")}
                              <b>{screen.progress}%</b>
                            </span>
                            <i role="progressbar" aria-valuenow={screen.progress} aria-valuemin={0} aria-valuemax={100} aria-label={t("screen.progress")}>
                              <i style={{ width: `${screen.progress}%` }} />
                            </i>
                          </div>
                        ) : null}
                        <div className="lvs__ghost" aria-hidden>
                          <i />
                          <i />
                          <i />
                          <span>
                            <i />
                            <i />
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="lvs__idle">
                        <IconMonitor aria-hidden />
                        <b>{t("screen.idle")}</b>
                        <small>{t("screen.idleHint")}</small>
                      </div>
                    )}
                  </div>
                </div>
                {busy ? (
                  <div className="lvs__busy" role="status">
                    <IconHourglass aria-hidden />
                    <span>
                      <b>{t("screen.busy")}</b>
                      <small>{busy.reason}</small>
                    </span>
                    {busyFor ? <time>{busyFor}</time> : null}
                  </div>
                ) : null}
              </div>
            )}
          </div>
          <div className="lvs__stand" aria-hidden />
        </figure>

        <aside className="lvs__side">
          <div className="lvs__fig" style={{ background: backdropOf(look) }}>
            <CharacterArt look={look} title={person.name} />
            {mode === "app" ? <span className="lvs__typing" aria-hidden><i /><i /><i /></span> : null}
          </div>
          <dl className="lvs__facts">
            <div>
              <dt>{t("screen.module")}</dt>
              <dd>{screen?.module ? module(screen.module) : "—"}</dd>
            </div>
            <div>
              <dt>{t("screen.page")}</dt>
              <dd>{screen?.pageTitle || "—"}</dd>
            </div>
            <div>
              <dt>{t("screen.updated")}</dt>
              <dd>{screen?.at ? ago(screen.at) : person.lastSeenAt ? ago(person.lastSeenAt) : "—"}</dd>
            </div>
            {screen?.tabs.length ? (
              <div>
                <dt>{t("screen.alsoOpen")}</dt>
                <dd>{screen.tabs.length}</dd>
              </div>
            ) : null}
          </dl>
          <p className="lvs__note">
            <IconInfo aria-hidden />
            {t("screen.note")}
          </p>
        </aside>
      </div>
    </section>
  );
}
