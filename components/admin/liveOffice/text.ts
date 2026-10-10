"use client";

import type { ComponentType } from "react";
import { useTranslations } from "next-intl";
import type { OfficeEvent, OfficeRoom, OfficeStatus, PersonKind, Verb } from "@/lib/liveOffice/model";
import {
  IconArrowRight,
  IconBolt,
  IconChat,
  IconCheck,
  IconCheckDouble,
  IconCircleCheck,
  IconDownload,
  IconEdit,
  IconEye,
  IconFileText,
  IconLogout,
  IconPhone,
  IconPlus,
  IconSearch,
  IconSend,
  IconTrash,
  IconUpload,
} from "@/components/icons";

type Icon = ComponentType<{ className?: string }>;

// The site's own 3D icons, one per room, so the office reads as LexGo.
export const ROOM_ART: Record<OfficeRoom, string> = {
  lobby: "/img/royhatga-olish.png",
  talk: "/img/card-yordam-markazi.png",
  urgent: "/img/card-advokatga-tezkor-boglanish.png",
  documents: "/img/card-huquqiy-hujjatlar.png",
  desk: "/img/sudarizalari.png",
  ai: "/img/card-lexgo-ai-sorash.png",
  market: "/img/sotuv-voronkasi.png",
  studio: "/img/Korporativ.png",
  admin: "/img/davlat-orgnalari.png",
};

export const VERB_ICON: Record<Verb, Icon> = {
  login: IconArrowRight,
  logout: IconLogout,
  view: IconEye,
  create: IconPlus,
  update: IconEdit,
  remove: IconTrash,
  download: IconDownload,
  upload: IconUpload,
  submit: IconSend,
  publish: IconCircleCheck,
  claim: IconCheck,
  generate: IconFileText,
  message: IconChat,
  call: IconPhone,
  search: IconSearch,
  complete: IconCheckDouble,
  accept: IconCheck,
  work: IconBolt,
};

const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// The audit row's own words are kept only when they name something a person
// would recognise (a document title, a service) — not ids or log jargon.
function readableDetail(e: OfficeEvent): string {
  const d = e.detail.trim();
  if (!d || e.room === "lobby") return "";
  if (/^[0-9a-f-]{20,}$/i.test(d) || /^\+?\d[\d\s]*$/.test(d) || /^[a-z0-9_]+$/.test(d)) return "";
  if (/^(viewed|user|access|session|token)\b/i.test(d)) return "";
  return d;
}

export function useOfficeText() {
  const t = useTranslations("admin.liveOffice");
  const object = (o: string) => (t.has(`objects.${o}`) ? t(`objects.${o}`) : t("objects.other"));
  const ago = (ms: number, now: number) => {
    const s = Math.max(0, Math.round((now - ms) / 1000));
    if (s < 60) return t("ago.now");
    if (s < 3600) return t("ago.min", { n: Math.floor(s / 60) });
    return t("ago.hour", { n: Math.floor(s / 3600) });
  };
  const span = (ms: number) => {
    const m = Math.max(1, Math.round(ms / 60_000));
    return m < 60 ? t("minutes", { n: m }) : t("hm", { h: Math.floor(m / 60), m: m % 60 });
  };
  return {
    t,
    room: (r: OfficeRoom) => t(`rooms.${r}.name`),
    roomDesc: (r: OfficeRoom) => t(`rooms.${r}.desc`),
    verb: (v: Verb) => t(`verbs.${v}`),
    object,
    kind: (k: PersonKind) => t(`kind.${k}`),
    status: (s: OfficeStatus) => t(`status.${s}`),
    phrase: (e: OfficeEvent) => `${t(`verbs.${e.verb}`)} · ${object(e.object)}`,
    detail: readableDetail,
    time: hhmm,
    ago,
    span,
  };
}

export const firstName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  // "LexGo Admin" style service accounts read better by their second word.
  const pick = parts[0].toLowerCase() === "lexgo" && parts[1] ? parts[1] : parts[0];
  return pick.length > 12 ? `${pick.slice(0, 11)}…` : pick;
};
