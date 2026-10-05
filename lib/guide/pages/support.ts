import type { GuidePage } from "../types";

export const SUPPORT_PAGES: GuidePage[] = [
  {
    id: "client_support",
    match: ["/portal/client/support", "/portal/client/support/[ticketId]"],
    roles: ["client"],
    tour: [
      { target: "support:channels", text: "tours.client_support.channels" },
      { target: "support:ai", text: "tours.client_support.ai" },
      { target: "button:operator-support", text: "tours.client_support.operator" },
      { target: "support:complaints", text: "tours.client_support.complaints" },
      { target: "support:call", text: "tours.client_support.call" },
      { target: "support:ticket-list", text: "tours.client_support.list" },
      { target: "support:new-chat", text: "tours.client_support.newChat" },
    ],
    suggestions: ["suggest.support.operator", "suggest.support.complaint", "suggest.support.payment", "suggest.support.reply"],
  },
  {
    id: "seller_support",
    match: ["/portal/lawyer/support", "/portal/lawyer/support/[ticketId]", "/portal/advocate/support", "/portal/advocate/support/[ticketId]"],
    roles: ["lawyer", "advocate"],
    tour: [
      { target: "support:channels", text: "tours.seller_support.channels" },
      { target: "support:ai", text: "tours.seller_support.ai" },
      { target: "button:operator-support", text: "tours.seller_support.operator" },
      { target: "support:call", text: "tours.seller_support.call" },
      { target: "support:ticket-list", text: "tours.seller_support.list" },
      { target: "support:new-chat", text: "tours.seller_support.newChat" },
    ],
    suggestions: ["suggest.support.operator", "suggest.support.sellerOrder", "suggest.support.sellerProfile", "suggest.support.reply"],
  },
  {
    id: "admin_support",
    match: ["/admin/call-center/support", "/admin/call-center/support/[ticketId]"],
    roles: ["staff"],
    tour: [
      { target: "ai-help:current-page", text: "tours.admin_support.title" },
      { target: "support:ticket-list", text: "tours.admin_support.list" },
      { target: "support:chat", text: "tours.admin_support.chat" },
      { target: "support:assist", text: "tours.admin_support.assist" },
    ],
    suggestions: ["suggest.support.queueClaim", "suggest.support.queueTransfer", "suggest.support.queueClose"],
  },
];
