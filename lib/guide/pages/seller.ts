import type { GuidePage } from "../types";

export const SELLER_PAGES: GuidePage[] = [
  {
    id: "seller_document_requests",
    match: ["/portal/lawyer/document-requests", "/portal/advocate/document-requests"],
    roles: ["lawyer", "advocate"],
    tour: [{ target: "list:document-requests", text: "tours.seller_document_requests.list" }],
    suggestions: ["suggest.seller.works"],
  },
  {
    id: "seller_marketplace_orders",
    match: ["/portal/lawyer/marketplace-orders", "/portal/advocate/marketplace-orders"],
    roles: ["lawyer", "advocate"],
    tour: [{ target: "seller:marketplace-orders", text: "tours.seller_marketplace_orders.list" }],
    suggestions: ["suggest.seller.orders"],
  },
];
