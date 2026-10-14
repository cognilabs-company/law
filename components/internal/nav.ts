import type { ComponentType } from "react";
import type { InternalPermission } from "@/lib/services/internalHrm";
import {
  IconAward,
  IconBell,
  IconBriefcase,
  IconBuilding,
  IconCalendar,
  IconCard,
  IconChartBar,
  IconChat,
  IconCircleCheck,
  IconClipboardCheck,
  IconClipboardList,
  IconClock,
  IconCoins,
  IconFileText,
  IconFlag,
  IconFolder,
  IconGraduation,
  IconHistory,
  IconHome,
  IconInbox,
  IconLayers,
  IconLightbulb,
  IconLogout,
  IconMapPin,
  IconMonitor,
  IconRocket,
  IconShield,
  IconShieldCheck,
  IconSliders,
  IconSun,
  IconTarget,
  IconTrendingUp,
  IconUser,
  IconUserPlus,
  IconUsers,
} from "@/components/icons";

// The HRM workspace's navigation, in one place: the sidebar, the command
// palette, the page header's icon and the mobile tab bar all read it.
// It follows MedControl HR's areas — oneself, the organisation, people,
// time, pay, execution, talent, the numbers, administration — and reaches
// down to the catalog's record types (?type=), so every MedControl section
// with data behind it here has its own entry. A section the account has no
// permission for is not shown; the backend checks again.

export type NavIcon = ComponentType<{ className?: string }>;
export type NavBadge = "approvals" | "messages" | "notifications";
export type NavItem = {
  href: string;
  key: string;
  Icon: NavIcon;
  // A record type of the catalog module the page shows (?type=).
  type?: string;
  permission?: InternalPermission;
  badge?: NavBadge;
  mobile?: boolean;
  // Words the command palette also matches on.
  keywords?: string;
};
export type NavGroup = { key: string; Icon: NavIcon; items: NavItem[] };

const HR: InternalPermission = "internal_hr.manage";
const TIME: InternalPermission = "internal_time.manage";
const PAY: InternalPermission = "internal_payroll.manage";

