"use client";

import type { ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SxButton, SxLinkButton } from "@/components/admin/studio/sx/Button";
import type { SxIcon } from "@/components/admin/studio/sx/types";
import { fmtUzs } from "@/lib/money";
import { shortDateTime } from "@/lib/date";
import type { MarketOrder, MarketPhase } from "@/lib/services/marketplace";
import type { RuntimeConfig } from "@/lib/services/marketRuntime";
import { RatingCountdown, useTick } from "../OrderExtras";
import { deadlineOf } from "./deadline";
import { useDurationText } from "./OrderFacts";
import {
  ArrowLeftIcon,
  RefreshCwIcon,
  CircleCheckIcon,
  TimerIcon,
  CoinsIcon,
  HourglassIcon,
  LockIcon,
  CirclePauseIcon,
  BanIcon,
  RocketIcon,
  StarIcon,
  CircleAlertIcon,
  glyph,
} from "./icons";
import type { OrderView } from "./types";

type Tone = "submitted" | "approved" | "review" | "returned" | "published" | "archived";

const PHASE_TONE: Readonly<Record<MarketPhase, Tone>> = {
  pending: "submitted",
  paid: "approved",
  in_progress: "review",
  review: "returned",
  completed: "published",
  rated: "published",
  cancelled: "archived",
};

const PHASE_ICON: Readonly<Record<MarketPhase, SxIcon>> = {
  pending: HourglassIcon,
  paid: CoinsIcon,
  in_progress: RocketIcon,
  review: CirclePauseIcon,
  completed: CircleCheckIcon,
  rated: StarIcon,
  cancelled: BanIcon,
};

const STEPS = ["created", "paid", "work", "done", "rated"] as const;

const STEP_AT: Readonly<Record<MarketPhase, number>> = { pending: 0, paid: 1, in_progress: 2, review: 2, completed: 3, rated: 4, cancelled: -1 };

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export function PhasePill({ phase }: { phase: MarketPhase }): ReactElement {
  const t = useTranslations("marketplace.orderDetail.phase");
  return (
    <span className="sx-pill mod-pill" data-tone={PHASE_TONE[phase]} data-phase={phase}>
      {glyph(PHASE_ICON[phase], { size: 14 })}
      <span className="sx-pill__text">{t(phase)}</span>
    </span>
  );
}

