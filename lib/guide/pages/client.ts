import type { GuidePage } from "../types";

export const CLIENT_PAGES: GuidePage[] = [
  {
    id: "client_dashboard",
    match: ["/portal/client"],
    roles: ["client"],
    tour: [
      { target: "ai-help:current-page", text: "tours.client_dashboard.title" },
      { target: "dashboard:describe", text: "tours.client_dashboard.describe" },
      { target: "dashboard:urgent", text: "tours.client_dashboard.urgent" },
      { target: "dashboard:findSpecialist", text: "tours.client_dashboard.findSpecialist" },
      { target: "header:support", text: "tours.common.support" },
    ],
    suggestions: ["suggest.client.plan", "suggest.client.lawyer", "suggest.client.document"],
  },
  {
    id: "client_subscription",
    match: ["/portal/client/subscription"],
    roles: ["client"],
    tour: [
      { target: "ai-help:current-page", text: "tours.client_subscription.title" },
      { target: "plan:lexgo-ai-pro", text: "tours.client_subscription.pro" },
      { target: "button:buy-plan:lexgo-ai-pro", text: "tours.client_subscription.buy" },
    ],
    suggestions: ["suggest.client.planCompare", "suggest.client.planPay"],
  },
  {
    id: "client_lawyers",
    match: ["/portal/client/lawyers"],
    roles: ["client"],
    tour: [
      { target: "marketplace:ai-search", text: "tours.client_lawyers.search" },
      { target: "marketplace:filters", text: "tours.client_lawyers.filters" },
    ],
    suggestions: ["suggest.client.lawyer", "suggest.client.lawyerRating"],
  },
  {
    id: "client_services",
    match: ["/portal/client/services"],
    roles: ["client"],
    tour: [
      { target: "button:create-document", text: "tours.client_services.create" },
      { target: "documents:category-list", text: "tours.client_services.categories" },
      { target: "documents:template-list", text: "tours.client_services.templates" },
    ],
    suggestions: ["suggest.client.document", "suggest.client.documentCheck"],
  },
  {
    id: "client_documents",
    match: ["/portal/client/documents"],
    roles: ["client"],
    tour: [{ target: "documents:my-documents", text: "tours.client_documents.list" }],
  },
  {
    id: "client_urgent",
    match: ["/portal/client/urgent"],
    roles: ["client"],
    tour: [
      { target: "section:urgent-services", text: "tours.client_urgent.services" },
      { target: "urgent:video-consultation", text: "tours.client_urgent.video" },
    ],
    suggestions: ["suggest.client.urgent"],
  },
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
    id: "client_marketplace_orders",
    match: ["/portal/client/marketplace-orders"],
    roles: ["client"],
    tour: [{ target: "client:marketplace-orders", text: "tours.client_marketplace_orders.list" }],
  },
];