export const NAV_GROUPS: NavGroup[] = [
  { key: "self", Icon: IconUser, items: [
    { href: "/internal", key: "dashboard", Icon: IconHome, mobile: true },
    { href: "/internal/today", key: "today", Icon: IconCircleCheck },
    { href: "/internal/sections", key: "sections", Icon: IconLayers, keywords: "bo'limlar sections" },
    { href: "/internal/me/approvals", key: "approvals", Icon: IconInbox, badge: "approvals", mobile: true, keywords: "inbox kiruvchi" },
    { href: "/internal/me/notifications", key: "notifications", Icon: IconBell, badge: "notifications", mobile: true },
    { href: "/internal/me/messages", key: "messages", Icon: IconChat, badge: "messages" },
    { href: "/internal/me", key: "me", Icon: IconUser, mobile: true, keywords: "profil profile" },
    { href: "/internal/me/tasks", key: "tasks", Icon: IconBriefcase },
    { href: "/internal/me/attendance", key: "attendance", Icon: IconCalendar },
    { href: "/internal/me/payslips", key: "myPayslips", Icon: IconCoins, keywords: "oylik maosh payslip расчётный" },
    { href: "/internal/me/records", key: "myRecords", Icon: IconFolder },
  ] },
  { key: "org", Icon: IconBuilding, items: [
    { href: "/internal/org", key: "org", Icon: IconBuilding, permission: "internal_org.manage", keywords: "chart struktura" },
    { href: "/internal/live-office", key: "liveOffice", Icon: IconMonitor },
    { href: "/internal/hrm/org", key: "staffing", Icon: IconUsers, type: "staff_unit", permission: "internal_org.manage", keywords: "shtat staffing" },
    { href: "/internal/hrm/org", key: "grades", Icon: IconAward, type: "grade", permission: "internal_org.manage" },
    { href: "/internal/hrm/org", key: "orgPlans", Icon: IconClipboardList, type: "org_change_plan", permission: "internal_org.manage" },
    { href: "/internal/hrm/org", key: "licences", Icon: IconShieldCheck, type: "branch_licence", permission: "internal_org.manage" },
    { href: "/internal/hrm/org", key: "unitTypes", Icon: IconLayers, type: "org_unit_type", permission: "internal_org.manage" },
  ] },
  { key: "people", Icon: IconUsers, items: [
    { href: "/internal/employees", key: "employees", Icon: IconUsers, permission: HR },
    { href: "/internal/hrm/people", key: "profiles", Icon: IconUser, type: "employee_profile", permission: HR },
    { href: "/internal/hrm/people", key: "credentials", Icon: IconAward, type: "credential", permission: HR },
    { href: "/internal/hrm/employment", key: "contracts", Icon: IconFileText, type: "contract", permission: HR },
    { href: "/internal/movements", key: "orders", Icon: IconTrendingUp, type: "order", permission: HR },
    { href: "/internal/movements", key: "movements", Icon: IconTrendingUp, permission: HR },
    { href: "/internal/offboarding", key: "offboarding", Icon: IconLogout, permission: HR },
    { href: "/internal/documents", key: "documents", Icon: IconFileText },
    { href: "/internal/skills", key: "skills", Icon: IconAward },
    { href: "/internal/hrm/people", key: "dataIssues", Icon: IconFlag, type: "employee_data_issue", permission: HR },
    { href: "/internal/hrm/people", key: "conduct", Icon: IconShield, type: "conduct_record", permission: HR },
  ] },
  { key: "time", Icon: IconClock, items: [
    { href: "/internal/time", key: "time", Icon: IconClock, permission: TIME },
    { href: "/internal/hrm/attendance", key: "explanations", Icon: IconChat, type: "explanation", permission: TIME },
    { href: "/internal/hrm/attendance", key: "overtime", Icon: IconHistory, type: "overtime", permission: TIME },
    { href: "/internal/schedules", key: "schedules", Icon: IconCalendar, permission: TIME },
    { href: "/internal/hrm/scheduling", key: "shifts", Icon: IconLayers, type: "shift", permission: TIME },
    { href: "/internal/hrm/timesheet", key: "timesheet", Icon: IconClipboardList, permission: TIME, keywords: "tabel" },
    { href: "/internal/hrm/timesheet", key: "timesheetFix", Icon: IconHistory, type: "timesheet_correction", permission: TIME },
    { href: "/internal/hrm/scheduling", key: "rosterPeriods", Icon: IconCalendar, type: "roster_period", permission: TIME, keywords: "roster" },
    { href: "/internal/leave", key: "leave", Icon: IconSun },
    { href: "/internal/leave", key: "leaveBalance", Icon: IconSun, type: "balance" },
    { href: "/internal/travel", key: "travel", Icon: IconMapPin },
    { href: "/internal/travel", key: "rotations", Icon: IconMapPin, type: "rotation_template", permission: TIME },
  ] },
  { key: "pay", Icon: IconCard, items: [
    { href: "/internal/payroll", key: "payroll", Icon: IconCard, permission: PAY },
    { href: "/internal/hrm/payroll", key: "payRuns", Icon: IconCoins, type: "run", permission: PAY },
    { href: "/internal/hrm/payroll", key: "advances", Icon: IconCoins, type: "advance", permission: PAY },
    { href: "/internal/hrm/payroll", key: "penalties", Icon: IconFlag, type: "penalty", permission: PAY },
    { href: "/internal/hrm/payroll", key: "objections", Icon: IconChat, type: "objection", permission: PAY },
    { href: "/internal/hrm/payroll", key: "formulas", Icon: IconSliders, type: "formula", permission: PAY },
    { href: "/internal/hrm/payroll", key: "payPolicy", Icon: IconShield, type: "payroll_policy", permission: PAY, keywords: "stavka rates" },
    { href: "/internal/hrm/payroll", key: "adjustments", Icon: IconSliders, type: "manual_adjustment", permission: PAY },
    { href: "/internal/hrm/payroll", key: "payslips", Icon: IconFileText, type: "payslip_acknowledgement", permission: PAY },
  ] },
  { key: "work", Icon: IconBriefcase, items: [
    { href: "/internal/execution", key: "execution", Icon: IconBriefcase, permission: "internal_execution.manage", keywords: "kanban topshiriq" },
    { href: "/internal/hrm/tasks", key: "taskTemplates", Icon: IconClipboardCheck, type: "template", permission: "internal_execution.manage" },
    { href: "/internal/hrm/tasks", key: "spotChecks", Icon: IconShieldCheck, type: "spot_check", permission: "internal_execution.manage" },
    { href: "/internal/hrm/tasks", key: "reliability", Icon: IconTarget, type: "reliability_score", permission: "internal_execution.manage" },
    { href: "/internal/hrm/workitems", key: "projects", Icon: IconFolder, type: "project", permission: "internal_execution.manage" },
    { href: "/internal/hrm/workitems", key: "workItems", Icon: IconClipboardCheck, type: "work_item", permission: "internal_execution.manage" },
    { href: "/internal/hrm/workitems", key: "timeEntries", Icon: IconClock, type: "time_entry", permission: "internal_execution.manage" },
    { href: "/internal/policies", key: "policies", Icon: IconShield },
    { href: "/internal/policies", key: "acknowledgements", Icon: IconCircleCheck, type: "acknowledgement" },
  ] },
  { key: "talent", Icon: IconUserPlus, items: [
    { href: "/internal/kpi", key: "kpi", Icon: IconTarget, permission: "internal_kpi.manage" },
    { href: "/internal/hrm/kpi", key: "kpiDefs", Icon: IconTarget, type: "kpi_definition", permission: "internal_kpi.manage" },
    { href: "/internal/hrm/kpi", key: "kpiPeriods", Icon: IconCalendar, type: "kpi_period", permission: "internal_kpi.manage" },
    { href: "/internal/hrm/kpi", key: "kpiResults", Icon: IconChartBar, type: "kpi_result", permission: "internal_kpi.manage" },
    { href: "/internal/hrm/kpi", key: "reviews", Icon: IconUsers, type: "review_cycle", permission: "internal_kpi.manage", keywords: "360" },
    { href: "/internal/hrm/kpi", key: "oneOnOne", Icon: IconChat, type: "one_on_one_meeting", permission: "internal_kpi.manage", keywords: "1-on-1" },
    { href: "/internal/hrm/kpi", key: "idp", Icon: IconTrendingUp, type: "development_plan", permission: "internal_kpi.manage", keywords: "idp" },
    { href: "/internal/hrm/kpi", key: "nineBox", Icon: IconLayers, type: "nine_box_placement", permission: "internal_kpi.manage", keywords: "9-box" },
    { href: "/internal/recruiting", key: "recruiting", Icon: IconUserPlus, permission: HR },
    { href: "/internal/recruiting", key: "candidates", Icon: IconUsers, type: "candidate", permission: HR },
    { href: "/internal/recruiting", key: "interviews", Icon: IconChat, type: "interview", permission: HR },
    { href: "/internal/recruiting", key: "offers", Icon: IconFileText, type: "offer", permission: HR },
    { href: "/internal/recruiting", key: "pipeline", Icon: IconSliders, type: "pipeline_stage", permission: HR },
    { href: "/internal/onboarding", key: "onboarding", Icon: IconRocket, permission: HR },
    { href: "/internal/onboarding", key: "probation", Icon: IconCircleCheck, type: "probation_review", permission: HR },
    { href: "/internal/learning", key: "learning", Icon: IconGraduation },
    { href: "/internal/learning", key: "certificates", Icon: IconAward, type: "certificate" },
    { href: "/internal/learning", key: "articles", Icon: IconFileText, type: "article", keywords: "wiki" },
  ] },
  { key: "insight", Icon: IconChartBar, items: [
    { href: "/internal/analytics", key: "analytics", Icon: IconChartBar, permission: "internal_analytics.view" },
    { href: "/internal/hrm/analytics", key: "reports", Icon: IconFileText, type: "report_definition", permission: "internal_analytics.view" },
    { href: "/internal/hrm/analytics", key: "reportRuns", Icon: IconHistory, type: "report_run", permission: "internal_analytics.view" },
    { href: "/internal/hrm/analytics", key: "reportSchedules", Icon: IconCalendar, type: "report_schedule", permission: "internal_analytics.view" },
    { href: "/internal/feedback", key: "feedback", Icon: IconLightbulb },
  ] },
  { key: "admin", Icon: IconSliders, items: [
    { href: "/internal/hrm", key: "hr", Icon: IconFolder },
    { href: "/internal/hrm/workflow", key: "workflows", Icon: IconLayers, type: "definition", permission: HR },
    { href: "/internal/hrm/workflow", key: "delegations", Icon: IconUsers, type: "delegation", permission: HR },
    { href: "/internal/hrm/notifications", key: "notifTemplates", Icon: IconBell, type: "template", permission: HR },
    { href: "/internal/hrm/iam", key: "roles", Icon: IconShieldCheck, type: "role", permission: HR },
    { href: "/internal/hrm/iam", key: "roleGrants", Icon: IconUsers, type: "role_grant", permission: HR },
    { href: "/internal/hrm/iam", key: "devices", Icon: IconMonitor, type: "device", permission: HR },
    { href: "/internal/hrm/core", key: "audit", Icon: IconHistory, type: "audit_log", permission: HR },
    { href: "/internal/hrm/core", key: "reasonCodes", Icon: IconClipboardList, type: "reason_code", permission: HR },
    { href: "/internal/hrm/biometrics", key: "biometrics", Icon: IconUser, permission: HR },
    { href: "/internal/hrm/integrations", key: "integrations", Icon: IconSliders, permission: HR },
    { href: "/internal/hrm/ai", key: "aiOversight", Icon: IconLightbulb, permission: HR },
  ] },
];

export const navHref = (item: NavItem) => (item.type ? `${item.href}?type=${encodeURIComponent(item.type)}` : item.href);
export const navId = (item: NavItem) => `${item.href}#${item.type ?? ""}`;

export const navMatches = (pathname: string, item: NavItem) =>
  item.href === "/internal" ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

// The item a path (and the record type it shows) belongs to: the longest
// matching href wins, so /internal/me/tasks is "tasks", not "me"; among
// items of one page, the one for the type on screen, else the page itself.
export function activeNav(pathname: string, items: NavItem[], type = ""): NavItem | undefined {
  const hits = items.filter((item) => navMatches(pathname, item));
  if (!hits.length) return undefined;
  const len = Math.max(...hits.map((i) => i.href.length));
  const best = hits.filter((i) => i.href.length === len);
  return best.find((i) => i.type && i.type === type) ?? best.find((i) => !i.type) ?? best[0];
}