function StepRail({ phase }: { phase: MarketPhase }): ReactElement {
  const t = useTranslations("marketplace.orderDetail.steps");
  const at = STEP_AT[phase];
  return (
    <ol className="mod-rail" aria-label={t("label")}>
      {STEPS.map((s, i) => {
        const state = i < at ? "done" : i === at ? (phase === "review" ? "paused" : "now") : "todo";
        const word = state === "done" ? t("stateDone") : state === "now" ? t("stateNow") : state === "paused" ? t("statePaused") : "";
        return (
          <li key={s} className="mod-rail__step" data-state={state} aria-current={i === at ? "step" : undefined}>
            <span className="mod-rail__dot" aria-hidden="true">
              {state === "done" ? glyph(CircleCheckIcon, { size: 14, strokeWidth: 2.25 }) : state === "paused" ? glyph(CirclePauseIcon, { size: 14, strokeWidth: 2.25 }) : null}
            </span>
            <span className="mod-rail__label">
              {t(s)}
              {word ? <span className="sx-vh">, {word}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function DeadlineStrip({ o, phase, runtime }: { o: MarketOrder; phase: MarketPhase; runtime: RuntimeConfig | null }): ReactElement | null {
  const t = useTranslations("marketplace.orderDetail.deadline");
  const tx = useTranslations("marketplace.orderExtras");
  const tdu = useTranslations("marketplace.orderDetail.duration");
  const locale = useLocale();
  const durationText = useDurationText();
  const live = phase === "in_progress" && !o.deadlinePaused && !!o.expectedCompletedAt;
  const now = useTick(live, 60_000);
  const info = deadlineOf(o, phase, now || Number.NaN, runtime);
  const due = o.expectedCompletedAt ? t("dueOn", { date: shortDateTime(o.expectedCompletedAt, locale) }) : "";
  let icon: SxIcon = TimerIcon;
  let tone = "";
  let main = "";
  let hint = "";
  if (live && !now) {
    if (!due) return null;
    main = due;
  } else if (info.kind === "waiting") {
    icon = TimerIcon;
    main = t("waitingShort");
    hint = durationText(info.duration);
  } else if (info.kind === "paused") {
    icon = CirclePauseIcon;
    tone = "paused";
    main = t("paused");
    if (Number.isFinite(info.leftMs) && info.leftMs > 0) {
      const total = Math.max(1, Math.floor(info.leftMs / 60_000));
      const d = Math.floor(total / 1440);
      const h = Math.floor((total % 1440) / 60);
      const m = total % 60;
      const time = d ? [tdu("day", { n: d }), h ? tdu("hour", { n: h }) : ""].filter(Boolean).join(" ") : h ? [tdu("hour", { n: h }), m ? tdu("minute", { n: m }) : ""].filter(Boolean).join(" ") : tdu("minute", { n: m });
      hint = t("pausedLeft", { time });
    } else hint = t("pausedText");
  } else if (info.kind === "overdue") {
    icon = CircleAlertIcon;
    tone = "returned";
    main = t("overdue");
    hint = info.overdueMs >= DAY_MS ? t("overdueDays", { n: Math.floor(info.overdueMs / DAY_MS) }) : t("overdueHours", { n: Math.max(1, Math.floor(info.overdueMs / HOUR_MS)) });
  } else if (info.kind === "running") {
    if (info.leftMs >= DAY_MS) {
      if (info.calendar === "business") {
        main = t("leftBusiness", { n: info.businessDaysLeft });
        hint = t("weekendNote");
      } else main = t("leftCalendar", { n: info.calendarDaysLeft });
    } else {
      const total = Math.floor(info.leftMs / 60_000);
      const h = Math.floor(total / 60);
      const m = total % 60;
      main = h ? tx("hoursLeft", { h, m }) : tx("minutesLeft", { m: Math.max(1, m) });
    }
  } else return null;
  if (!main) return null;
  return (
    <div className="mod-deadline" data-kind={info.kind} data-tone={tone || undefined}>
      {glyph(icon, { size: 18, className: "mod-deadline__icon" })}
      <div className="mod-deadline__body">
        <p className="mod-deadline__main">
          <span className="mod-deadline__label">{t("title")}:</span> {main}
        </p>
        {hint || (due && main !== due && info.kind !== "paused") ? <p className="mod-deadline__hint">{[hint, info.kind !== "paused" && main !== due ? due : ""].filter(Boolean).join(" · ")}</p> : null}
      </div>
    </div>
  );
}

export default function OrderHeader({
  o,
  phase,
  view,
  aiBase,
  listHref,
  runtime,
  refreshing,
  onRefresh,
}: {
  o: MarketOrder;
  phase: MarketPhase;
  view: OrderView;
  aiBase: string;
  listHref: string;
  runtime: RuntimeConfig | null;
  refreshing: boolean;
  onRefresh: () => void;
}): ReactElement {
  const t = useTranslations("marketplace.orderDetail");
  const te = useTranslations("enums");
  const title = o.serviceTitle || o.packageTitle || "—";
  const ratingOpen = phase === "completed" && o.rating.canRate && !o.rating.value;
  const locked = phase === "completed" || phase === "rated" || o.chatReadOnly;
  return (
    <header className="mod-head" data-ai-id={`${aiBase}.header`} data-ai-type="section" data-ai-label={title}>
      <div className="mod-head__bar">
        <SxLinkButton variant="ghost" size="sm" icon={ArrowLeftIcon} href={listHref} aiId={`${aiBase}.back`}>
          {view === "client" ? t("backClient") : t("backSeller")}
        </SxLinkButton>
        <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} busy={refreshing} onClick={onRefresh} aiId={`${aiBase}.refresh`}>
          {t("refresh")}
        </SxButton>
      </div>
      <div className="mod-head__main">
        <div className="mod-head__titles">
          {o.workId ? (
            <span className="sx-code mod-head__wid" aria-label={`${t("workId")}: ${o.workId}`}>
              {o.workId}
            </span>
          ) : null}
          <h1 className="mod-head__title">{title}</h1>
          <PhasePill phase={phase} />
        </div>
        <p className="mod-head__price">
          <b className="sx-num">{o.price ? fmtUzs(o.price) : "—"}</b> <small>{o.currency === "UZS" ? te("currency") : o.currency}</small>
        </p>
      </div>
      <p className="mod-head__lead">{t(`lead.${view}.${phase}`)}</p>
      {phase !== "cancelled" ? (
        <div className="mod-head__progress" data-ai-id={`${aiBase}.progress`} data-ai-type="section" data-ai-label={t("steps.label")}>
          <StepRail phase={phase} />
        </div>
      ) : null}
      <div className="mod-head__time" data-ai-id={`${aiBase}.deadline`} data-ai-type="section" data-ai-label={t("deadline.title")}>
        {ratingOpen ? <RatingCountdown o={o} view={view} className="mod-head__rating" /> : <DeadlineStrip o={o} phase={phase} runtime={runtime} />}
      </div>
      {locked ? (
        <p className="mod-lock">
          {glyph(LockIcon, { size: 16 })}
          <span>
            {t("actions.chatReadOnly")}
            {!o.callsAllowed ? ` ${t("actions.callsOff")}` : ""}
          </span>
        </p>
      ) : null}
    </header>
  );
}
