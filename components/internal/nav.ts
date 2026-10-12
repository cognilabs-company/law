import type { ComponentType } from "react";
import type { InternalPermission } from "@/lib/services/internalHrm";
import {
  IconBriefcase,
  IconBuilding,
  IconCalendar,
  IconCard,
  IconChartBar,
  IconChat,
  IconClock,
  IconFolder,
  IconHome,
  IconLightbulb,
  IconMonitor,
  IconShieldCheck,
  IconUser,
  IconUsers,
} from "@/components/icons";

// The HRM workspace's navigation, in one place: the sidebar, the command
// palette, the page header's icon and the mobile tab bar all read it.
// Groups follow the way the work is organised — oneself, the organisation,
// time, the work itself, HR processes, pay, the numbers — rather than one
// long list. A section the account has no permission for is not shown.

export type NavIcon = ComponentType<{ className?: string }>;
export type NavBadge = "approvals" | "messages";
export type NavItem = { href: string; key: string; Icon: NavIcon; permission?: InternalPermission; badge?: NavBadge; mobile?: boolean };
export type NavGroup = { key: string; Icon: NavIcon; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  { key: "self", Icon: IconUser, items: [
    { href: "/internal", key: "dashboard", Icon: IconHome, mobile: true },
    { href: "/internal/me", key: "me", Icon: IconUser },
    { href: "/internal/me/tasks", key: "tasks", Icon: IconBriefcase, mobile: true },
    { href: "/internal/me/attendance", key: "attendance", Icon: IconCalendar },
    { href: "/internal/me/approvals", key: "approvals", Icon: IconShieldCheck, badge: "approvals", mobile: true },
    { href: "/internal/me/messages", key: "messages", Icon: IconChat, badge: "messages", mobile: true },
  ] },
  { key: "org", Icon: IconBuilding, items: [
    { href: "/internal/live-office", key: "liveOffice", Icon: IconMonitor },
    { href: "/internal/org", key: "org", Icon: IconBuilding, permission: "internal_org.manage" },
    { href: "/internal/employees", key: "employees", Icon: IconUsers, permission: "internal_hr.manage" },
  ] },
  { key: "time", Icon: IconClock, items: [
    { href: "/internal/time", key: "time", Icon: IconClock, permission: "internal_time.manage" },
    { href: "/internal/schedules", key: "schedules", Icon: IconCalendar, permission: "internal_time.manage" },
  ] },
  { key: "work", Icon: IconBriefcase, items: [
    { href: "/internal/execution", key: "execution", Icon: IconBriefcase, permission: "internal_execution.manage" },
    { href: "/internal/hr", key: "hr", Icon: IconFolder },
  ] },
  { key: "pay", Icon: IconCard, items: [
    { href: "/internal/payroll", key: "payroll", Icon: IconCard, permission: "internal_payroll.manage" },
  ] },
  { key: "insight", Icon: IconChartBar, items: [
    { href: "/internal/analytics", key: "analytics", Icon: IconChartBar, permission: "internal_analytics.view" },
    { href: "/internal/feedback", key: "feedback", Icon: IconLightbulb },
  ] },
];

export const navMatches = (pathname: string, item: NavItem) =>
  item.href === "/internal" ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

// The item a path belongs to: the longest matching href wins, so
// /internal/me/tasks is "tasks", not "me".
export function activeNav(pathname: string, items: NavItem[]): NavItem | undefined {
  return [...items].sort((a, b) => b.href.length - a.href.length).find((item) => navMatches(pathname, item));
}
