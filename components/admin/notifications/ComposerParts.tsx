"use client";

import { useRef, type ComponentType, type KeyboardEvent, type ReactNode, type SVGProps } from "react";
import { useTranslations } from "next-intl";
import type { NotifCategory } from "@/lib/notifications";
import type { NotificationDelivery } from "@/lib/services/backend";
import { DeliveryChips } from "@/components/portal/NotificationsPanel";
import {
  IconAlert,
  IconBell,
  IconBriefcase,
  IconBuilding,
  IconCard,
  IconChat,
  IconChatDots,
  IconCheck,
  IconCircleCheck,
  IconCircleX,
  IconFileText,
  IconHeadset,
  IconMail,
  IconMegaphone,
  IconPackage,
  IconPlus,
  IconScale,
  IconShieldCheck,
  IconSmartphone,
  IconTrendingUp,
  IconUser,
  IconUsers,
} from "@/components/icons";
import { PersonAvatar, type PickedPerson } from "./PeoplePicker";

type Ic = ComponentType<SVGProps<SVGSVGElement>>;

// Telegram's paper plane, drawn in the house icon style (no brand asset).
export function IconTelegram(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M21.5 4.5 2.8 11.7c-.9.4-.9 1.6.1 1.9l4.6 1.4 1.8 5.5c.3.8 1.3 1 1.9.4l2.6-2.5 4.7 3.5c.7.5 1.7.1 1.9-.7l3-14.6c.2-1-.8-1.8-1.9-1.1z" />
      <path d="m7.5 15 10-7.5-7.2 8.8" />
    </svg>
  );
}

// Each category keeps one icon and one colour across the chips, the preview
// and the recipient's own inbox tabs.
export const CATEGORY_META: Record<NotifCategory, { Icon: Ic; tone: string }> = {
  orders: { Icon: IconPackage, tone: "blue" },
  payments: { Icon: IconCard, tone: "green" },
  chat: { Icon: IconChat, tone: "violet" },
  documents: { Icon: IconFileText, tone: "amber" },
  system: { Icon: IconShieldCheck, tone: "slate" },
  marketing: { Icon: IconMegaphone, tone: "pink" },
};

export const CHANNELS = ["push", "telegram", "email", "sms"] as const;
export const CHANNEL_META: Record<string, { Icon: Ic; tone: string }> = {
  push: { Icon: IconSmartphone, tone: "blue" },
  telegram: { Icon: IconTelegram, tone: "teal" },
  email: { Icon: IconMail, tone: "violet" },
  sms: { Icon: IconChatDots, tone: "amber" },
};

export const ROLE_META: Record<string, Ic> = {
  client: IconUser,
  yurist: IconBriefcase,
  advokat: IconScale,
  advokat_tashkiloti: IconBuilding,
  call_center: IconHeadset,
  sales: IconTrendingUp,
};

// A numbered composer step: ① Kimga → ② Nima haqida → ③ Xabar.
export function Step({ n, Icon, title, hint, aside, children, id, ai, label }: { n: number; Icon: Ic; title: string; hint: string; aside?: ReactNode; children: ReactNode; id?: string; ai?: string; label?: string }) {
  return (
    <section className="nstep" id={id} data-ai-target={ai} aria-label={label ?? title}>
      <header className="nstep__h">
        <span className="nstep__n" aria-hidden="true">
          {n}
        </span>
        <span className="nstep__ic" aria-hidden="true">
          <Icon />
        </span>
        <span className="nstep__tx">
          <b>{title}</b>
          <small>{hint}</small>
        </span>
        {aside ? <span className="nstep__aside">{aside}</span> : null}
      </header>
      <div className="nstep__b">{children}</div>
    </section>
  );
}

// A single-choice group drawn as tiles (radio semantics, arrow keys move).
export function ChoiceTiles<V extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: string; hint?: string; Icon: Ic; tone: string }[];
  label: string;
  className: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + step + options.length) % options.length];
    onChange(next.value);
    ref.current?.querySelector<HTMLButtonElement>(`[data-v="${next.value}"]`)?.focus();
  };
  return (
    <div ref={ref} className={className} role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} data-v={o.value} className={`ntile ntile--${o.tone}${on ? " on" : ""}`} onClick={() => onChange(o.value)}>
            <span className="ntile__ic" aria-hidden="true">
              <o.Icon />
            </span>
            <span className="ntile__tx">
              <b>{o.label}</b>
              {o.hint ? <small>{o.hint}</small> : null}
            </span>
            <span className="ntile__ok" aria-hidden="true">
              <IconCheck />
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Up to four faces, then «+N».
export function AvatarStack({ people }: { people: PickedPerson[] }) {
  const tn = useTranslations("admin.notifications");
  const shown = people.slice(0, 4);
  const rest = people.length - shown.length;
  return (
    <span className="nstack" aria-hidden="true">
      {shown.map((p) => (
        <PersonAvatar key={p.id} p={p} size="sm" />
      ))}
      {rest > 0 ? <span className="nstack__more">{tn("morePeople", { n: rest })}</span> : null}
    </span>
  );
}

