import { redirect } from "@/i18n/navigation";

export const PROFILE_TABS = ["personal", "payments", "complaints", "security", "notifications"] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

export const isProfileTab = (v: string | null | undefined): v is ProfileTab => !!v && (PROFILE_TABS as readonly string[]).includes(v);

export function profileTabHref(tab: ProfileTab, query: Record<string, string> = {}): string {
  const sp = new URLSearchParams(tab === "personal" ? {} : { tab });
  for (const [k, v] of Object.entries(query)) if (k !== "tab") sp.set(k, v);
  const qs = sp.toString();
  return `/portal/client/profile${qs ? `?${qs}` : ""}`;
}

type Query = Record<string, string | string[] | undefined>;

export async function redirectKeepingQuery(
  pathname: string,
  params: Promise<{ locale: string }>,
  searchParams: Promise<Query>,
  set: Record<string, string> = {},
  hash = "",
): Promise<never> {
  const { locale } = await params;
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k in set) continue;
    const one = Array.isArray(v) ? v[0] : v;
    if (one !== undefined) qs.set(k, one);
  }
  for (const [k, v] of Object.entries(set)) qs.set(k, v);
  const q = qs.toString();
  return redirect({ href: `${pathname}${q ? `?${q}` : ""}${hash ? `#${hash}` : ""}`, locale });
}

export function redirectToProfileTab(tab: ProfileTab, params: Promise<{ locale: string }>, searchParams: Promise<Query>, hash = ""): Promise<never> {
  return redirectKeepingQuery("/portal/client/profile", params, searchParams, { tab }, hash);
}
