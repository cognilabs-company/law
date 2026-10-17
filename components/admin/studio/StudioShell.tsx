"use client";

import type { ReactElement, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { SxPage } from "./sx/layout/Page";
import type { SxSection } from "./sx/types";

export type StudioTab = "home" | "approvals" | "monitoring" | "settings";
export type StudioNeed = "any" | "edit" | "review" | "publish" | "admin";

export type StudioShellProps = {
  children?: ReactNode;
  title?: string;
  lead?: string;
  eyebrow?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  need?: StudioNeed;
  tabs?: boolean;
};

const SECTIONS: readonly { key: SxSection; href: string }[] = [
  { key: "approvals", href: "/admin/studio/approvals" },
  { key: "monitoring", href: "/admin/studio/monitoring" },
  { key: "settings", href: "/admin/studio/settings" },
];

export function sectionOf(pathname: string): SxSection {
  for (const s of SECTIONS) if (pathname === s.href || pathname.startsWith(`${s.href}/`)) return s.key;
  return "home";
}

export default function StudioShell(props: StudioShellProps): ReactElement {
  const { children, title, lead, actions, need = "any" } = props;
  const t = useTranslations("studio");
  const section = sectionOf(usePathname());
  return (
    <SxPage title={title || t("sx.ui.studio")} section={section} lead={lead || undefined} actions={actions} need={need}>
      <div className="stu-body">{children}</div>
    </SxPage>
  );
}
