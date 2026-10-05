import type { GuidePage } from "../types";

export const COMPLAINT_PAGES: GuidePage[] = [
  {
    id: "client_complaints",
    match: ["/portal/client/complaints"],
    roles: ["client"],
    tour: [
      { target: "ai-help:current-page", text: "tours.client_complaints.title" },
      { target: "button:new-complaint", text: "tours.client_complaints.new" },
      { target: "complaints:list", text: "tours.client_complaints.list" },
      { target: "complaints:filters", text: "tours.client_complaints.filters" },
    ],
    suggestions: ["suggest.complaints.how", "suggest.complaints.status", "suggest.complaints.lawyer"],
  },
];
