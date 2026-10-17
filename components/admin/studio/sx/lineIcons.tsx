"use client";

import { createElement, type ComponentType, type ReactElement, type ReactNode, type SVGProps } from "react";
import { IconContext } from "@phosphor-icons/react/dist/lib/context";
import { NavAds, NavApprovals, NavIntegrations, NavNotifications, NavOverview, NavPayouts, NavRoles, NavServices, NavStudio, NavTemplates } from "@/components/admin/navIcons";
import { SX_ICON_DEFAULTS } from "./icons";
import type { SxSection } from "./types";

export type LineIcon = ComponentType<SVGProps<SVGSVGElement>>;

type P = SVGProps<SVGSVGElement>;

const base: P = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export const LineChecklist: LineIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="5" y="4.5" width="14" height="16" rx="2" />
    <path d="M9 3.5h6v2.5H9z" />
    <path d="M8.5 12.5l2.2 2.2 4.8-4.8" />
    <path d="M8.5 17.5h7" />
  </svg>
);

export const LineWrench: LineIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
  </svg>
);

export const LineDatabase: LineIcon = (p: P) => (
  <svg {...base} {...p}>
    <ellipse cx="12" cy="6" rx="7" ry="2.5" />
    <path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" />
    <path d="M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
  </svg>
);

export const LineSliders: LineIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </svg>
);

export const LinePulse: LineIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
  </svg>
);

export const STUDIO_NAV_LINE: Readonly<Record<SxSection, LineIcon>> = {
  home: NavOverview,
  approvals: NavApprovals,
  monitoring: LinePulse,
  settings: LineSliders,
};

export const GROUP_LINE: Readonly<Record<string, LineIcon>> = {
  services_packages: NavServices,
  documents_texts: NavTemplates,
  process_quality: LineChecklist,
  communications: NavNotifications,
  finance_tariffs: NavPayouts,
  security_access: NavRoles,
  operations: LineWrench,
  integrations: NavIntegrations,
  system_reference: LineDatabase,
  advertising: NavAds,
};

export const GROUP_LINE_FALLBACK: LineIcon = NavStudio;

export function groupLineIcon(key: string): LineIcon {
  return Object.prototype.hasOwnProperty.call(GROUP_LINE, key) ? GROUP_LINE[key] : GROUP_LINE_FALLBACK;
}

const LINE_DEFAULTS = { ...SX_ICON_DEFAULTS, weight: "regular" } as const;

export function SxLineScope({ children }: { children: ReactNode }): ReactElement {
  return createElement(IconContext.Provider, { value: LINE_DEFAULTS }, children);
}
