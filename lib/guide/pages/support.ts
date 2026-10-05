import type { GuidePage } from "../types";

export const SUPPORT_PAGES: GuidePage[] = [
  {
    id: "client_support",
    match: ["/portal/client/support", "/portal/client/support/[ticketId]"],
    roles: ["client"],
    tour: [
      { target: "button:operator-support", text: "tours.client_support.operator" },
      { target: "support:ticket-list", text: "tours.client_support.list" },
    ],
    suggestions: ["suggest.client.operator"],
  },
  {
    id: "admin_support",
    match: ["/admin/call-center/support", "/admin/call-center/support/[ticketId]"],
    roles: ["staff"],
    tour: [{ target: "support:ticket-list", text: "tours.admin_support.list" }],
    suggestions: ["suggest.staff.queue"],
  },
];