// Who gets it, in words: «3 kishi» with faces, or the whole role.
export function AudienceLine({ mode, people, roleName, roleKey, title }: { mode: "individual" | "broadcast"; people: PickedPerson[]; roleName: string; roleKey: string; title: (p: PickedPerson) => string }) {
  const tn = useTranslations("admin.notifications");
  if (mode === "broadcast") {
    const RoleIc = ROLE_META[roleKey] ?? IconUsers;
    return (
      <span className="naud">
        <span className="naud__role" aria-hidden="true">
          <RoleIc />
        </span>
        <span className="naud__tx">
          <b>{tn("wholeRole", { role: roleName })}</b>
        </span>
      </span>
    );
  }
  if (!people.length) {
    return (
      <span className="naud naud--empty">
        <span className="naud__role" aria-hidden="true">
          <IconUsers />
        </span>
        <span className="naud__tx">
          <b>{tn("nobodyYet")}</b>
        </span>
      </span>
    );
  }
  return (
    <span className="naud">
      <AvatarStack people={people} />
      <span className="naud__tx">
        <b>{tn("peopleN", { n: people.length })}</b>
        <small>{people.slice(0, 2).map(title).join(", ") + (people.length > 2 ? " …" : "")}</small>
      </span>
    </span>
  );
}

// What the recipient will see: a phone-style push from LexGo with the
// category's icon and colour, the title and message, «hozir». Empty fields
// show soft example text.
export function NotifPreview({ category, categoryLabel, channel, channelLabel, title, body }: { category: NotifCategory; categoryLabel: string; channel: string; channelLabel: string; title: string; body: string }) {
  const tn = useTranslations("admin.notifications");
  const cat = CATEGORY_META[category];
  const ch = CHANNEL_META[channel] ?? CHANNEL_META.push;
  return (
    <div className="nprev">
      <div className="nprev__dev">
        <span className="nprev__notch" aria-hidden="true" />
        <span className="nprev__clock" aria-hidden="true">
          9:41
        </span>
        <div className={`nprev__card ncat--${cat.tone}`}>
          <div className="nprev__top">
            <span className="nprev__app" aria-hidden="true">
              <IconScale />
            </span>
            <b>{tn("appName")}</b>
            <span className="nprev__dot" aria-hidden="true">
              ·
            </span>
            <span className="nprev__now">{tn("now")}</span>
            <span className="nprev__cat">
              <cat.Icon aria-hidden="true" />
              {categoryLabel}
            </span>
          </div>
          <b className={`nprev__title${title.trim() ? "" : " is-ex"}`}>{title.trim() || tn("previewTitleEx")}</b>
          <p className={`nprev__body${body.trim() ? "" : " is-ex"}`}>{body.trim() || tn("previewBodyEx")}</p>
        </div>
      </div>
      <div className="nprev__chs">
        <span className="nprev__lbl">{tn("channelsLbl")}</span>
        <span className="nchip nchip--app">
          <IconBell aria-hidden="true" />
          {tn("inApp")}
        </span>
        <IconPlus className="nprev__plus" aria-hidden="true" />
        <span className={`nchip nchip--${ch.tone}`}>
          <ch.Icon aria-hidden="true" />
          {channelLabel}
        </span>
      </div>
    </div>
  );
}

export type RecipientResult = { id: string; name: string; ok: boolean; deliveries: NotificationDelivery[] };

// After a send: a summary (all / partly / none / stopped), one row per
// recipient with its delivery chips, and «Yangi xabar» to start over.
export function SendResult({ results, stopped, queuedNote, onNew, people }: { results: RecipientResult[]; stopped: boolean; queuedNote: string; onNew: () => void; people: Map<string, PickedPerson> }) {
  const tn = useTranslations("admin.notifications");
  const ok = results.filter((r) => r.ok).length;
  const kind = stopped ? "stopped" : ok === results.length ? "ok" : ok ? "part" : "none";
  const Ic = kind === "ok" ? IconCircleCheck : kind === "none" ? IconCircleX : IconAlert;
  const head = { ok: tn("resAllTitle"), part: tn("resPartTitle"), none: tn("resNoneTitle"), stopped: tn("resStoppedTitle") }[kind];
  const lead = { ok: tn("resAllLead"), part: tn("resPartLead"), none: tn("resNoneLead"), stopped: tn("resPartLead") }[kind];
  return (
    <section className={`nres nres--${kind}`} aria-label={tn("resultsTitle")} aria-live="polite">
      <header className="nres__h">
        <span className="nres__ic" aria-hidden="true">
          <Ic />
        </span>
        <span className="nres__tx">
          <small>{tn("resultsTitle")}</small>
          <b>{head}</b>
          <span>{lead}</span>
        </span>
        <span className="nres__count">{tn("resultsCount", { ok, total: results.length })}</span>
      </header>
      <ul className="nres__list">
        {results.map((r) => {
          const p = people.get(r.id);
          return (
            <li key={r.id} className={`nres__row${r.ok ? " is-ok" : " is-err"}`}>
              {p ? (
                <PersonAvatar p={p} size="md" />
              ) : (
                <span className="nrcp__av nrcp__av--md nres__roleav" aria-hidden="true">
                  {(() => {
                    const RoleIc = ROLE_META[r.id] ?? IconUsers;
                    return <RoleIc />;
                  })()}
                </span>
              )}
              <span className="nres__m">
                <b>{r.name}</b>
                {r.ok && r.deliveries.length ? <DeliveryChips items={r.deliveries} /> : null}
              </span>
              <em className={`nres__st${r.ok ? " is-ok" : " is-err"}`}>
                {r.ok ? <IconCheck aria-hidden="true" /> : <IconCircleX aria-hidden="true" />}
                {r.ok ? tn("sent") : tn("sendFailed")}
              </em>
            </li>
          );
        })}
      </ul>
      {results.some((r) => r.ok && r.deliveries.some((x) => x.tone === "pending")) ? <p className="nres__note">{queuedNote}</p> : null}
      <div className="nres__acts">
        <button type="button" className="btn btn--soft btn--sm" onClick={onNew}>
          <IconPlus aria-hidden="true" />
          {tn("newMessage")}
        </button>
      </div>
    </section>
  );
}
