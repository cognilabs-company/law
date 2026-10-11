// What part of the product a path belongs to, and which object it has open
// — shared by the Live Office heartbeat (guide §9) and the product feedback
// form, which fills page_url / entity_type / entity_id from it (§15).
import type { HeartbeatInput } from "@/lib/services/internalLive";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const MODULES: [RegExp, string][] = [
  [/^\/(internal|admin)\/live-office/, "live_office"],
  [/^\/internal\/payroll/, "payroll"],
  [/^\/internal\/(time|schedules)|^\/internal\/me\/attendance/, "attendance"],
  [/^\/internal/, "internal_hrm"],
  [/^\/admin\/studio/, "studio"],
  [/^\/admin\/(crm|leads|sales|funnel|retention|b2b)/, "crm"],
  [/^\/(admin\/)?call-?center|^\/admin\/(calls|duty|urgent)/, "call_center"],
  [/^\/admin\/support|^\/support/, "support"],
  [/^\/admin\/(documents|templates|doc)/, "documents"],
  [/^\/admin\/(marketplace|services|packages|ads|promotions)/, "marketplace"],
  [/^\/admin/, "admin"],
  [/^\/portal\/[^/]+\/(documents|docs|document-requests|my-documents)/, "documents"],
  [/^\/portal\/[^/]+\/(lawyers|marketplace|marketplace-orders|services|promotion)/, "marketplace"],
  [/^\/portal/, "portal"],
];
// Path words that name an object kind better than the bare segment.
const KINDS: Record<string, string> = { o: "object", c: "constructor", tasks: "task", employees: "employee", units: "unit", records: "record", items: "item" };

export function contextOf(path: string, search: string, area: string): Pick<HeartbeatInput, "entity_type" | "entity_id" | "detail_url"> {
  const parts = path.split("/").filter(Boolean);
  let idx = -1;
  for (let i = parts.length - 1; i >= 0; i--) if (UUID.test(parts[i])) { idx = i; break; }
  let type = "";
  let id = "";
  if (idx >= 0) {
    id = parts[idx];
    const seg = parts[idx - 1] ?? "";
    type = `${area}_${KINDS[seg] ?? (seg.replace(/s$/, "") || "item")}`;
  } else {
    // An object opened in a drawer is in the query: ?task=…, ?employee=…
    const q = new URLSearchParams(search);
    for (const [k, v] of q) {
      if (UUID.test(v)) {
        id = v;
        type = `${area}_${k.replace(/_?id$/, "") || "item"}`;
        break;
      }
    }
  }
  return { entity_type: type || null, entity_id: id || null, detail_url: `${path}${search}` };
}


export const areaOf = (path: string): string => MODULES.find(([re]) => re.test(path))?.[1] ?? "site";
