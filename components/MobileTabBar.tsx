"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { openChat } from "@/lib/chatBus";
import { IconHome, IconGrid, IconSparkle, IconUser, IconCard } from "./icons";

export default function MobileTabBar() {
  const t = useTranslations("tabbar");
  const pathname = usePathname();
  const is = (p: string) => (pathname === p ? " on" : "");

  return (
    <nav className="tabbar" aria-label={t("aria")}>
      <div className="tabbar__in">
        <Link className={`tb${is("/")}`} href="/">
          <IconHome />
          {t("home")}
        </Link>
        <Link className={`tb${is("/services")}`} href="/services">
          <IconGrid />
          {t("services")}
        </Link>
        <button className="tb" type="button" onClick={openChat}>
          <IconSparkle />
          {t("ai")}
        </button>
        <Link className={`tb${is("/lawyers")}`} href="/lawyers">
          <IconUser />
          {t("lawyers")}
        </Link>
        <Link className={`tb${is("/subscription")}`} href="/subscription">
          <IconCard />
          {t("subscription")}
        </Link>
      </div>
    </nav>
  );
}
