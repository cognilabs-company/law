import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { DeskLink } from "@/lib/services/lawyerDesktop";

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
};

const load = (f: () => Promise<{ default: ComponentType<NativeProps> }>) => dynamic(f, { ssr: false });

export const NATIVE_APPS: Partial<Record<string, ComponentType<NativeProps>>> = {
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
};
