export const CCX_HOME = "/admin/call-center";

export const CCX_NAV_HREF: Record<string, string> = {
  crm: `${CCX_HOME}?view=crm`,
  supportTickets: `${CCX_HOME}?view=support`,
  meetings: `${CCX_HOME}?view=meetings`,
  teamTasks: `${CCX_HOME}?view=tasks`,
  callAnalytics: `${CCX_HOME}?view=analytics`,
};

export const CCX_PROFILE_HREF = `${CCX_HOME}?view=profile`;

export const VIEW_NAV_KEY: Record<string, string> = {
  crm: "crm",
  support: "supportTickets",
  meetings: "meetings",
  tasks: "teamTasks",
  analytics: "callAnalytics",
};

const CRM_SUB: Record<string, string> = { "": "overview", leads: "leads", customers: "customers", calls: "calls", me: "performance", templates: "templates", sms: "sms" };

const to = (params: Record<string, string>) => `${CCX_HOME}?${new URLSearchParams(params).toString()}`;

export function ccxRouteFor(pathname: string, search: string): string | null {
  const seg = pathname.split("/").filter(Boolean);
  if (seg[0] !== "admin") return null;
  const q = new URLSearchParams(search);
  switch (seg[1]) {
    case "crm": {
      const sub = seg[2] ?? "";
      const s = CRM_SUB[sub];
      if (!s) return null;
      const out: Record<string, string> = { view: "crm", s };
      if (sub === "leads" && seg[3]) out.lead = decodeURIComponent(seg[3]);
      if (sub === "customers" && seg[3]) out.customer = decodeURIComponent(seg[3]);
      return to(out);
    }
    case "call-center":
      if (seg[2] === "support") return to(seg[3] ? { view: "support", ticket: decodeURIComponent(seg[3]) } : { view: "support" });
      if (seg[2] === "experience") return to({ view: "queues", tab: "experience" });
      return null;
    case "meetings":
      return to({ view: "meetings" });
    case "team-tasks": {
      const task = q.get("task");
      return to(task ? { view: "tasks", task } : { view: "tasks" });
    }
    case "call-analytics":
      return to({ view: "analytics" });
    case "profile":
      return to({ view: "profile" });
    default:
      return null;
  }
}
