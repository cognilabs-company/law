"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { parseServerTime } from "@/lib/http";
import { errorText } from "@/lib/errorText";
import { toast } from "@/lib/toast";
import { primeCallAudio } from "@/lib/callSounds";
import { shortDateTime, weekdays } from "@/lib/date";
import { initials } from "@/lib/lawyers";
import { aiId } from "@/lib/ai/ids";
import { evalBusinessHours } from "@/lib/businessHours";
import { DEFAULT_BUSINESS_HOURS, getBusinessHours, type BusinessHours } from "@/lib/services/backend";
import {
  SUPPORT_META_FALLBACK,
  isClosedStatus,
  isUrgentPriority,
  isWaitingTicket,
  loadSupportMeta,
  startSupportCall,
  subscribeSupportMeta,
  supportCallHref,
  supportMetaSnapshot,
  ticketTitle,
  type SupportCallKind,
  type SupportMeta,
  type SupportMetaOption,
  type SupportTicket,
} from "@/lib/services/support";
import { IconCheck, IconClock, IconHeadset, IconUser } from "@/components/icons";

type T = ReturnType<typeof useTranslations>;

const subscribeClock = (cb: () => void) => {
  const id = window.setInterval(cb, 30000);
  return () => window.clearInterval(id);
};
const readMinute = () => Math.floor(Date.now() / 60000);
const serverMinute = () => null;

export function useMinuteNow(): number | null {
  const minute = useSyncExternalStore<number | null>(subscribeClock, readMinute, serverMinute);
  return minute === null ? null : minute * 60000;
}

const HOURS_STEP_MS = 15 * 60000;
const HOURS_TRUST_MS = 2 * HOURS_STEP_MS;

let hoursReq: { key: string; p: Promise<BusinessHours> } | null = null;

function loadHours(key: string): Promise<BusinessHours> {
  if (!hoursReq || hoursReq.key !== key) hoursReq = { key, p: getBusinessHours() };
  return hoursReq.p;
}

export type SupportHours = { open: boolean; schedule: string };

