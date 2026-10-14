import { createElement, type ComponentType, type CSSProperties, type ReactElement, type SVGProps } from "react";
import { IconAward, IconChat, IconCoins, IconFileText, IconGlobe, IconGrid, IconLayers, IconMegaphone, IconPackage, IconShieldCheck, IconSliders, IconStore } from "@/components/icons";

type Glyph = ComponentType<SVGProps<SVGSVGElement>>;
type Theme = { hue: number; chroma: number; Icon: Glyph };

const BY_KEY: Record<string, Theme> = {
  services_packages: { hue: 262, chroma: 1, Icon: IconPackage },
  advertising: { hue: 342, chroma: 0.95, Icon: IconMegaphone },
  marketplace_services: { hue: 262, chroma: 1, Icon: IconStore },
  documents_texts: { hue: 285, chroma: 1, Icon: IconFileText },
  process_quality: { hue: 188, chroma: 0.9, Icon: IconAward },
  communications: { hue: 228, chroma: 1, Icon: IconChat },
  finance_tariffs: { hue: 158, chroma: 0.95, Icon: IconCoins },
  security_access: { hue: 14, chroma: 0.95, Icon: IconShieldCheck },
  operations: { hue: 62, chroma: 1, Icon: IconSliders },
  integrations: { hue: 305, chroma: 0.95, Icon: IconGlobe },
  system_reference: { hue: 255, chroma: 0.35, Icon: IconGrid },
};

const BY_TITLE: [RegExp, string][] = [
  [/reklama|реклам|advert/i, "advertising"],
  [/paket|пакет|package|marketplace|xizmat|услуг|service/i, "services_packages"],
  [/hujjat|matn|документ|текст|document/i, "documents_texts"],
  [/sifat|jarayon|качеств|процесс|quality|process/i, "process_quality"],
  [/muloqot|bildirish|общени|уведомл|communic|notif/i, "communications"],
  [/moliya|tarif|финанс|тариф|financ|tariff/i, "finance_tariffs"],
  [/xavfsiz|kirish|безопас|доступ|secur|access/i, "security_access"],
  [/operats|операц|operation/i, "operations"],
  [/integrat|интеграц/i, "integrations"],
  [/tizim|ma.lumotnoma|систем|справоч|system|reference/i, "system_reference"],
];

const ROTATE = [262, 188, 158, 62, 305, 14, 228, 285];

function themeOf(key: string, title: string, order: number): Theme {
  const direct = BY_KEY[key];
  if (direct) return direct;
  const viaTitle = BY_TITLE.find(([re]) => re.test(`${key} ${title}`))?.[1];
  if (viaTitle) return BY_KEY[viaTitle];
  return { hue: ROTATE[Math.abs(order) % ROTATE.length], chroma: 1, Icon: IconLayers };
}

export function groupStyle(key: string, title: string, order: number): CSSProperties {
  const th = themeOf(key, title, order);
  return { "--gh": th.hue, "--gk": th.chroma } as CSSProperties;
}

export function groupGlyph(key: string, title: string, order: number): ReactElement {
  return createElement(themeOf(key, title, order).Icon, { "aria-hidden": true });
}
