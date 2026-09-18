import { searchUsers, listLawyers, getLawyerClients } from "@/lib/services/backend";
import { ApiError } from "@/lib/http";
import type { SearchOption } from "@/components/SearchSelect";

export type InviteUser = { id: string; name: string; phone: string; lexgoId?: string; sub?: string };
export type InviteSearch = (q: string) => Promise<SearchOption[]>;

// Who a meeting host can invite. /users/search covers every platform user but
// is staff-only (401/403 for sellers and clients): the first refusal switches
// this searcher to a cached directory of the people the account can actually
// reach — lawyers/advocates (incl. unverified) and, for sellers, their own
// clients — filtered client-side by name, phone or LexGo ID.
export function makeInviteSearch(opts: { clientLabel: string; exclude?: () => Iterable<string> }): InviteSearch {
  let dir: Promise<InviteUser[]> | null = null;
  let staffSearch = true;
  const directory = () => {
    if (!dir) {
      dir = (async () => {
        const [lawyers, clients] = await Promise.all([
          listLawyers({ includeUnverified: true }).catch(() => []),
          getLawyerClients().catch(() => []),
        ]);
        const seen = new Set<string>();
        const out: InviteUser[] = [];
        for (const l of lawyers) if (l.userId && !seen.has(l.userId)) { seen.add(l.userId); out.push({ id: l.userId, name: l.name, phone: l.phone, lexgoId: l.publicId, sub: l.region }); }
        for (const c of clients) if (c.id && !seen.has(c.id)) { seen.add(c.id); out.push({ id: c.id, name: c.name, phone: c.phone, sub: opts.clientLabel }); }
        return out;
      })();
    }
    return dir;
  };
  return async (q: string) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const digits = needle.replace(/\D/g, "");
    let users: InviteUser[] = [];
    if (staffSearch) {
      try {
        users = (await searchUsers(q)).map((u) => ({ id: u.id, name: u.name, phone: u.phone, lexgoId: u.lexgoId }));
      } catch (e) {
        if (!(e instanceof ApiError && (e.status === 403 || e.status === 401 || e.status === 404))) throw e;
        staffSearch = false;
      }
    }
    if (!staffSearch) {
      users = (await directory())
        .filter((u) => {
          const hay = `${u.name} ${u.phone} ${u.lexgoId ?? ""}`.toLowerCase();
          return hay.includes(needle) || (digits.length >= 4 && u.phone.replace(/\D/g, "").includes(digits));
        })
        .slice(0, 12);
    }
    const skip = new Set(opts.exclude ? opts.exclude() : []);
    return users
      .filter((u) => u.id && !skip.has(u.id))
      .map((u) => ({ value: u.id, label: u.name || u.phone || "—", sub: [u.phone, u.lexgoId, u.sub].filter(Boolean).join(" · ") || undefined }));
  };
}
