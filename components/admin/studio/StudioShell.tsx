"use client";

import { useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { toast } from "@/lib/toast";
import { logApiError } from "@/lib/http";
import { exportStudioXlsx, useStudioAccess } from "@/lib/services/studio";
import { StudioErrorNote, StudioLoading, StudioNoAccess, StudioUnavailable, useStudioErrorText, useStudioText } from "./bits";
import { IconChartBar, IconChevronLeft, IconDownload, IconGrid, IconLayers, IconShieldCheck, IconSliders } from "@/components/icons";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
export type StudioTab = "home" | "approvals" | "monitoring" | "settings";
export type StudioNeed = "any" | "edit" | "review" | "publish" | "admin";

const TABS: { key: StudioTab; href: string; Icon: Icon; need: StudioNeed }[] = [
  { key: "home", href: "/admin/studio", Icon: IconGrid, need: "any" },
  { key: "approvals", href: "/admin/studio/approvals", Icon: IconShieldCheck, need: "review" },
  { key: "monitoring", href: "/admin/studio/monitoring", Icon: IconChartBar, need: "admin" },
  { key: "settings", href: "/admin/studio/settings", Icon: IconSliders, need: "admin" },
];

function tabOf(pathname: string): StudioTab {
  for (const tab of TABS) if (tab.key !== "home" && (pathname === tab.href || pathname.startsWith(`${tab.href}/`))) return tab.key;
  return "home";
}

export default function StudioShell({
  children,
  title,
  lead,
  eyebrow,
  icon,
  actions,
  back,
  need = "any",
  tabs = true,
}: {
  children?: ReactNode;
  title?: string;
  lead?: string;
  eyebrow?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  need?: StudioNeed;
  tabs?: boolean;
}) {
  const { t } = useStudioText();
  const errText = useStudioErrorText();
  const pathname = usePathname();
  const acc = useStudioAccess();
  const [exporting, setExporting] = useState(false);
  const active = tabOf(pathname);
  const allowed = (n: StudioNeed) =>
    n === "any" ? acc.any : n === "edit" ? acc.canEdit : n === "review" ? acc.canReview : n === "publish" ? acc.canPublish : acc.isAdmin;
  const on = acc.avail === "on";
  const blocked = on && Boolean(acc.error) && !acc.any;
  const visibleTabs = TABS.filter((x) => allowed(x.need));

  async function doExport() {
    setExporting(true);
    try {
      await exportStudioXlsx();
      toast(t("shell.exportOk"), { tone: "ok" });
    } catch (e) {
      logApiError("studio.export", e);
      toast(errText(e).text || t("shell.exportFail"), { tone: "err" });
    } finally {
      setExporting(false);
    }
  }

  let body: ReactNode;
  if (acc.avail === "checking") body = <StudioLoading rows={4} />;
  else if (acc.avail === "off") body = <StudioUnavailable />;
  else if (blocked) body = <StudioErrorNote error={acc.error} onRetry={() => void acc.reload()} />;
  else if (!allowed(need)) body = <StudioNoAccess />;
  else body = children;

  return (
    <div className="stu">
      {back ? (
        <Link href={back.href} className="stu-back" data-ai-id="admin.studio.back" data-ai-type="link" data-ai-label={back.label}>
          <IconChevronLeft aria-hidden />
          {back.label}
        </Link>
      ) : null}
      <header className="stu-head">
        <div className="stu-head__main">
          <span className="stu-head__ico">{icon ?? <IconLayers aria-hidden />}</span>
          <div className="stu-head__txt">
            <span className="stu-head__eyebrow">{eyebrow || t("eyebrow")}</span>
            <h2 className="stu-head__t">{title || t("title")}</h2>
            {lead !== "" ? <p className="stu-head__l">{lead || t("lead")}</p> : null}
          </div>
          {on && (actions || acc.isAdmin) ? (
            <div className="stu-head__acts">
              {actions}
              {acc.isAdmin ? (
                <button type="button" className="btn btn--line btn--sm" onClick={doExport} disabled={exporting} data-ai-id="admin.studio.export" data-ai-type="button" data-ai-label={t("actions.exportAll")}>
                  {exporting ? <span className="stu-spin" aria-hidden /> : <IconDownload aria-hidden />}
                  {t("actions.excel")}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {tabs && on && visibleTabs.length > 1 ? (
          <nav className="stu-tabs" aria-label={t("shell.tabs")}>
            {visibleTabs.map(({ key, href, Icon: Glyph }) => (
              <Link
                key={key}
                href={href}
                className={`stu-tab${active === key ? " on" : ""}`}
                aria-current={active === key ? "page" : undefined}
                data-ai-id={`admin.studio.tabs.${key}`}
                data-ai-type="tab"
                data-ai-label={t(`tabs.${key}`)}
              >
                <Glyph aria-hidden />
                {t(`tabs.${key}`)}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>
      <div className="stu-body">{body}</div>
    </div>
  );
}
