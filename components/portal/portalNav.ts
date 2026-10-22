import type { ComponentType } from "react";
import {
  IconAlert,
  IconBell,
  IconBolt,
  IconBriefcase,
  IconBuilding,
  IconCalendar,
  IconChat,
  IconClipboardCheck,
  IconClipboardList,
  IconDocLines,
  IconDocSearch,
  IconEye,
  IconFileText,
  IconFolderPlus,
  IconGem,
  IconGift,
  IconGraduation,
  IconGrid,
  IconHeadset,
  IconPackage,
  IconSparkle,
  IconTag,
  IconTarget,
  IconUser,
  IconUserPlus,
  IconUsers,
  IconVideo,
} from "../icons";

// The cabinet's sidebar, one list per role. PortalShell draws it; the Studio
// preview draws the same list around a draft so it sits where it will live.

type SvgC = ComponentType<{ className?: string }>;
export type NavItem = { href: string; key: string; Icon: SvgC };

export const LAWYER_NAV: NavItem[] = [
  { href: "/portal/lawyer", key: "dashboard", Icon: IconGrid },
  { href: "/portal/lawyer/marketplace", key: "marketplace", Icon: IconBriefcase },
  { href: "/portal/lawyer/marketplace-orders", key: "marketplaceOrders", Icon: IconTag },
  { href: "/portal/lawyer/cases", key: "cases", Icon: IconFileText },
  { href: "/portal/lawyer/urgent", key: "urgentAssigned", Icon: IconBolt },
  { href: "/portal/lawyer/tasks", key: "tasks", Icon: IconClipboardCheck },
  { href: "/portal/lawyer/calendar", key: "calendar", Icon: IconCalendar },
  { href: "/portal/lawyer/clients", key: "clients", Icon: IconUsers },
  { href: "/portal/lawyer/services", key: "services", Icon: IconTarget },
  { href: "/portal/lawyer/documents", key: "documents", Icon: IconDocLines },
  { href: "/portal/lawyer/document-requests", key: "documentRequests", Icon: IconDocLines },
  { href: "/portal/lawyer/files", key: "files", Icon: IconFolderPlus },
  { href: "/portal/lawyer/chat", key: "chat", Icon: IconChat },
  { href: "/portal/lawyer/meetings", key: "meetings", Icon: IconVideo },
  { href: "/portal/lawyer/notifications", key: "notifications", Icon: IconBell },
  { href: "/portal/lawyer/ai", key: "ai", Icon: IconSparkle },
  { href: "/portal/lawyer/assistant", key: "assistant", Icon: IconEye },
  { href: "/portal/lawyer/profile", key: "profile", Icon: IconUser },
  { href: "/portal/lawyer/referrals", key: "referrals", Icon: IconGift },
  { href: "/portal/lawyer/promotion", key: "promotion", Icon: IconBolt },
  { href: "/portal/lawyer/subscription", key: "subscription", Icon: IconGem },
  { href: "/portal/lawyer/support", key: "support", Icon: IconHeadset },
];

