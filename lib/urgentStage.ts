import type { UrgentRequest } from "@/lib/services/backend";

// Where an urgent (Tezkor Advokat) request stands for the people working
// it. "active" is the default list of the duty desk and its Hozir badge.
export function urgentStage(r: Pick<UrgentRequest, "status">): "active" | "completed" | "cancelled" {
  if (r.status === "completed") return "completed";
  if (r.status === "cancelled" || r.status === "expired") return "cancelled";
  return "active";
}
