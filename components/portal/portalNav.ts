import type { ComponentType } from "react";
import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileQuestion,
  FileText,
  Files,
  Folder,
  Gift,
  Inbox,
  LayoutGrid,
  LifeBuoy,
  MessageSquare,
  MessageSquareWarning,
  ShoppingBag,
  Siren,
  Sparkles,
  SquareCheckBig,
  Store,
  User,
  Users,
  Video,
  Zap,
} from "lucide-react";
import { IconBell, IconBolt, IconDocSearch, IconFileText, IconGem, IconPackage, IconUserPlus } from "../icons";

// The cabinet's sidebar (LexGo 1920 design): one grouped list per role.
// PortalShell draws it; the Studio preview draws the same list around a
// draft so it sits where it will live. Labels live in `lxShell.nav.<role>`.

type SvgC = ComponentType<{ className?: string }>;
export type NavItem = { href: string; key: string; Icon: SvgC; tone?: "danger"; badge?: "orders" | "messages" };
export type NavGroup = { key: string; items: NavItem[]; collapsible?: boolean };

export const CLIENT_GROUPS: NavGroup[] = [
  { key: "", items: [{ href: "/portal/client", key: "dashboard", Icon: LayoutGrid }] },
  {
    key: "help",
    items: [
      { href: "/portal/client/sos", key: "sos", Icon: Siren, tone: "danger" },
      { href: "/portal/client/urgent", key: "urgent", Icon: Zap },
      { href: "/portal/client/services", key: "services", Icon: FileText },
      { href: "/portal/client/lawyers", key: "lawyers", Icon: Users },
      { href: "/portal/client/ai", key: "ai", Icon: Sparkles },
    ],
  },
  {
    key: "myWork",
    items: [
      { href: "/portal/client/works", key: "works", Icon: BriefcaseBusiness },
      { href: "/portal/client/marketplace-orders", key: "marketplaceOrders", Icon: ShoppingBag },
      { href: "/portal/client/documents", key: "documentRequests", Icon: Folder },
      { href: "/portal/client/messages", key: "messages", Icon: MessageSquare },
    ],
  },
  {
    key: "account",
    items: [
      { href: "/portal/client/subscription", key: "subscription", Icon: CreditCard },
      { href: "/portal/client/support", key: "support", Icon: LifeBuoy },
      { href: "/portal/client/feedback", key: "feedback", Icon: MessageSquareWarning },
      { href: "/portal/client/profile", key: "profile", Icon: User },
    ],
  },
];

function sellerGroups(role: "advocate" | "lawyer"): NavGroup[] {
  const p = `/portal/${role}`;
  return [
    { key: "", items: [{ href: p, key: "dashboard", Icon: LayoutGrid }] },
    {
      key: "orders",
      items: [
        { href: role === "advocate" ? `${p}/opportunities` : `${p}/marketplace`, key: "newOrders", Icon: Inbox, badge: "orders" },
        { href: `${p}/marketplace-orders`, key: "marketplaceOrders", Icon: ClipboardList },
        { href: `${p}/urgent`, key: "urgent", Icon: Zap },
        { href: `${p}/document-requests`, key: "documentRequests", Icon: FileQuestion },
      ],
    },
    {
      key: "workspace",
      items: [
        { href: `${p}/cases`, key: "cases", Icon: BriefcaseBusiness },
        { href: `${p}/clients`, key: "clients", Icon: Users },
        { href: `${p}/calendar`, key: "calendar", Icon: CalendarDays },
        { href: `${p}/tasks`, key: "tasks", Icon: SquareCheckBig },
        { href: `${p}/files`, key: "files", Icon: Folder },
        role === "advocate"
          ? { href: `${p}/organization`, key: "organization", Icon: Building2 }
          : { href: `${p}/documents`, key: "documents", Icon: Files },
        { href: `${p}/assistant`, key: "ai", Icon: Sparkles },
      ],
    },
    {
      key: "comms",
      items: [
        { href: role === "advocate" ? `${p}/messages` : `${p}/chat`, key: "messages", Icon: MessageSquare, badge: "messages" },
        { href: `${p}/meetings`, key: "meetings", Icon: Video },
      ],
    },
    {
      key: "growth",
      collapsible: true,
      items: [
        { href: `${p}/services`, key: "services", Icon: Store },
        { href: `${p}/referrals`, key: "referrals", Icon: Gift },
        { href: `${p}/subscription`, key: "subscription", Icon: CreditCard },
      ],
    },
    {
      key: "account",
      collapsible: true,
      items: [
        { href: `${p}/profile`, key: "profile", Icon: User },
        { href: `${p}/support`, key: "support", Icon: LifeBuoy },
        { href: `${p}/feedback`, key: "feedback", Icon: MessageSquareWarning },
      ],
    },
  ];
}

export const ADVOCATE_GROUPS = sellerGroups("advocate");
export const LAWYER_GROUPS = sellerGroups("lawyer");

const flat = (g: NavGroup[]): NavItem[] => g.flatMap((x) => x.items);
export const CLIENT_NAV: NavItem[] = flat(CLIENT_GROUPS);
export const ADVOCATE_NAV: NavItem[] = flat(ADVOCATE_GROUPS);
export const LAWYER_NAV: NavItem[] = flat(LAWYER_GROUPS);

export const groupsFor = (role: string): NavGroup[] =>
  role === "advocate" ? ADVOCATE_GROUPS : role === "lawyer" ? LAWYER_GROUPS : CLIENT_GROUPS;

// Reachable pages that have no sidebar row of their own (opened from the
// header bell, the dashboard, or another page). Consulted for the header
// title and breadcrumb only, never rendered in the nav.
export const TITLE_ONLY: Record<"client" | "advocate" | "lawyer", NavItem[]> = {
  client: [
    { href: "/portal/client/doc-analysis", key: "docAnalysis", Icon: IconDocSearch },
    { href: "/portal/client/cases", key: "requests", Icon: IconFileText },
    { href: "/portal/client/notifications", key: "notifications", Icon: IconBell },
    { href: "/portal/client/packages", key: "packages", Icon: IconPackage },
    { href: "/portal/client/referrals", key: "referrals", Icon: IconUserPlus },
    { href: "/portal/client/payments", key: "payments", Icon: IconGem },
  ],
  advocate: [
    { href: "/portal/advocate/notifications", key: "notifications", Icon: IconBell },
    { href: "/portal/advocate/promotion", key: "promotion", Icon: IconBolt },
  ],
  lawyer: [
    { href: "/portal/lawyer/notifications", key: "notifications", Icon: IconBell },
    { href: "/portal/lawyer/promotion", key: "promotion", Icon: IconBolt },
    { href: "/portal/lawyer/ai", key: "aiChat", Icon: Sparkles },
  ],
};
/** @deprecated kept for older imports; use TITLE_ONLY.client */
export const CLIENT_TITLE_ONLY: NavItem[] = TITLE_ONLY.client;
