import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { DeskLink } from "@/lib/services/lawyerDesktop";
import type { ToDesk } from "@/lib/deskBridge";

// The cabinet's sections that are desktop programs of their own, drawn
// with the desktop's app kit (kit/kit.tsx) as a Windows or a Mac program;
// any other section still opens its page in the window. Each is loaded
// when its window first opens.
export type NativeProps = {
  // The cabinet these apps belong to ("/portal/advocate").
  base: string;
  // Where in the app the window is (a deep link, or the app's own page).
  route: string;
  // The app moved somewhere of its own: the window's title follows.
  onRoute: (route: string) => void;
  // Another app, at a page of its own or at one of the backend's links.
  openApp: (key: string, route?: string) => void;
  openLink: (link: DeskLink) => void;
  // Tell the desktop what the page would tell it from a frame (a call on
  // or off, the copilot wanted) — and whether the window floats as
  // picture-in-picture.
  tell: (msg: ToDesk) => void;
  pip: boolean;
};

const load = (f: () => Promise<{ default: ComponentType<NativeProps> }>) => dynamic(f, { ssr: false });

type Registry = Partial<Record<string, ComponentType<NativeProps>>>;

// The seller's (advocate's, lawyer's) programs.
const SELLER_APPS: Registry = {
  dashboard: load(() => import("./apps/DashboardApp")),
  tasks: load(() => import("./apps/TasksApp")),
  calendar: load(() => import("./apps/CalendarApp")),
  files: load(() => import("./apps/FilesApp")),
  clients: load(() => import("./apps/ClientsApp")),
  notifications: load(() => import("./apps/NotificationsApp")),
  cases: load(() => import("./apps/CasesApp")),
  opportunities: load(() => import("./apps/OpportunitiesApp")),
  marketplaceOrders: load(() => import("./apps/orders/OrdersApp")),
  documentRequests: load(() => import("./apps/DocsApp")),
  urgentAssigned: load(() => import("./apps/UrgentApp")),
  services: load(() => import("./apps/ServicesApp")),
  promotion: load(() => import("./apps/PromotionApp")),
  organization: load(() => import("./apps/OrgApp")),
  referrals: load(() => import("./apps/ReferralsApp")),
  subscription: load(() => import("./apps/SubscriptionApp")),
  profile: load(() => import("./apps/ProfileApp")),
  assistant: load(() => import("./apps/AssistantApp")),
  messages: load(() => import("./apps/messages/MessagesApp")),
  meetings: load(() => import("./apps/MeetingsApp")),
  support: load(() => import("./apps/SupportApp")),
  snippets: load(() => import("./apps/SnippetsApp")),
};

// The client's programs. The client cabinet reuses some section keys
// (services, cases, profile…) for pages of its own, so it never gets the
// seller's programs by key — only these, and the rest open as pages.
const CLIENT_APPS: Registry = {
  dashboard: load(() => import("./apps/client/HomeApp")),
  cases: load(() => import("./apps/client/WorksApp")),
  marketplaceOrders: load(() => import("./apps/client/OrdersApp")),
  lawyers: load(() => import("./apps/client/LawyersApp")),
  documentRequests: load(() => import("./apps/client/DocumentsApp")),
  sos: load(() => import("./apps/client/SosApp")),
  intake: load(() => import("./apps/client/IntakeApp")),
  docAnalysis: load(() => import("./apps/client/DocAnalysisApp")),
  requests: load(() => import("./apps/client/RequestsApp")),
  ai: load(() => import("./apps/client/AiChatApp")),
  urgent: load(() => import("./apps/client/QuickApp")),
  messages: SELLER_APPS.messages,
  notifications: SELLER_APPS.notifications,
  support: SELLER_APPS.support,
};

export const nativeAppsFor = (role: string): Registry => (role === "client" ? CLIENT_APPS : SELLER_APPS);
