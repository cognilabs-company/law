"use client";

import { Fragment, useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { UrgentRequest } from "@/lib/services/backend";
import { statusLabel, statusSpecOf, type StatusMap, type StatusTone } from "@/lib/labels";
import {
  IconChat,
  IconChatConsult,
  IconExpressCall,
  IconMoreHorizontal,
  IconOpinionPanel,
  IconPause,
  IconPlay,
  IconSecondOpinion,
  IconTrafficCase,
  IconVideoConsult,
} from "@/components/icons";
import { IcMeeting, IcScale } from "../icons";
import { SLA_MIN, claimedAtOf, clockOf, isFinal, stamp, statusOf } from "./model";

const TONE: Record<StatusTone, string> = { neutral: "mute", info: "info", ok: "ok", warn: "warn", err: "hot" };

export const px = (n: number) => ({ width: n, height: n, style: { width: n, height: n } });

export function UrgBadge({ status, urg }: { status: string; urg: StatusMap }) {
  const tcm = useTranslations("portal.common");
  const spec = statusSpecOf(urg, status, statusLabel(tcm, status));
  if (!spec) return null;
  return (
    <span className="opx-ug-st" data-tone={TONE[spec.tone]} data-live={spec.dot === "live" ? "1" : undefined}>
      {spec.dot ? <i aria-hidden="true" /> : null}
      {spec.label}
    </span>
  );
}

export function KindIcon({ kind, size = 22 }: { kind: string; size?: number }) {
  const p = { ...px(size), "aria-hidden": true };
  switch (kind) {
    case "video_consultation":
      return <IconVideoConsult {...p} />;
    case "express_video_consultation":
      return <IconExpressCall {...p} />;
    case "traffic_accident_consultation":
      return <IconTrafficCase {...p} />;
    case "chat_consultation":
      return <IconChatConsult {...p} />;
    case "second_opinion_single":
      return <IconSecondOpinion {...p} />;
    case "second_opinion_group":
      return <IconOpinionPanel {...p} />;
    default:
      return <IcScale size={size} />;
  }
}

export function ChannelChip({ channel }: { channel: string }) {
  const tk = useTranslations("portal.client.urgent");
  if (!channel) return null;
  const chat = channel === "chat";
  return (
    <span className="opx-ug-chip">
      {chat ? <IconChat {...px(14)} aria-hidden="true" /> : <IcMeeting size={15} />}
      {chat ? tk("chChat") : tk("chVideo")}
    </span>
  );
}

let tickAt = 0;
let tickTimer = 0;
const tickSubs = new Set<() => void>();

function subscribeTick(cb: () => void): () => void {
  tickSubs.add(cb);
  if (!tickTimer) {
    tickAt = Date.now();
    tickTimer = window.setInterval(() => {
      tickAt = Date.now();
      tickSubs.forEach((f) => f());
    }, 1000);
  }
  return () => {
    tickSubs.delete(cb);
    if (!tickSubs.size && tickTimer) {
      window.clearInterval(tickTimer);
      tickTimer = 0;
    }
  };
}

const readTick = () => tickAt;
const noTick = () => 0;

function useTick(): number {
  return useSyncExternalStore(subscribeTick, readTick, noTick);
}

const NARROW = "(max-width: 960px)";

function subscribeNarrow(cb: () => void): () => void {
  const mq = window.matchMedia(NARROW);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const readNarrow = () => window.matchMedia(NARROW).matches;
const wideServer = () => false;

export function useNarrow(): boolean {
  return useSyncExternalStore(subscribeNarrow, readNarrow, wideServer);
}

function SlaView({ used, breached, live }: { used: number | null; breached: boolean; live: boolean }) {
  const t = useTranslations("admin.urgent");
  const x = useTranslations("admin.ccx.urgent");
  const limit = SLA_MIN * 60;
  const late = breached || (used != null && used >= limit);
  const tone = late ? "hot" : live && used != null && used >= limit * 0.66 ? "warn" : "ok";
  const pct = used == null ? 100 : Math.min(100, (used / limit) * 100);
  return (
    <div className="opx-ug-sla" data-tone={tone}>
      <span className="opx-num">{used == null ? t("slaBreached") : x("sla", { used: clockOf(used), limit: clockOf(limit) })}</span>
      <i className="opx-ug-sla__bar" aria-hidden="true">
        <b style={{ width: `${pct}%` }} />
      </i>
    </div>
  );
}

function SlaLive({ r }: { r: UrgentRequest }) {
  const now = useTick();
  const start = stamp(r.createdAt, NaN);
  if (!now || !Number.isFinite(start)) return r.slaBreached ? <SlaView used={null} breached live={false} /> : null;
  return <SlaView used={Math.max(0, (now - start) / 1000)} breached={r.slaBreached} live />;
}

export function SlaBar({ r }: { r: UrgentRequest }) {
  if (isFinal(r)) return null;
  if (statusOf(r) === "open_pool") return <SlaLive r={r} />;
  const start = stamp(r.createdAt, NaN);
  const end = claimedAtOf(r);
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) return <SlaView used={(end - start) / 1000} breached={r.slaBreached} live={false} />;
  return r.slaBreached ? <SlaView used={null} breached live={false} /> : null;
}

export type MenuItem = {
  key: string;
  label: string;
  icon: ReactNode;
  group: number;
  danger?: boolean;
  href?: string;
  title?: string;
  hint?: string;
  aiId?: string;
  onSelect?: () => void;
};

export function MoreMenu({ items, title, up, disabled, aiId }: { items: MenuItem[]; title: string; up?: boolean; disabled?: boolean; aiId?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
      btn.current?.focus({ preventScroll: true });
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    const raf = requestAnimationFrame(() => list.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    const all = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (!all.length) return;
    const at = all.findIndex((x) => x === document.activeElement);
    const to = e.key === "ArrowDown" ? (at + 1) % all.length : e.key === "ArrowUp" ? (at <= 0 ? all.length - 1 : at - 1) : e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    all[to].focus({ preventScroll: true });
  };

  const pick = (it: MenuItem) => {
    setOpen(false);
    it.onSelect?.();
  };

  if (!items.length) return null;

  return (
    <div className="opx-ug-menu" ref={box}>
      <button
        ref={btn}
        type="button"
        className="opx-ug-menu__btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={title}
        title={title}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        data-ai-id={aiId}
        data-ai-label={title}
      >
        <IconMoreHorizontal {...px(18)} aria-hidden="true" />
      </button>
      {open ? (
        <div ref={list} id={menuId} role="menu" aria-label={title} className={`opx-ug-menu__pop${up ? " is-up" : ""}`} onKeyDown={onKey}>
          {items.map((it, i) => (
            <Fragment key={it.key}>
              {i > 0 && it.group !== items[i - 1].group ? <span role="separator" className="opx-ug-menu__sep" /> : null}
              {it.href ? (
                <Link href={it.href} target="_blank" rel="noopener noreferrer" role="menuitem" tabIndex={-1} className="opx-ug-menu__item" title={it.title} data-ai-id={it.aiId} onClick={() => setOpen(false)}>
                  {it.icon}
                  <span>
                    {it.label}
                    {it.hint ? <small>{it.hint}</small> : null}
                  </span>
                </Link>
              ) : (
                <button type="button" role="menuitem" tabIndex={-1} className={`opx-ug-menu__item${it.danger ? " is-danger" : ""}`} data-ai-id={it.aiId} onClick={() => pick(it)}>
                  {it.icon}
                  <span>{it.label}</span>
                </button>
              )}
            </Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function VoiceNote({ src, name, seconds }: { src: string; name: string; seconds: number }) {
  const tv = useTranslations("secureChat");
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(seconds);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => setPlaying(false));
    else a.pause();
  };

  return (
    <span className="opx-ug-voice" title={name || tv("voiceNote")}>
      <button type="button" className="opx-ug-voice__btn" aria-label={`${playing ? tv("voicePause") : tv("voicePlay")}: ${name || tv("voiceNote")}`} aria-pressed={playing} onClick={toggle}>
        {playing ? <IconPause {...px(14)} aria-hidden="true" /> : <IconPlay {...px(14)} aria-hidden="true" />}
      </button>
      <span className={`opx-ug-voice__wave${playing ? " is-on" : ""}`} aria-hidden="true">
        <b style={{ width: `${dur ? Math.min(100, (pos / dur) * 100) : 0}%` }} />
      </span>
      <span className="opx-num">{clockOf(pos ? pos : dur)}</span>
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setPos(0);
        }}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDur(d);
        }}
      />
    </span>
  );
}