export function useSupportHours(enabled = true): SupportHours | null {
  const locale = useLocale();
  const { session } = useAuth();
  const token = session?.token ?? "";
  const now = useMinuteNow();
  const step = now === null ? null : Math.floor(now / HOURS_STEP_MS);
  const [loaded, setLoaded] = useState<{ token: string; data: BusinessHours } | null>(null);

  useEffect(() => {
    if (!enabled || !token || step === null) return;
    let alive = true;
    loadHours(`${token}|${step}`)
      .then((data) => {
        if (alive) setLoaded({ token, data });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [enabled, token, step]);

  if (!enabled || now === null) return null;
  const api = loaded && loaded.token === token ? loaded.data : null;
  const bh = api ?? DEFAULT_BUSINESS_HOURS;
  const skew = api?.serverNow != null ? api.serverNow - api.fetchedAt : 0;
  let open = evalBusinessHours(bh, now + skew).workingTime;
  if (api && api.isWorkingTime !== null && now - api.fetchedAt < HOURS_TRUST_MS) {
    const atFetch = evalBusinessHours(bh, api.fetchedAt + skew);
    if (bh.timezone !== "Asia/Tashkent" || atFetch.workingTime !== api.isWorkingTime) open = api.isWorkingTime;
  }
  const w = weekdays(locale);
  const run = bh.days.length > 1 && bh.days.every((d, i) => i === 0 || d === bh.days[i - 1] + 1);
  const days = run ? `${w[bh.days[0] - 1]}–${w[bh.days[bh.days.length - 1] - 1]}` : bh.days.map((d) => w[d - 1]).join(", ");
  return { open, schedule: `${days}, ${bh.start}–${bh.end}` };
}

const serverMeta = () => SUPPORT_META_FALLBACK;

export function useSupportMeta(): SupportMeta {
  const meta = useSyncExternalStore(subscribeSupportMeta, supportMetaSnapshot, serverMeta);
  useEffect(() => {
    void loadSupportMeta();
  }, []);
  return meta;
}

const metaLabel = (list: SupportMetaOption[], key: string) => list.find((o) => o.key === key)?.label ?? "";

export function useSupportLabels() {
  const t = useTranslations("support");
  const meta = useSupportMeta();
  const category = (key: string) => (!key ? "" : t.has(`categories.${key}`) ? t(`categories.${key}`) : metaLabel(meta.categories, key) || key);
  const priority = (key: string) => (!key ? "" : t.has(`priorities.${key}`) ? t(`priorities.${key}`) : metaLabel(meta.priorities, key) || key);
  return { meta, category, priority };
}

export function useSupportCall(ticketId: string, workId = "") {
  const t = useTranslations("support");
  const tc = useTranslations("common");
  const router = useRouter();
  const [calling, setCalling] = useState<SupportCallKind | "">("");
  const pending = useRef(false);
  const start = async (kind: SupportCallKind) => {
    if (calling || pending.current || !ticketId) return;
    pending.current = true;
    primeCallAudio();
    setCalling(kind);
    try {
      const s = await startSupportCall(ticketId, kind, workId ? t("call.sessionTitle", { id: workId }) : t("call.sessionTitlePlain"));
      if (!s.id || !s.roomId) {
        pending.current = false;
        setCalling("");
        toast(t("call.failed"), { tone: "err" });
        return;
      }
      router.push(supportCallHref(s.roomId, s.id));
    } catch (e) {
      pending.current = false;
      setCalling("");
      toast(errorText(e, tc) || t("call.failed"), { tone: "err" });
    }
  };
  return { calling, start };
}

export type SupportCallControl = ReturnType<typeof useSupportCall>;

export function minutesSince(iso: string, now: number | null): number | null {
  if (now === null || !iso) return null;
  const at = parseServerTime(iso);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.floor((now - at) / 60000));
}

export function agoText(t: T, locale: string, iso: string, now: number | null): string {
  const m = minutesSince(iso, now);
  if (m === null) return iso ? shortDateTime(iso, locale) : "";
  if (m < 1) return t("ago.now");
  if (m < 60) return t("ago.minutes", { n: m });
  if (m < 1440) return t("ago.hours", { n: Math.floor(m / 60) });
  if (m < 10080) return t("ago.days", { n: Math.floor(m / 1440) });
  return shortDateTime(iso, locale);
}

export function waitText(t: T, iso: string, now: number | null): string {
  const m = minutesSince(iso, now);
  if (m === null) return "";
  if (m < 1) return t("wait.now");
  if (m < 60) return t("wait.minutes", { n: m });
  if (m < 1440) return t("wait.hours", { h: Math.floor(m / 60), m: m % 60 });
  return t("wait.days", { n: Math.floor(m / 1440) });
}

const flat = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export function lastPreview(ticket: Pick<SupportTicket, "lastMessage">, title: string): string {
  const lead = flat(title).replace(/…$/, "").trim();
  return ticket.lastMessage && !(lead && flat(ticket.lastMessage).startsWith(lead)) ? ticket.lastMessage : "";
}

export function SupportStatus({ status }: { status: string }) {
  const t = useTranslations("support");
  if (!status) return null;
  return (
    <span className={`spill spill--${status}`}>
      <i aria-hidden="true" />
      {t.has(`status.${status}`) ? t(`status.${status}`) : status}
    </span>
  );
}

export function TicketCard({
  ticket,
  active,
  unread,
  view,
  now,
  onOpen,
  extra,
  noAiId,
}: {
  ticket: SupportTicket;
  active: boolean;
  unread?: number;
  view: "client" | "operator";
  now: number | null;
  onOpen: () => void;
  extra?: ReactNode;
  noAiId?: boolean;
}) {
  const t = useTranslations("support");
  const locale = useLocale();
  const labels = useSupportLabels();
  const title = ticketTitle(ticket, t("untitled"));
  const cat = labels.category(ticket.category);
  const waiting = isWaitingTicket(ticket);
  const closed = isClosedStatus(ticket.status);
  const person = view === "client" ? ticket.operatorName : ticket.clientName;
  const heading = view === "operator" && person ? person : title;
  const when = ticket.lastMessageAt || ticket.updatedAt;
  const last = lastPreview(ticket, title);
  const wait = view === "operator" && waiting ? waitText(t, ticket.createdAt, now) : "";
  const fresh = unread && unread > 0 ? unread : 0;
  const statusText = ticket.status ? (t.has(`status.${ticket.status}`) ? t(`status.${ticket.status}`) : ticket.status) : "";
  const aiLabel = [ticket.workId, cat, statusText].filter(Boolean).join(" · ") || t("untitled");
  return (
    <div
      className={`supitem${active ? " is-on" : ""}${fresh ? " has-new" : ""}${closed ? " is-closed" : ""}`}
      data-ai-target={`support-ticket:${ticket.id}`}
      data-ai-id={noAiId || !ticket.id ? undefined : aiId(view === "client" ? "support.ticket" : "call_center.support.ticket", ticket.id)}
      data-ai-type="list_item"
      data-ai-label={aiLabel}
      data-ai-entity-type="support_ticket"
      data-ai-entity-id={ticket.id || undefined}
      data-ai-private
    >
      <button type="button" className="supitem__main" onClick={onOpen} aria-current={active || undefined}>
        <span className={`supitem__av${view === "client" && waiting && !person ? " supitem__av--wait" : ""}`} aria-hidden="true">
          {person ? initials(person) : view === "client" ? <IconHeadset /> : <IconUser />}
        </span>
        <span className="supitem__body">
          <span className="supitem__top">
            <b className="supitem__t">{heading}</b>
            {when ? <time dateTime={when}>{agoText(t, locale, when, now)}</time> : null}
          </span>
          {view === "operator" && heading !== title ? <span className="supitem__sub">{title}</span> : null}
          {last ? <span className={`supitem__last${fresh ? " supitem__last--new" : ""}`}>{last}</span> : null}
          <span className="supitem__meta">
            <SupportStatus status={ticket.status} />
            {view === "client" && ticket.operatorName ? <span>{t("operatorIs", { name: ticket.operatorName })}</span> : null}
            {view === "operator" && ticket.clientLexgoId ? <span>{t("chat.lexgoId", { id: ticket.clientLexgoId })}</span> : null}
            {cat ? <span>{cat}</span> : null}
            {isUrgentPriority(ticket.priority) ? <span className="supitem__urgent">{t("urgent")}</span> : null}
            {wait ? (
              <span className="supitem__wait">
                <IconClock />
                {wait}
              </span>
            ) : null}
            {fresh ? (
              <span className="supitem__new" title={t("unreadAria", { n: fresh })}>
                <span aria-hidden="true">{fresh > 99 ? "99+" : fresh}</span>
                <span className="sr-only">{t("unreadAria", { n: fresh })}</span>
              </span>
            ) : null}
          </span>
          {closed && ticket.resolution ? (
            <span className="supitem__res">
              <IconCheck />
              <span>{ticket.resolution}</span>
            </span>
          ) : null}
        </span>
      </button>
      {extra}
    </div>
  );
}
