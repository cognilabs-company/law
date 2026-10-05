import type { GuidePage } from "../types";

export const ADMIN_PAGES: GuidePage[] = [
  {
    id: "admin_support",
    match: ["/admin/call-center/support", "/admin/call-center/support/[ticketId]"],
    roles: ["staff"],
    tour: [{ target: "support:ticket-list", text: "tours.admin_support.list" }],
    suggestions: ["suggest.staff.queue"],
  },
];
