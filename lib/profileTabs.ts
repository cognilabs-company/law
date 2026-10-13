import { redirect } from "@/i18n/navigation";

export const PROFILE_TABS = ["personal", "payments", "complaints", "security", "notifications"] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

export const isProfileTab = (v: string | null | undefined): v is ProfileTab => !!v && (PROFILE_TABS as readonly string[]).includes(v);

type Query = Record<string, string | string[] | undefined>;

export async function redirectToProfileTab(tab: ProfileTab, params: Promise<{ locale: string }>, searchParams: Promise<Query>): Promise<never> {
  const { locale } = await params;
  const sp = await searchParams;
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (k === "tab") continue;
    const one = Array.isArray(v) ? v[0] : v;
    if (one !== undefined) query[k] = one;
  }
  query.tab = tab;
  return redirect({ href: { pathname: "/portal/client/profile", query }, locale });
}
