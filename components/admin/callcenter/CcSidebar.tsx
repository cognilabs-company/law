"use client";

import type { ComponentType, ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { IconLogo, IconLogout, IconGrid } from "@/components/icons";

export type CcNavItem = { href: string; key: string; Icon: ComponentType<{ className?: string }>; count?: number | null };

export default function CcSidebar({
  items,
  activeHref,
  labelOf,
  badge,
  open,
  mobile,
  portalHref,
  logoutLabel,
  portalLabel,
  menuLabel,
  onNavigate,
  onLogout,
  footer,
}: {
  items: CcNavItem[];
  activeHref: string;
  labelOf: (key: string) => string;
  badge: string;
  open: boolean;
  mobile: boolean;
  portalHref: string | null;
  logoutLabel: string;
  portalLabel: string;
  menuLabel: string;
  onNavigate: () => void;
  onLogout: () => void;
  footer?: ReactNode;
}) {
  return (
    <aside className={`ccsb${open ? " on" : ""}`} inert={mobile && !open} aria-label={menuLabel}>
      <div className="ccsb__brand">
        <span className="ccsb__logo" aria-hidden="true">
          <IconLogo />
        </span>
        <span className="ccsb__name">
          LexGo
          <small>{badge}</small>
        </span>
      </div>

      <nav className="ccsb__nav" aria-label={menuLabel}>
        {items.map(({ href, key, Icon, count }) => {
          const on = activeHref === href;
          return (
            <Link
              key={href}
              href={href}
              className={`ccsb__link${on ? " on" : ""}`}
              aria-current={on ? "page" : undefined}
              data-ai-target={`nav:${key}`}
              onClick={onNavigate}
            >
              <span className="ccsb__ic" aria-hidden="true">
                <Icon />
              </span>
              <span className="ccsb__lt">{labelOf(key)}</span>
              {typeof count === "number" && count > 0 ? (
                <span className="ccsb__count cc-num" data-tone={count > 9 ? "hot" : "calm"}>
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {footer}

      <div className="ccsb__foot">
        {portalHref ? (
          <Link href={portalHref} className="ccsb__quiet" onClick={onNavigate}>
            <IconGrid />
            {portalLabel}
          </Link>
        ) : null}
        <button className="ccsb__quiet" type="button" onClick={onLogout}>
          <IconLogout />
          {logoutLabel}
        </button>
      </div>
    </aside>
  );
}