export const ADVOCATE_NAV: NavItem[] = [
  { href: "/portal/advocate", key: "dashboard", Icon: IconGrid },
  { href: "/portal/advocate/opportunities", key: "opportunities", Icon: IconBriefcase },
  { href: "/portal/advocate/marketplace-orders", key: "marketplaceOrders", Icon: IconTag },
  { href: "/portal/advocate/cases", key: "cases", Icon: IconFileText },
  { href: "/portal/advocate/urgent", key: "urgentAssigned", Icon: IconBolt },
  { href: "/portal/advocate/document-requests", key: "documentRequests", Icon: IconDocLines },
  { href: "/portal/advocate/calendar", key: "calendar", Icon: IconCalendar },
  { href: "/portal/advocate/clients", key: "clients", Icon: IconUsers },
  { href: "/portal/advocate/services", key: "services", Icon: IconTarget },
  { href: "/portal/advocate/tasks", key: "tasks", Icon: IconClipboardCheck },
  { href: "/portal/advocate/messages", key: "messages", Icon: IconChat },
  { href: "/portal/advocate/meetings", key: "meetings", Icon: IconVideo },
  { href: "/portal/advocate/notifications", key: "notifications", Icon: IconBell },
  { href: "/portal/advocate/organization", key: "organization", Icon: IconBuilding },
  { href: "/portal/advocate/files", key: "files", Icon: IconFolderPlus },
  { href: "/portal/advocate/assistant", key: "assistant", Icon: IconSparkle },
  { href: "/portal/advocate/profile", key: "profile", Icon: IconUser },
  { href: "/portal/advocate/referrals", key: "referrals", Icon: IconGift },
  { href: "/portal/advocate/promotion", key: "promotion", Icon: IconBolt },
  { href: "/portal/advocate/subscription", key: "subscription", Icon: IconGem },
  { href: "/portal/advocate/support", key: "support", Icon: IconHeadset },
];

// Reachable pages that deliberately have no sidebar row of their own.
// They are consulted for the header title only, never rendered in the nav.
export const CLIENT_TITLE_ONLY: NavItem[] = [
  { href: "/portal/client/doc-analysis", key: "docAnalysis", Icon: IconDocSearch },
  { href: "/portal/client/cases", key: "requests", Icon: IconFileText },
];

export const CLIENT_NAV: NavItem[] = [
  { href: "/portal/client", key: "dashboard", Icon: IconGrid },
  { href: "/portal/client/sos", key: "sos", Icon: IconAlert },
  { href: "/portal/client/urgent", key: "urgent", Icon: IconBolt },
  { href: "/portal/client/services", key: "services", Icon: IconDocSearch },
  { href: "/portal/client/documents", key: "documentRequests", Icon: IconDocLines },
  { href: "/portal/client/lawyers", key: "lawyers", Icon: IconUsers },
  // "Mening ishlarim" is the works list now, not the legal-cases list.
  // LEXGO_FRONTEND_CLIENT_WORKS_QUALITY_EDITOR_2026-09-29.md §9 divides the
  // client's two screens by what they hold: documents are the archive, works
  // are the processes — and a legal case is one of the five types inside the
  // works list rather than the whole of it. The key keeps its name so the
  // label ("Mening ishlarim") and the gating rules travel with it;
  // /portal/client/cases stays reachable and simply has no sidebar row, the
  // same as doc-analysis above.
  { href: "/portal/client/works", key: "cases", Icon: IconBriefcase },
  { href: "/portal/client/messages", key: "messages", Icon: IconChat },
  { href: "/portal/client/notifications", key: "notifications", Icon: IconBell },
  { href: "/portal/client/ai", key: "ai", Icon: IconSparkle },
  { href: "/portal/client/intake", key: "intake", Icon: IconClipboardList },
  // /portal/client/doc-analysis has no sidebar row of its own: it is reached
  // from the dashboard card, from the new-document modal and from the
  // finished-document upsell. The route stays live, and CLIENT_TITLE_ONLY
  // above gives it its own header title ("Hujjat tahlili"); the catalogue
  // page beside it is "Huquqiy hujjatlar", so the two no longer share a name.
  { href: "/portal/client/academy", key: "academy", Icon: IconGraduation },
  { href: "/portal/client/packages", key: "packages", Icon: IconPackage },
  { href: "/portal/client/marketplace-orders", key: "marketplaceOrders", Icon: IconTag },
  { href: "/portal/client/subscription", key: "subscription", Icon: IconGem },
  { href: "/portal/client/gifts", key: "gifts", Icon: IconGift },
  { href: "/portal/client/referrals", key: "referrals", Icon: IconUserPlus },
  { href: "/portal/client/support", key: "support", Icon: IconHeadset },
  { href: "/portal/client/profile", key: "profile", Icon: IconUser },
];
