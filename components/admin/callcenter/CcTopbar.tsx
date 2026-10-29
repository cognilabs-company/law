"use client";

import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { initials } from "@/lib/lawyers";
import { IconMenu, IconClose } from "@/components/icons";
import CcStatusMenu from "./CcStatusMenu";

export default function CcTopbar({
  title,
  open,
  menuLabel,
  openCount,
  profileHref,
  userName,
  onBurger,
  tools,
}: {
  title: string;
  open: boolean;
  menuLabel: string;
  openCount: number | null;
  profileHref: string;
  userName: string;
  onBurger: () => void;
  tools: ReactNode;
}) {
  return (
    <header className="cctop">
      <button className="cctop__burger" type="button" aria-label={menuLabel} onClick={onBurger}>
        {open ? <IconClose /> : <IconMenu />}
      </button>
      <h1 data-ai-target="ai-help:current-page">{title}</h1>
      <CcStatusMenu open={openCount} />
      <div className="cctop__sp">
        {tools}
        <Link className="cctop__user" href={profileHref} title={userName} data-ai-target="header:profile">
          <span className="cctop__av">{initials(userName || "A")}</span>
        </Link>
      </div>
    </header>
  );
}
